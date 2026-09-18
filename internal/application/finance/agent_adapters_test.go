package financeapp

import (
	"context"
	"errors"
	"testing"
	"time"

	agentapp "github.com/masterkeysrd/saturn/internal/application/agent"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

func TestAgentDocumentClassifier(t *testing.T) {
	tests := []struct {
		name          string
		mockExec      func(ctx context.Context, req agentapp.ExecutionRequest) (string, error)
		expectedCls   string
		expectedError bool
	}{
		{
			name: "Success JSON classification",
			mockExec: func(ctx context.Context, req agentapp.ExecutionRequest) (string, error) {
				return `{"classification": "INVOICE"}`, nil
			},
			expectedCls:   "INVOICE",
			expectedError: false,
		},
		{
			name: "Malformed JSON falls back to RECEIPT",
			mockExec: func(ctx context.Context, req agentapp.ExecutionRequest) (string, error) {
				return "plain text without json", nil
			},
			expectedCls:   "RECEIPT",
			expectedError: false,
		},
		{
			name: "Execute agent error",
			mockExec: func(ctx context.Context, req agentapp.ExecutionRequest) (string, error) {
				return "", errors.New("agent execution error")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			classifier := NewAgentDocumentClassifier(&mockAgentCoordinator{
				executeAgentFunc: tc.mockExec,
			})
			cls, err := classifier.Classify(context.Background(), "spc_1", "email text")
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if cls != tc.expectedCls {
				t.Errorf("expected classification %q, got %q", tc.expectedCls, cls)
			}
		})
	}
}

func TestAgentIngestionParser(t *testing.T) {
	instID := finance.InstitutionID("inst_1")
	bgt := "Tech"
	bor := "bor_1"
	leg := "DESTINATION"

	ingCtx := IngestionContext{
		ReferenceDate: time.Now(),
		Institutions: []*finance.Institution{
			{ID: instID, Name: "Chase"},
		},
		Accounts: []*finance.Account{
			{ID: "acc_1", Name: "Checking", Type: finance.AccountTypeBank, LastFour: "1111", Currency: "USD", InstitutionID: &instID},
			{ID: "acc_2", Name: "Cash", Type: finance.AccountTypeCash, Currency: "USD", InstitutionID: nil},
		},
		ScheduledTransactions: []*finance.ScheduledTransaction{
			{ID: "sched_1", SourceType: "bill", Amount: 5000, Currency: "USD", DueDate: time.Now(), Status: finance.ScheduledTransactionPending, Type: finance.TransactionTypeExpense},
		},
		RecurringTransactions: []*finance.RecurringTransaction{
			{ID: "rec_1", Name: "Netflix", Amount: 1500, Currency: "USD", Interval: "monthly", NextDueDate: time.Now(), Status: finance.RecurringTransactionActive, Type: finance.TransactionTypeExpense},
		},
		Borrowings: []*finance.Borrowing{
			{ID: "bor_1", Direction: finance.BorrowingDirectionLent, Counterparty: "Bob", TotalAmount: 10000, RemainingAmount: 5000, Currency: "USD"},
		},
	}

	tests := []struct {
		name          string
		mockExec      func(ctx context.Context, req agentapp.ExecutionRequest) (string, error)
		expectedError bool
		validate      func(t *testing.T, pt *ParsedTransaction)
	}{
		{
			name: "Success with all fields and optional pointers",
			mockExec: func(ctx context.Context, req agentapp.ExecutionRequest) (string, error) {
				return "```json\n" + `
				{
					"reference_number": "REF-001",
					"transaction_type": "EXPENSE",
					"date": "2026-09-17",
					"amount": 45.50,
					"currency": "USD",
					"counterparty": "Amazon",
					"source_account": {
						"id": "acc_1",
						"raw_name": "Chase Checking",
						"last_four": "1111"
					},
					"destination_account": {
						"id": "acc_2",
						"raw_name": "Cash",
						"last_four": "2222"
					},
					"suggested_budget": "Tech",
					"suggested_borrowing": "bor_1",
					"suggested_transfer_leg": "DESTINATION"
				}
				` + "\n```", nil
			},
			expectedError: false,
			validate: func(t *testing.T, pt *ParsedTransaction) {
				if pt.Counterparty != "Amazon" || pt.Amount != 4550 || pt.Currency != "USD" {
					t.Errorf("unexpected basics: %+v", pt)
				}
				if pt.CardLastFour != "1111" || pt.SourceAccountID != "acc_1" {
					t.Errorf("unexpected source account: %+v", pt)
				}
				if pt.SuggestedBudget != bgt || pt.SuggestedBorrowing != bor || pt.SuggestedTransferLeg != leg {
					t.Errorf("unexpected suggestions: %+v", pt)
				}
			},
		},
		{
			name: "Success with null optional pointers",
			mockExec: func(ctx context.Context, req agentapp.ExecutionRequest) (string, error) {
				return `
				{
					"counterparty": "Starbucks",
					"amount": 5.0,
					"currency": "USD"
				}
				`, nil
			},
			expectedError: false,
			validate: func(t *testing.T, pt *ParsedTransaction) {
				if pt.Counterparty != "Starbucks" || pt.Amount != 500 {
					t.Errorf("unexpected basics: %+v", pt)
				}
				if pt.SuggestedBudget != "" || pt.SuggestedBorrowing != "" || pt.SuggestedTransferLeg != "SOURCE" {
					t.Errorf("expected fallback defaults for empty suggestions, got: %+v", pt)
				}
			},
		},
		{
			name: "Execute agent error",
			mockExec: func(ctx context.Context, req agentapp.ExecutionRequest) (string, error) {
				return "", errors.New("parse agent failure")
			},
			expectedError: true,
		},
		{
			name: "Decode error on malformed JSON",
			mockExec: func(ctx context.Context, req agentapp.ExecutionRequest) (string, error) {
				return "invalid-json", nil
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			parser := NewAgentIngestionParser(&mockAgentCoordinator{
				executeAgentFunc: tc.mockExec,
			})
			res, err := parser.Parse(context.Background(), "spc_1", "email body", ingCtx)
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
				tc.validate(t, res)
			}
		})
	}
}

func TestAgentIngestionDeduplicator(t *testing.T) {
	dupID := "tx_existing_1"
	recent := []*finance.Transaction{
		{
			ID:              finance.TransactionID(dupID),
			Amount:          1000,
			Currency:        "USD",
			Description:     "Uber trip",
			TransactionDate: time.Now(),
		},
	}
	parsedTx := &ParsedTransaction{
		Amount:       1000,
		Currency:     "USD",
		Counterparty: "Uber",
		Date:         time.Now().Format(time.RFC3339),
	}

	tests := []struct {
		name          string
		mockExec      func(ctx context.Context, req agentapp.ExecutionRequest) (string, error)
		expectedError bool
		validate      func(t *testing.T, res *DeduplicationResult)
	}{
		{
			name: "Duplicate found",
			mockExec: func(ctx context.Context, req agentapp.ExecutionRequest) (string, error) {
				return `{"is_duplicate": true, "duplicate_transaction_id": "tx_existing_1", "reason": "same vendor and amount"}`, nil
			},
			expectedError: false,
			validate: func(t *testing.T, res *DeduplicationResult) {
				if !res.IsDuplicate || res.DuplicateTransactionID != dupID || res.Reason != "same vendor and amount" {
					t.Errorf("unexpected dedup result: %+v", res)
				}
			},
		},
		{
			name: "Not duplicate",
			mockExec: func(ctx context.Context, req agentapp.ExecutionRequest) (string, error) {
				return `{"is_duplicate": false}`, nil
			},
			expectedError: false,
			validate: func(t *testing.T, res *DeduplicationResult) {
				if res.IsDuplicate || res.DuplicateTransactionID != "" {
					t.Errorf("expected not duplicate, got %+v", res)
				}
			},
		},
		{
			name: "Execute agent error",
			mockExec: func(ctx context.Context, req agentapp.ExecutionRequest) (string, error) {
				return "", errors.New("dedup agent error")
			},
			expectedError: true,
		},
		{
			name: "Decode error on malformed JSON",
			mockExec: func(ctx context.Context, req agentapp.ExecutionRequest) (string, error) {
				return "corrupted-json", nil
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			dedup := NewAgentIngestionDeduplicator(&mockAgentCoordinator{
				executeAgentFunc: tc.mockExec,
			})
			res, err := dedup.Deduplicate(context.Background(), "spc_1", parsedTx, recent)
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
				tc.validate(t, res)
			}
		})
	}
}
