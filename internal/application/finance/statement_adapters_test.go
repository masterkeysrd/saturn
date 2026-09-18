package financeapp

import (
	"context"
	"errors"
	"testing"

	agentapp "github.com/masterkeysrd/saturn/internal/application/agent"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type mockAgentCoordinator struct {
	agentapp.Coordinator
	executeAgentFunc func(ctx context.Context, req agentapp.ExecutionRequest) (string, error)
}

func (m *mockAgentCoordinator) ExecuteAgent(ctx context.Context, req agentapp.ExecutionRequest) (string, error) {
	if m.executeAgentFunc != nil {
		return m.executeAgentFunc(ctx, req)
	}
	return "", nil
}

func TestAgentStatementExtractor_Extract(t *testing.T) {
	tests := []struct {
		name          string
		accounts      []*finance.Account
		docText       string
		mockExec      func(ctx context.Context, req agentapp.ExecutionRequest) (string, error)
		expectedError bool
		validate      func(t *testing.T, doc *ParsedStatementDocument)
	}{
		{
			name: "Success with full document details",
			accounts: []*finance.Account{
				{
					ID:       "acc_1",
					Name:     "Checking",
					Type:     finance.AccountTypeBank,
					LastFour: "1111",
					Currency: "USD",
				},
			},
			docText: "Statement text for Chase",
			mockExec: func(ctx context.Context, req agentapp.ExecutionRequest) (string, error) {
				if req.Purpose != "STATEMENT_PARSER" || req.SpaceID != "spc_1" {
					t.Errorf("unexpected execution request: %+v", req)
				}
				return `
				{
					"institution_name": "Chase",
					"card_last_four": "1111",
					"statement_date": "2026-09-01",
					"period_start_date": "2026-08-01",
					"period_end_date": "2026-08-31",
					"sections": [
						{
							"currency": "usd",
							"card_last_four": "2222",
							"suggested_account_id": "acc_1",
							"starting_balance": 100.50,
							"ending_balance": 150.75,
							"total_credits": 60.25,
							"total_debits": 10.00,
							"lines": [
								{
									"date_str": "2026-08-15",
									"description": "Coffee Shop",
									"amount": -5.50,
									"reference": "REF123"
								}
							]
						}
					]
				}
				`, nil
			},
			expectedError: false,
			validate: func(t *testing.T, doc *ParsedStatementDocument) {
				if doc.InstitutionName != "Chase" || doc.CardLastFour != "1111" {
					t.Errorf("unexpected doc metadata: %+v", doc)
				}
				if len(doc.Sections) != 1 {
					t.Fatalf("expected 1 section, got %d", len(doc.Sections))
				}
				sec := doc.Sections[0]
				if sec.Currency != "USD" || sec.StartingBalance != 10050 || sec.EndingBalance != 15075 {
					t.Errorf("unexpected balances/currency: %+v", sec)
				}
				if sec.CardLastFour != "2222" || sec.SuggestedAccountID != "acc_1" {
					t.Errorf("unexpected section identifiers: %+v", sec)
				}
				if sec.TotalCredits != 6025 || sec.TotalDebits != 1000 {
					t.Errorf("unexpected section totals: credits=%d, debits=%d", sec.TotalCredits, sec.TotalDebits)
				}
				if len(sec.Lines) != 1 {
					t.Fatalf("expected 1 line, got %d", len(sec.Lines))
				}
				line := sec.Lines[0]
				if line.Amount != -550 || line.Description != "Coffee Shop" || line.Reference == nil || *line.Reference != "REF123" {
					t.Errorf("unexpected line: %+v", line)
				}
			},
		},
		{
			name:     "Fallback cardLastFour to doc header",
			accounts: nil,
			docText:  "Doc",
			mockExec: func(ctx context.Context, req agentapp.ExecutionRequest) (string, error) {
				return "```json\n" + `
				{
					"institution_name": "Bank of America",
					"card_last_four": "9999",
					"sections": [
						{
							"currency": "EUR",
							"starting_balance": 10.0,
							"ending_balance": 20.0
						}
					]
				}
				` + "\n```", nil
			},
			expectedError: false,
			validate: func(t *testing.T, doc *ParsedStatementDocument) {
				if len(doc.Sections) != 1 || doc.Sections[0].CardLastFour != "9999" {
					t.Errorf("expected cardLastFour fallback 9999, got %+v", doc)
				}
			},
		},
		{
			name:     "Agent execution error",
			accounts: nil,
			docText:  "Doc",
			mockExec: func(ctx context.Context, req agentapp.ExecutionRequest) (string, error) {
				return "", errors.New("agent execution failed")
			},
			expectedError: true,
		},
		{
			name:     "Malformed JSON from agent",
			accounts: nil,
			docText:  "Doc",
			mockExec: func(ctx context.Context, req agentapp.ExecutionRequest) (string, error) {
				return "not-json-content", nil
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			extractor := NewAgentStatementExtractor(&mockAgentCoordinator{
				executeAgentFunc: tc.mockExec,
			})
			doc, err := extractor.Extract(context.Background(), "spc_1", tc.docText, tc.accounts)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tc.validate != nil {
				tc.validate(t, doc)
			}
		})
	}
}

func TestToCents(t *testing.T) {
	tests := []struct {
		name     string
		input    float64
		expected int64
	}{
		{name: "Zero", input: 0.0, expected: 0},
		{name: "Positive whole", input: 15.0, expected: 1500},
		{name: "Positive decimal", input: 12.34, expected: 1234},
		{name: "Rounding up", input: 12.346, expected: 1235},
		{name: "Rounding down", input: 12.344, expected: 1234},
		{name: "Negative decimal", input: -49.99, expected: -4999},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := toCents(tc.input)
			if got != tc.expected {
				t.Errorf("toCents(%f) = %d, expected %d", tc.input, got, tc.expected)
			}
		})
	}
}
