package financeapp

import (
	"context"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestCoordinator_CreateExpense(t *testing.T) {
	customDate := time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC)
	effectiveDate := time.Date(2026, 9, 11, 12, 0, 0, 0, time.UTC)
	accID := finance.AccountID("acc_1")

	tests := []struct {
		name          string
		ctx           context.Context
		req           *CreateExpenseRequest
		mockFn        func(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error)
		expectedID    finance.TransactionID
		expectedError bool
	}{
		{
			name: "Success with custom dates and account",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &CreateExpenseRequest{
				BudgetID:        "bgt_1",
				Amount:          4500,
				Currency:        "USD",
				Description:     "Team lunch",
				TransactionDate: customDate,
				EffectiveDate:   effectiveDate,
				AccountID:       &accID,
			},
			mockFn: func(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error) {
				if txn.SpaceID != "spc_1" || txn.Amount != 4500 || txn.TransactionDate != customDate || txn.EffectiveDate != effectiveDate {
					t.Errorf("unexpected expense payload: %+v", txn)
				}
				return &finance.Transaction{ID: "tx_exp_1", SpaceID: txn.SpaceID}, nil
			},
			expectedID:    "tx_exp_1",
			expectedError: false,
		},
		{
			name: "Success with zero dates fallback",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &CreateExpenseRequest{
				BudgetID:    "bgt_1",
				Amount:      1000,
				Currency:    "USD",
				Description: "Coffee",
			},
			mockFn: func(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error) {
				if txn.TransactionDate.IsZero() || txn.EffectiveDate.IsZero() {
					t.Errorf("expected non-zero fallback dates")
				}
				return &finance.Transaction{ID: "tx_exp_2", SpaceID: txn.SpaceID}, nil
			},
			expectedID:    "tx_exp_2",
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &CreateExpenseRequest{Amount: 1000},
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &CreateExpenseRequest{Amount: 1000},
			mockFn: func(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error) {
				return nil, errors.New("budget limit exceeded")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{CreateExpenseFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.CreateExpense(tc.ctx, tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res == nil || res.ID != tc.expectedID {
				t.Errorf("expected ID %v, got %+v", tc.expectedID, res)
			}
		})
	}
}

func TestCoordinator_CreateIncome(t *testing.T) {
	customDate := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	effectiveDate := time.Date(2026, 9, 2, 0, 0, 0, 0, time.UTC)

	tests := []struct {
		name          string
		ctx           context.Context
		req           *CreateIncomeRequest
		mockFn        func(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error)
		expectedID    finance.TransactionID
		expectedError bool
	}{
		{
			name: "Success with custom dates",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &CreateIncomeRequest{
				Amount:          150000,
				Currency:        "USD",
				Description:     "Salary",
				TransactionDate: customDate,
				EffectiveDate:   effectiveDate,
			},
			mockFn: func(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error) {
				if txn.SpaceID != "spc_1" || txn.Amount != 150000 || txn.TransactionDate != customDate {
					t.Errorf("unexpected income payload: %+v", txn)
				}
				return &finance.Transaction{ID: "tx_inc_1", SpaceID: txn.SpaceID}, nil
			},
			expectedID:    "tx_inc_1",
			expectedError: false,
		},
		{
			name: "Success with zero dates fallback",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &CreateIncomeRequest{
				Amount:      5000,
				Currency:    "USD",
				Description: "Bonus",
			},
			mockFn: func(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error) {
				if txn.TransactionDate.IsZero() || txn.EffectiveDate.IsZero() {
					t.Errorf("expected non-zero fallback dates")
				}
				return &finance.Transaction{ID: "tx_inc_2", SpaceID: txn.SpaceID}, nil
			},
			expectedID:    "tx_inc_2",
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &CreateIncomeRequest{Amount: 5000},
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &CreateIncomeRequest{Amount: 5000},
			mockFn: func(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error) {
				return nil, errors.New("income creation failed")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{CreateIncomeFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.CreateIncome(tc.ctx, tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res == nil || res.ID != tc.expectedID {
				t.Errorf("expected ID %v, got %+v", tc.expectedID, res)
			}
		})
	}
}

func TestCoordinator_UpdateExpense(t *testing.T) {
	customDate := time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC)
	effectiveDate := time.Date(2026, 9, 11, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name          string
		ctx           context.Context
		req           *UpdateExpenseRequest
		mockFn        func(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error)
		expectedID    finance.TransactionID
		expectedError bool
	}{
		{
			name: "Success with custom dates",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &UpdateExpenseRequest{
				TransactionID:   "tx_1",
				BudgetID:        "bgt_1",
				Amount:          6000,
				Currency:        "USD",
				Description:     "Dinner",
				TransactionDate: customDate,
				EffectiveDate:   effectiveDate,
			},
			mockFn: func(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error) {
				if txn.ID != "tx_1" || txn.SpaceID != "spc_1" || txn.Amount != 6000 {
					t.Errorf("unexpected update expense payload: %+v", txn)
				}
				return &finance.Transaction{ID: txn.ID}, nil
			},
			expectedID:    "tx_1",
			expectedError: false,
		},
		{
			name: "Success with zero dates fallback",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &UpdateExpenseRequest{
				TransactionID: "tx_2",
				BudgetID:      "bgt_1",
				Amount:        1500,
			},
			mockFn: func(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error) {
				if txn.TransactionDate.IsZero() || txn.EffectiveDate.IsZero() {
					t.Errorf("expected non-zero fallback dates")
				}
				return &finance.Transaction{ID: txn.ID}, nil
			},
			expectedID:    "tx_2",
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &UpdateExpenseRequest{TransactionID: "tx_1"},
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &UpdateExpenseRequest{TransactionID: "tx_1"},
			mockFn: func(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error) {
				return nil, errors.New("update expense failed")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{UpdateExpenseFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.UpdateExpense(tc.ctx, tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res == nil || res.ID != tc.expectedID {
				t.Errorf("expected ID %v, got %+v", tc.expectedID, res)
			}
		})
	}
}

func TestCoordinator_UpdateIncome(t *testing.T) {
	customDate := time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC)
	effectiveDate := time.Date(2026, 9, 11, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name          string
		ctx           context.Context
		req           *UpdateIncomeRequest
		mockFn        func(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error)
		expectedID    finance.TransactionID
		expectedError bool
	}{
		{
			name: "Success with custom dates",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &UpdateIncomeRequest{
				TransactionID:   "tx_1",
				Amount:          8000,
				Currency:        "USD",
				Description:     "Freelance",
				TransactionDate: customDate,
				EffectiveDate:   effectiveDate,
			},
			mockFn: func(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error) {
				if txn.ID != "tx_1" || txn.SpaceID != "spc_1" || txn.Amount != 8000 {
					t.Errorf("unexpected update income payload: %+v", txn)
				}
				return &finance.Transaction{ID: txn.ID}, nil
			},
			expectedID:    "tx_1",
			expectedError: false,
		},
		{
			name: "Success with zero dates fallback",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &UpdateIncomeRequest{
				TransactionID: "tx_2",
				Amount:        3000,
			},
			mockFn: func(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error) {
				if txn.TransactionDate.IsZero() || txn.EffectiveDate.IsZero() {
					t.Errorf("expected non-zero fallback dates")
				}
				return &finance.Transaction{ID: txn.ID}, nil
			},
			expectedID:    "tx_2",
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &UpdateIncomeRequest{TransactionID: "tx_1"},
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &UpdateIncomeRequest{TransactionID: "tx_1"},
			mockFn: func(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error) {
				return nil, errors.New("update income failed")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{UpdateIncomeFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.UpdateIncome(tc.ctx, tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res == nil || res.ID != tc.expectedID {
				t.Errorf("expected ID %v, got %+v", tc.expectedID, res)
			}
		})
	}
}

func TestCoordinator_DeleteTransaction(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		id            finance.TransactionID
		mockFn        func(ctx context.Context, spaceID finance.SpaceID, id finance.TransactionID) error
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			id:   "tx_1",
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.TransactionID) error {
				if spaceID != "spc_1" || id != "tx_1" {
					t.Errorf("unexpected delete args: space=%v id=%v", spaceID, id)
				}
				return nil
			},
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			id:            "tx_1",
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			id:   "tx_1",
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.TransactionID) error {
				return errors.New("delete failed")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{DeleteTransactionFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			err := coord.DeleteTransaction(tc.ctx, tc.id)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestCoordinator_ListTransactionEvents(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		req           *ListTransactionEventsRequest
		mockFn        func(ctx context.Context, spaceID finance.SpaceID, txnID finance.TransactionID) ([]*finance.TransactionEvent, error)
		expectedCount int
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &ListTransactionEventsRequest{TransactionID: "tx_1"},
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, txnID finance.TransactionID) ([]*finance.TransactionEvent, error) {
				if spaceID != "spc_1" || txnID != "tx_1" {
					t.Errorf("unexpected list events args: space=%v txn=%v", spaceID, txnID)
				}
				return []*finance.TransactionEvent{{ID: "ev_1"}, {ID: "ev_2"}}, nil
			},
			expectedCount: 2,
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &ListTransactionEventsRequest{TransactionID: "tx_1"},
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &ListTransactionEventsRequest{TransactionID: "tx_1"},
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, txnID finance.TransactionID) ([]*finance.TransactionEvent, error) {
				return nil, errors.New("event query failed")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{ListTransactionEventsFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			events, err := coord.ListTransactionEvents(tc.ctx, tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(events) != tc.expectedCount {
				t.Errorf("expected count %d, got %d", tc.expectedCount, len(events))
			}
		})
	}
}
