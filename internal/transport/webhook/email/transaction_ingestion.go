package email

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"mime/multipart"
	"net/mail"
	"strings"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/email"
	"github.com/masterkeysrd/saturn/internal/platform/integration"
)

// FinanceService interface outlines the business logic dependencies.
type FinanceService interface {
	IngestEmail(ctx context.Context, spaceID string, integrationID string, sender, subject, body string) (*finance.InboxItem, error)
}

// TransactionIngestionProvider implements integration.Provider for email forwarding.
type TransactionIngestionProvider struct {
	registry       *integration.Registry
	financeService FinanceService
	globalSecret   string
}

// NewTransactionIngestionProvider instantiates a new Email forwarding TransactionIngestionProvider.
func NewTransactionIngestionProvider(registry *integration.Registry, financeService FinanceService, globalSecret string) *TransactionIngestionProvider {
	return &TransactionIngestionProvider{
		registry:       registry,
		financeService: financeService,
		globalSecret:   globalSecret,
	}
}

func (p *TransactionIngestionProvider) Provider() string { return "email" }
func (p *TransactionIngestionProvider) Kind() string     { return "transaction_ingestion" }
func (p *TransactionIngestionProvider) Descriptor() integration.Descriptor {
	return integration.Descriptor{
		Provider:    "email",
		Kind:        "transaction_ingestion",
		Name:        "Email Ingestion",
		Description: "Forward banking alerts and invoices to automatically draft transactions.",
		Icon:        "mail",
		ConfigSchema: `{
			"type": "object",
			"properties": {
				"allowed_senders": {
					"type": "array",
					"items": { "type": "string", "format": "email" },
					"title": "Allowed Sender Email Addresses"
				},
				"pdf_passwords": {
					"type": "array",
					"items": { "type": "string" },
					"title": "PDF Decryption Passwords"
				}
			},
			"required": ["allowed_senders"]
		}`,
		RequestSchema: `{
			"type": "object",
			"properties": {
				"sender": { "type": "string", "format": "email", "title": "Sender Email Address" },
				"subject": { "type": "string", "title": "Email Subject Line" },
				"body": { "type": "string", "title": "Raw Email Body Contents" }
			},
			"required": ["sender", "subject", "body"]
		}`,
		ResponseSchema: `{
			"type": "object",
			"properties": {
				"success": { "type": "boolean" },
				"message": { "type": "string" }
			}
		}`,
		SamplePayload: `{
  "sender": "alerts@chase.com",
  "subject": "Chase Credit Card Alert: USD 45.00 charged at Netflix",
  "body": "Chase Transaction Alert:\nAccount ending in *1234\nAmount: USD 45.00\nMerchant: Netflix.com\nTime: 2026-07-23T20:00:00Z"
}`,
	}
}

// Verify authenticates that the incoming request originates from a trusted forwarder using the global secret.
func (p *TransactionIngestionProvider) Verify(ctx context.Context, headers map[string][]string, body []byte) error {
	auths, exists := headers["Authorization"]
	if !exists || len(auths) == 0 {
		return errors.New("missing Authorization header")
	}

	authVal := auths[0]
	if !strings.HasPrefix(authVal, "Bearer ") {
		return errors.New("authorization header must be a Bearer token")
	}

	token := strings.TrimPrefix(authVal, "Bearer ")
	if token != p.globalSecret {
		return errors.New("invalid global webhook secret")
	}

	return nil
}

// Process parses the raw multipart SMTP message, resolves the Space, and triggers ingestion.
func (p *TransactionIngestionProvider) Process(ctx context.Context, spaceID string, headers map[string][]string, body []byte) error {
	// Parse the top-level SMTP headers first to locate the recipient address
	msg, err := mail.ReadMessage(bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("read email message headers: %w", err)
	}

	toHeader := msg.Header.Get("To")
	toAddr, err := mail.ParseAddress(toHeader)
	if err != nil {
		return fmt.Errorf("parse recipient address: %w", err)
	}
	toEmail := toAddr.Address

	// Extract integration token from the suffix recipient address (e.g. alerts+saturn_int_xxx@yourdomain.com)
	plusIdx := strings.Index(toEmail, "+")
	if plusIdx == -1 {
		return fmt.Errorf("invalid recipient email format, missing + symbol: %q", toEmail)
	}
	atIdx := strings.Index(toEmail[plusIdx:], "@")
	if atIdx == -1 {
		return fmt.Errorf("invalid recipient email format, missing @ symbol: %q", toEmail)
	}
	token := toEmail[plusIdx+1 : plusIdx+atIdx]
	if token == "" {
		return fmt.Errorf("empty integration token in recipient email: %q", toEmail)
	}

	// Resolve the integration settings and space ID via the hashed token lookup
	integrationRecord, err := p.registry.ResolveByToken(ctx, token)
	if err != nil {
		return fmt.Errorf("resolve integration token: %w", err)
	}

	if integrationRecord.Provider != p.Provider() {
		return fmt.Errorf("token belongs to a different provider: %q", integrationRecord.Provider)
	}

	// Unmarshal config and verify sender is in the whitelist
	var cfg struct {
		AllowedSenders []string `json:"allowed_senders"`
		PDFPasswords   []string `json:"pdf_passwords"`
	}
	if err := json.Unmarshal([]byte(integrationRecord.Config), &cfg); err != nil {
		return fmt.Errorf("unmarshal integration config: %w", err)
	}

	// Parse the email body and decrypt attachments using configured keys
	parsedEmail, err := email.Parse(bytes.NewReader(body), cfg.PDFPasswords)
	if err != nil {
		return fmt.Errorf("parse email: %w", err)
	}

	allowed := false
	fromLower := strings.ToLower(parsedEmail.Sender)
	senderAddr, err := mail.ParseAddress(parsedEmail.Sender)
	if err == nil {
		fromLower = strings.ToLower(senderAddr.Address)
	}
	for _, allowedEmail := range cfg.AllowedSenders {
		if strings.ToLower(allowedEmail) == fromLower {
			allowed = true
			break
		}
	}

	if !allowed {
		return fmt.Errorf("sender %q is not whitelisted for this space integration", parsedEmail.Sender)
	}

	// Append any decrypted PDF text contents to the main body payload for LLM extraction
	fullBody := parsedEmail.Body
	for _, att := range parsedEmail.Attachments {
		if att.Text != "" {
			fullBody += "\n\n--- Attachment: " + att.Filename + " ---\n" + att.Text
		}
	}

	// Safeguard: truncate extremely large email bodies before sending to LLM
	if len(fullBody) > 50000 {
		fullBody = fullBody[:50000] + "\n\n[Truncated due to length]"
	}

	// Trigger core finance ingestion logic
	_, err = p.financeService.IngestEmail(ctx, integrationRecord.SpaceID, integrationRecord.ID, fromLower, parsedEmail.Subject, fullBody)
	if err != nil {
		return fmt.Errorf("ingest email transaction: %w", err)
	}

	return nil
}

// Simulate simulates parsing a mock payload (either JSON or multipart) and triggers ingestion.
func (p *TransactionIngestionProvider) Simulate(ctx context.Context, spaceID string, headers map[string][]string, body []byte) (any, error) {
	contentType := headers["Content-Type"]
	var sender, subject, text string

	if len(contentType) > 0 && strings.Contains(contentType[0], "application/json") {
		// Decode mock email fields from generic JSON payload
		var payload struct {
			Sender  string `json:"sender"`
			Subject string `json:"subject"`
			Body    string `json:"body"`
		}
		if err := json.Unmarshal(body, &payload); err != nil {
			return nil, fmt.Errorf("decode json payload: %w", err)
		}
		sender = payload.Sender
		subject = payload.Subject
		text = payload.Body
	} else {
		// Fallback to standard multipart form simulation
		mediaType, params, err := mime.ParseMediaType(contentType[0])
		if err != nil {
			return nil, fmt.Errorf("parse media type: %w", err)
		}
		if !strings.HasPrefix(mediaType, "multipart/") {
			return nil, errors.New("request must be application/json or multipart/form-data")
		}
		boundary := params["boundary"]
		mr := multipart.NewReader(bytes.NewReader(body), boundary)
		form, err := mr.ReadForm(32 << 20)
		if err != nil {
			return nil, fmt.Errorf("read multipart form: %w", err)
		}
		defer func() { _ = form.RemoveAll() }()

		fromValues := form.Value["from"]
		subjectValues := form.Value["subject"]
		textValues := form.Value["text"]

		if len(fromValues) > 0 {
			sender = fromValues[0]
		}
		if len(subjectValues) > 0 {
			subject = subjectValues[0]
		}
		if len(textValues) > 0 {
			text = textValues[0]
		}
	}

	if sender == "" {
		return nil, errors.New("sender is required")
	}
	if subject == "" {
		return nil, errors.New("subject is required")
	}
	if text == "" {
		return nil, errors.New("body is required")
	}

	// Look up active integration record specifically by kind
	integrationRecord, err := p.registry.Get(ctx, integration.GetIntegration{
		SpaceID:  spaceID,
		Provider: p.Provider(),
		Kind:     p.Kind(),
	})
	if err != nil {
		return nil, fmt.Errorf("get integration settings: %w", err)
	}
	if integrationRecord == nil || !integrationRecord.IsEnabled {
		return nil, errors.New("integration is not enabled or configured")
	}

	// Verify whitelisted sender from active integration config
	var cfg struct {
		AllowedSenders []string `json:"allowed_senders"`
		PDFPasswords   []string `json:"pdf_passwords"`
	}
	if err := json.Unmarshal([]byte(integrationRecord.Config), &cfg); err != nil {
		return nil, fmt.Errorf("unmarshal integration config: %w", err)
	}

	// If the body looks like a raw SMTP email (pasted directly into the sandbox body text area),
	// run it through our MIME parser to extract headers, body text, and decrypt PDF attachments.
	if strings.Contains(text, "Content-Type:") || strings.HasPrefix(text, "From:") || strings.HasPrefix(text, "Received:") {
		parsedEmail, err := email.Parse(strings.NewReader(text), cfg.PDFPasswords)
		if err != nil {
			return nil, fmt.Errorf("parse raw SMTP email: %w", err)
		}
		sender = parsedEmail.Sender
		senderAddr, err := mail.ParseAddress(parsedEmail.Sender)
		if err == nil {
			sender = senderAddr.Address
		}
		subject = parsedEmail.Subject
		text = parsedEmail.Body
		for _, att := range parsedEmail.Attachments {
			if att.Text != "" {
				text += "\n\n--- Attachment: " + att.Filename + " ---\n" + att.Text
			}
		}
	}

	allowed := false
	fromLower := strings.ToLower(sender)
	for _, allowedEmail := range cfg.AllowedSenders {
		if strings.ToLower(allowedEmail) == fromLower {
			allowed = true
			break
		}
	}

	if !allowed {
		return nil, fmt.Errorf("sender %q is not whitelisted for this space integration", sender)
	}

	// Safeguard: truncate extremely large email bodies before sending to LLM
	if len(text) > 50000 {
		text = text[:50000] + "\n\n[Truncated due to length]"
	}

	return p.financeService.IngestEmail(ctx, spaceID, integrationRecord.ID, sender, subject, text)
}
