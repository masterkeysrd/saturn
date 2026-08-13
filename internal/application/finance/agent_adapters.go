package financeapp

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"time"

	agentapp "github.com/masterkeysrd/saturn/internal/application/agent"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/agent"
)

//go:embed prompts/hyperion.md
var hyperionPrompt string

func init() {
	// Register the Hyperion ingestion agent template at startup
	agent.RegisterAgent(agent.AgentDescriptor{
		Purpose:                  "INBOX_PARSER",
		DisplayName:              "Hyperion",
		Description:              "Deploys Hyperion, the autonomous financial ingestion agent that processes bank notifications, receipts, and invoices.",
		DefaultTags:              []string{"finance", "ingestion", "parser"},
		DefaultSystemInstruction: hyperionPrompt,
		DefaultPromptTemplate: `<email_body>
{{.email_body}}
</email_body>`,
		RequiredResponseSchema: `{{if .classify}}{
  "type": "object",
  "properties": {
    "classification": { "type": "string", "enum": ["INVOICE", "RECEIPT", "BANK_NOTIFICATION", "UNKNOWN"] }
  },
  "required": ["classification"]
}{{else if .extract}}{
  "type": "object",
  "properties": {
    "reference_number": { "type": ["string", "null"] },
    "transaction_type": { "type": "string", "enum": ["EXPENSE", "INCOME", "TRANSFER", "REFUND"] },
    "date": { "type": "string", "format": "date-time" },
    "amount": { "type": "number" },
    "currency": { "type": "string" },
    "counterparty": { "type": "string" },
    "source_account": {
      "type": "object",
      "properties": {
        "id": { "type": ["string", "null"] },
        "raw_name": { "type": ["string", "null"] },
        "last_four": { "type": ["string", "null"] }
      }
    },
    "destination_account": {
      "type": "object",
      "properties": {
        "id": { "type": ["string", "null"] },
        "raw_name": { "type": ["string", "null"] },
        "last_four": { "type": ["string", "null"] }
      }
    },
    "suggested_budget": { "type": ["string", "null"] },
    "suggested_borrowing": { "type": ["string", "null"] },
    "suggested_transfer_leg": { "type": ["string", "null"], "enum": ["SOURCE", "DESTINATION", null] }
  },
  "required": ["transaction_type", "date", "amount", "currency", "counterparty", "source_account"]
}{{else if .dedup}}{
  "type": "object",
  "properties": {
    "is_duplicate": { "type": "boolean" },
    "duplicate_transaction_id": { "type": ["string", "null"] },
    "reason": { "type": "string" }
  },
  "required": ["is_duplicate", "duplicate_transaction_id", "reason"]
}{{end}}`,
	})
}

// AgentDocumentClassifier implements DocumentClassifier using agent coordinator.
type AgentDocumentClassifier struct {
	coordinator *agentapp.Coordinator
}

func NewAgentDocumentClassifier(c *agentapp.Coordinator) *AgentDocumentClassifier {
	return &AgentDocumentClassifier{coordinator: c}
}

func (a *AgentDocumentClassifier) Classify(ctx context.Context, spaceID string, doc string) (string, error) {
	rawJSON, err := a.coordinator.ExecuteAgent(ctx, agentapp.ExecutionRequest{
		SpaceID: spaceID,
		Purpose: "INBOX_PARSER",
		Params: map[string]any{
			"email_body":         doc,
			"classify":           true,
			"reference_date_utc": time.Now().UTC().Format(time.RFC3339),
		},
	})
	if err != nil {
		return "", err
	}

	var out struct {
		Classification string `json:"classification"`
	}
	if err := json.Unmarshal([]byte(cleanJSON(rawJSON)), &out); err != nil {
		return "RECEIPT", nil // Fallback
	}
	return out.Classification, nil
}

// AgentIngestionParser implements IngestionParser using agent coordinator.
type AgentIngestionParser struct {
	coordinator *agentapp.Coordinator
}

func NewAgentIngestionParser(c *agentapp.Coordinator) *AgentIngestionParser {
	return &AgentIngestionParser{coordinator: c}
}

func (a *AgentIngestionParser) Parse(ctx context.Context, spaceID string, doc string, ingestionCtx IngestionContext) (*ParsedTransaction, error) {
	type accountTxInfo struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		Type        string `json:"type"`
		LastFour    string `json:"last_four"`
		Currency    string `json:"currency"`
		Institution string `json:"institution,omitempty"`
	}

	instMap := make(map[string]string)
	for _, inst := range ingestionCtx.Institutions {
		instMap[string(inst.ID)] = inst.Name
	}

	var accountInfos []accountTxInfo
	for _, acc := range ingestionCtx.Accounts {
		instName := ""
		if acc.InstitutionID != nil {
			instName = instMap[string(*acc.InstitutionID)]
		}
		accountInfos = append(accountInfos, accountTxInfo{
			ID:          string(acc.ID),
			Name:        acc.Name,
			Type:        string(acc.Type),
			LastFour:    acc.LastFour,
			Currency:    string(acc.Currency),
			Institution: instName,
		})
	}

	type scheduledTransactionInfo struct {
		ID         string
		SourceType string
		Amount     float64
		Currency   string
		DueDate    string
		Status     string
		Type       string
	}
	var paymentInfos []scheduledTransactionInfo
	for _, p := range ingestionCtx.ScheduledTransactions {
		paymentInfos = append(paymentInfos, scheduledTransactionInfo{
			ID:         string(p.ID),
			SourceType: p.SourceType,
			Amount:     float64(p.Amount) / 100.0,
			Currency:   string(p.Currency),
			DueDate:    p.DueDate.Format(time.RFC3339),
			Status:     string(p.Status),
			Type:       string(p.Type),
		})
	}

	type recurringTransactionInfo struct {
		ID          string
		Name        string
		Amount      float64
		Currency    string
		Interval    string
		NextDueDate string
		Status      string
		Type        string
	}
	var recurringInfos []recurringTransactionInfo
	for _, re := range ingestionCtx.RecurringTransactions {
		recurringInfos = append(recurringInfos, recurringTransactionInfo{
			ID:          string(re.ID),
			Name:        re.Name,
			Amount:      float64(re.Amount) / 100.0,
			Currency:    string(re.Currency),
			Interval:    string(re.Interval),
			NextDueDate: re.NextDueDate.Format(time.RFC3339),
			Status:      string(re.Status),
			Type:        string(re.Type),
		})
	}

	type borrowingInfo struct {
		ID              string
		Direction       string
		Counterparty    string
		TotalAmount     float64
		RemainingAmount float64
		Currency        string
	}
	var borrowingInfos []borrowingInfo
	for _, b := range ingestionCtx.Borrowings {
		borrowingInfos = append(borrowingInfos, borrowingInfo{
			ID:              string(b.ID),
			Direction:       string(b.Direction),
			Counterparty:    b.Counterparty,
			TotalAmount:     float64(b.TotalAmount) / 100.0,
			RemainingAmount: float64(b.RemainingAmount) / 100.0,
			Currency:        string(b.Currency),
		})
	}

	rawJSON, err := a.coordinator.ExecuteAgent(ctx, agentapp.ExecutionRequest{
		SpaceID: spaceID,
		Purpose: "INBOX_PARSER",
		Params: map[string]any{
			"extract":                true,
			"reference_date_utc":     ingestionCtx.ReferenceDate.UTC().Format(time.RFC3339),
			"budgets":                ingestionCtx.Budgets,
			"accounts":               accountInfos,
			"scheduled_transactions": paymentInfos,
			"recurring_transactions": recurringInfos,
			"borrowings":             borrowingInfos,
			"email_body":             doc,
		},
	})
	if err != nil {
		return nil, err
	}

	type ExtractedAccount struct {
		ID       string `json:"id"`
		RawName  string `json:"raw_name"`
		LastFour string `json:"last_four"`
	}

	cleanedJSON := cleanJSON(rawJSON)
	var extracted struct {
		ReferenceNumber      string           `json:"reference_number"`
		TransactionType      string           `json:"transaction_type"`
		Date                 string           `json:"date"`
		Amount               float64          `json:"amount"`
		Currency             string           `json:"currency"`
		Counterparty         string           `json:"counterparty"`
		SourceAccount        ExtractedAccount `json:"source_account"`
		DestinationAccount   ExtractedAccount `json:"destination_account"`
		SuggestedBudget      *string          `json:"suggested_budget"`
		SuggestedBorrowing   *string          `json:"suggested_borrowing"`
		SuggestedTransferLeg *string          `json:"suggested_transfer_leg"`
	}

	if err := json.Unmarshal([]byte(cleanedJSON), &extracted); err != nil {
		return nil, fmt.Errorf("decode extractor output: %w", err)
	}

	suggestedBudget := ""
	if extracted.SuggestedBudget != nil {
		suggestedBudget = *extracted.SuggestedBudget
	}

	suggestedBorrowing := ""
	if extracted.SuggestedBorrowing != nil {
		suggestedBorrowing = *extracted.SuggestedBorrowing
	}

	suggestedTransferLeg := "SOURCE"
	if extracted.SuggestedTransferLeg != nil {
		suggestedTransferLeg = *extracted.SuggestedTransferLeg
	}

	return &ParsedTransaction{
		ReferenceNumber:      extracted.ReferenceNumber,
		TransactionType:      extracted.TransactionType,
		Date:                 extracted.Date,
		Amount:               int64(extracted.Amount * 100),
		Currency:             extracted.Currency,
		Counterparty:         extracted.Counterparty,
		CardLastFour:         extracted.SourceAccount.LastFour,
		SourceAccountID:      extracted.SourceAccount.ID,
		SourceAccountName:    extracted.SourceAccount.RawName,
		DestAccountID:        extracted.DestinationAccount.ID,
		DestAccountName:      extracted.DestinationAccount.RawName,
		DestAccountLastFour:  extracted.DestinationAccount.LastFour,
		SuggestedBudget:      suggestedBudget,
		SuggestedBorrowing:   suggestedBorrowing,
		SuggestedTransferLeg: suggestedTransferLeg,
		RawOutput:            rawJSON,
	}, nil
}

// AgentIngestionDeduplicator implements IngestionDeduplicator using agent coordinator.
type AgentIngestionDeduplicator struct {
	coordinator *agentapp.Coordinator
}

func NewAgentIngestionDeduplicator(c *agentapp.Coordinator) *AgentIngestionDeduplicator {
	return &AgentIngestionDeduplicator{coordinator: c}
}

func (d *AgentIngestionDeduplicator) Deduplicate(ctx context.Context, spaceID string, tx *ParsedTransaction, recent []*finance.Transaction) (*DeduplicationResult, error) {
	type recentTxInfo struct {
		ID              string
		Amount          float64
		Currency        string
		Description     string
		TransactionDate string
	}
	var recentInfos []recentTxInfo
	for _, r := range recent {
		recentInfos = append(recentInfos, recentTxInfo{
			ID:              string(r.ID),
			Amount:          float64(r.Amount) / 100.0,
			Currency:        string(r.Currency),
			Description:     r.Description,
			TransactionDate: r.TransactionDate.Format(time.RFC3339),
		})
	}

	rawJSON, err := d.coordinator.ExecuteAgent(ctx, agentapp.ExecutionRequest{
		SpaceID: spaceID,
		Purpose: "INBOX_PARSER",
		Params: map[string]any{
			"dedup": true,
			"extracted_transaction": map[string]any{
				"Amount":   float64(tx.Amount) / 100.0,
				"Currency": tx.Currency,
				"Vendor":   tx.Counterparty,
				"Date":     tx.Date,
			},
			"recent_transactions": recentInfos,
			"reference_date_utc":  time.Now().UTC().Format(time.RFC3339),
		},
	})
	if err != nil {
		return nil, err
	}

	cleanedJSON := cleanJSON(rawJSON)

	var result struct {
		IsDuplicate            bool    `json:"is_duplicate"`
		DuplicateTransactionID *string `json:"duplicate_transaction_id"`
		Reason                 string  `json:"reason"`
	}
	if err := json.Unmarshal([]byte(cleanedJSON), &result); err != nil {
		return nil, fmt.Errorf("decode deduplicator output: %w", err)
	}

	dupID := ""
	if result.DuplicateTransactionID != nil {
		dupID = *result.DuplicateTransactionID
	}

	return &DeduplicationResult{
		IsDuplicate:            result.IsDuplicate,
		DuplicateTransactionID: dupID,
		Reason:                 result.Reason,
	}, nil
}
