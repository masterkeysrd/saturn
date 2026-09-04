package financeapp

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"math"
	"strings"

	agentapp "github.com/masterkeysrd/saturn/internal/application/agent"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/agent"
)

//go:embed prompts/janus.md
var janusPrompt string

func init() {
	// Register the Janus statement and reconciliation agent template at startup
	agent.RegisterAgent(agent.AgentDescriptor{
		Purpose:     "STATEMENT_PARSER",
		DisplayName: "Janus",
		Description: "Deploys Janus, the autonomous financial statement and reconciliation audit agent that extracts multi-currency ledgers, balances, and line items.",
		DefaultTags: []string{"finance", "statement", "reconciliation", "audit", "janus"},
		DefaultPromptTemplate: `{{if .accounts}}
<accounts>
  Available accounts in this Saturn workspace to match against:
  {{range .accounts}}
  <account id="{{.ID}}" name="{{.Name}}" type="{{.Type}}" last_four="{{.LastFour}}" currency="{{.Currency}}" />
  {{end}}
</accounts>
{{end}}

<document_text>
{{.document_text}}
</document_text>`,
		RequiredResponseSchema: `{
  "type": "object",
  "properties": {
    "institution_name": { "type": "string" },
    "card_last_four": { "type": ["string", "null"] },
    "statement_date": { "type": "string" },
    "period_start_date": { "type": ["string", "null"] },
    "period_end_date": { "type": ["string", "null"] },
    "sections": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "currency": { "type": "string" },
          "card_last_four": { "type": ["string", "null"] },
          "suggested_account_id": { "type": ["string", "null"] },
          "starting_balance": { "type": "number" },
          "ending_balance": { "type": "number" },
          "total_credits": { "type": ["number", "null"] },
          "total_debits": { "type": ["number", "null"] },
          "lines": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "date_str": { "type": "string" },
                "description": { "type": "string" },
                "amount": { "type": "number" },
                "reference": { "type": ["string", "null"] }
              },
              "required": ["date_str", "description", "amount"]
            }
          }
        },
        "required": ["currency", "starting_balance", "ending_balance", "lines"]
      }
    }
  },
  "required": ["institution_name", "statement_date", "sections"]
}`,
	})
}

// ParsedStatementDocument represents the extracted multi-section statement document.
type ParsedStatementDocument struct {
	InstitutionName string                   `json:"institution_name"`
	CardLastFour    string                   `json:"card_last_four,omitempty"`
	StatementDate   string                   `json:"statement_date"`
	PeriodStartDate string                   `json:"period_start_date,omitempty"`
	PeriodEndDate   string                   `json:"period_end_date,omitempty"`
	Sections        []ParsedStatementSection `json:"sections"`
}

// ParsedStatementSection represents an isolated single-currency ledger within a statement.
type ParsedStatementSection struct {
	Currency           string                `json:"currency"`
	CardLastFour       string                `json:"card_last_four,omitempty"`
	SuggestedAccountID string                `json:"suggested_account_id,omitempty"`
	StartingBalance    int64                 `json:"starting_balance"` // Cents
	EndingBalance      int64                 `json:"ending_balance"`   // Cents
	TotalCredits       int64                 `json:"total_credits"`    // Cents
	TotalDebits        int64                 `json:"total_debits"`     // Cents
	Lines              []ParsedStatementLine `json:"lines"`
}

// ParsedStatementLine represents a single transaction line inside a section.
type ParsedStatementLine struct {
	DateStr     string  `json:"date_str"`
	Description string  `json:"description"`
	Amount      int64   `json:"amount"` // Signed cents (- for debit, + for credit)
	Reference   *string `json:"reference,omitempty"`
	RawText     string  `json:"raw_text,omitempty"`
}

// StatementExtractor defines the contract for extracting statement text into structured documents.
type StatementExtractor interface {
	Extract(ctx context.Context, spaceID string, docText string, accounts []*finance.Account) (*ParsedStatementDocument, error)
}

// AgentStatementExtractor implements StatementExtractor using agent coordinator.
type AgentStatementExtractor struct {
	coordinator *agentapp.Coordinator
}

// NewAgentStatementExtractor creates a new AgentStatementExtractor.
func NewAgentStatementExtractor(c *agentapp.Coordinator) *AgentStatementExtractor {
	return &AgentStatementExtractor{coordinator: c}
}

// rawStatementJSON matches the LLM JSON output before float->cents conversion.
type rawStatementJSON struct {
	InstitutionName string `json:"institution_name"`
	CardLastFour    string `json:"card_last_four"`
	StatementDate   string `json:"statement_date"`
	PeriodStartDate string `json:"period_start_date"`
	PeriodEndDate   string `json:"period_end_date"`
	Sections        []struct {
		Currency           string   `json:"currency"`
		CardLastFour       *string  `json:"card_last_four"`
		SuggestedAccountID *string  `json:"suggested_account_id"`
		StartingBalance    float64  `json:"starting_balance"`
		EndingBalance      float64  `json:"ending_balance"`
		TotalCredits       *float64 `json:"total_credits"`
		TotalDebits        *float64 `json:"total_debits"`
		Lines              []struct {
			DateStr     string  `json:"date_str"`
			Description string  `json:"description"`
			Amount      float64 `json:"amount"`
			Reference   *string `json:"reference"`
		} `json:"lines"`
	} `json:"sections"`
}

// Extract analyzes statement text and converts it into a typed ParsedStatementDocument.
func (a *AgentStatementExtractor) Extract(ctx context.Context, spaceID string, docText string, accounts []*finance.Account) (*ParsedStatementDocument, error) {
	type accountInfo struct {
		ID       string `json:"ID"`
		Name     string `json:"Name"`
		Type     string `json:"Type"`
		LastFour string `json:"LastFour"`
		Currency string `json:"Currency"`
	}

	var accList []accountInfo
	for _, acc := range accounts {
		accList = append(accList, accountInfo{
			ID:       string(acc.ID),
			Name:     acc.Name,
			Type:     string(acc.Type),
			LastFour: acc.LastFour,
			Currency: string(acc.Currency),
		})
	}

	rawJSON, err := a.coordinator.ExecuteAgent(ctx, agentapp.ExecutionRequest{
		SpaceID: spaceID,
		Purpose: "STATEMENT_PARSER",
		Params: map[string]any{
			"document_text": docText,
			"accounts":      accList,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("execute statement extractor agent: %w", err)
	}

	var raw rawStatementJSON
	if err := json.Unmarshal([]byte(cleanJSON(rawJSON)), &raw); err != nil {
		return nil, fmt.Errorf("unmarshal statement extractor output: %w (raw: %s)", err, rawJSON)
	}

	doc := &ParsedStatementDocument{
		InstitutionName: strings.TrimSpace(raw.InstitutionName),
		CardLastFour:    strings.TrimSpace(raw.CardLastFour),
		StatementDate:   strings.TrimSpace(raw.StatementDate),
		PeriodStartDate: strings.TrimSpace(raw.PeriodStartDate),
		PeriodEndDate:   strings.TrimSpace(raw.PeriodEndDate),
	}

	for _, s := range raw.Sections {
		sec := ParsedStatementSection{
			Currency:        strings.ToUpper(strings.TrimSpace(s.Currency)),
			StartingBalance: toCents(s.StartingBalance),
			EndingBalance:   toCents(s.EndingBalance),
		}
		if s.CardLastFour != nil && strings.TrimSpace(*s.CardLastFour) != "" {
			sec.CardLastFour = strings.TrimSpace(*s.CardLastFour)
		} else if raw.CardLastFour != "" {
			sec.CardLastFour = strings.TrimSpace(raw.CardLastFour)
		}
		if s.SuggestedAccountID != nil && strings.TrimSpace(*s.SuggestedAccountID) != "" {
			sec.SuggestedAccountID = strings.TrimSpace(*s.SuggestedAccountID)
		}
		if s.TotalCredits != nil {
			sec.TotalCredits = toCents(*s.TotalCredits)
		}
		if s.TotalDebits != nil {
			sec.TotalDebits = toCents(*s.TotalDebits)
		}

		for _, l := range s.Lines {
			var ref *string
			if l.Reference != nil && strings.TrimSpace(*l.Reference) != "" {
				cleanRef := strings.TrimSpace(*l.Reference)
				ref = &cleanRef
			}
			sec.Lines = append(sec.Lines, ParsedStatementLine{
				DateStr:     strings.TrimSpace(l.DateStr),
				Description: strings.TrimSpace(l.Description),
				Amount:      toCents(l.Amount),
				Reference:   ref,
			})
		}
		doc.Sections = append(doc.Sections, sec)
	}

	return doc, nil
}

func toCents(val float64) int64 {
	return int64(math.Round(val * 100))
}
