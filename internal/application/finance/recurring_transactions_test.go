package financeapp

import (
	"context"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestCreateRecurringTransactionRequest_Fields(t *testing.T) {
	bgtID := finance.BudgetID("bgt_1")
	now := time.Now().UTC()

	req := &CreateRecurringTransactionRequest{
		BudgetID:        &bgtID,
		Name:            "Netflix",
		Amount:          1599,
		Currency:        "USD",
		Interval:        "monthly",
		DueDate:         now,
		IsVariable:      false,
		GracePeriodDays: 3,
		Type:            "EXPENSE",
	}

	if req.Name != "Netflix" || req.Amount != 1599 || req.Interval != "monthly" {
		t.Errorf("unexpected recurring transaction request fields")
	}
	if req.BudgetID == nil || *req.BudgetID != "bgt_1" {
		t.Errorf("expected budget ID bgt_1")
	}
}

func TestConfirmScheduledTransactionRequest_Fields(t *testing.T) {
	now := time.Now().UTC()
	req := &ConfirmScheduledTransactionRequest{
		TransactionID:   "tx_sched_1",
		TransactionDate: now,
		EffectiveDate:   now,
		ActualAmount:    1599,
		Description:     "Netflix Subscription",
	}

	if req.TransactionID != "tx_sched_1" || req.ActualAmount != 1599 {
		t.Errorf("unexpected confirm request fields")
	}
}

func TestCoordinator_CreateRecurringTransaction(t *testing.T) {
	bgtID := finance.BudgetID("bgt_1")
	accID := finance.AccountID("acc_1")
	customDate := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	var generateCalled bool

	tests := []struct {
		name          string
		ctx           context.Context
		req           *CreateRecurringTransactionRequest
		mockCreateFn  func(ctx context.Context, transaction *finance.RecurringTransaction) (*finance.RecurringTransaction, error)
		expectedID    finance.RecurringTransactionID
		expectedError bool
	}{
		{
			name: "Success with custom due date",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &CreateRecurringTransactionRequest{
				BudgetID:        &bgtID,
				Name:            "Spotify",
				Amount:          999,
				Currency:        "USD",
				Interval:        string(finance.IntervalMonthly),
				DueDate:         customDate,
				Type:            string(finance.TransactionTypeExpense),
				AccountID:       &accID,
				GracePeriodDays: 2,
			},
			mockCreateFn: func(ctx context.Context, transaction *finance.RecurringTransaction) (*finance.RecurringTransaction, error) {
				if transaction.SpaceID != "spc_1" || transaction.NextDueDate != customDate {
					t.Errorf("unexpected recurring transaction payload: %+v", transaction)
				}
				return &finance.RecurringTransaction{ID: "rec_1", SpaceID: transaction.SpaceID}, nil
			},
			expectedID:    "rec_1",
			expectedError: false,
		},
		{
			name: "Success with zero due date fallback",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &CreateRecurringTransactionRequest{
				Name:     "Gym",
				Amount:   5000,
				Currency: "USD",
				Interval: string(finance.IntervalMonthly),
				Type:     string(finance.TransactionTypeExpense),
			},
			mockCreateFn: func(ctx context.Context, transaction *finance.RecurringTransaction) (*finance.RecurringTransaction, error) {
				if transaction.NextDueDate.IsZero() {
					t.Errorf("expected non-zero fallback NextDueDate")
				}
				return &finance.RecurringTransaction{ID: "rec_2", SpaceID: transaction.SpaceID}, nil
			},
			expectedID:    "rec_2",
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &CreateRecurringTransactionRequest{Name: "Gym"},
			expectedError: true,
		},
		{
			name: "Domain create error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &CreateRecurringTransactionRequest{Name: "Gym"},
			mockCreateFn: func(ctx context.Context, transaction *finance.RecurringTransaction) (*finance.RecurringTransaction, error) {
				return nil, errors.New("cannot create recurring tx")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			generateCalled = false
			fsMock := &FinanceServiceMock{
				CreateRecurringTransactionFunc: tc.mockCreateFn,
				GenerateScheduledTransactionsFunc: func(ctx context.Context) error {
					generateCalled = true
					return nil
				},
			}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.CreateRecurringTransaction(tc.ctx, tc.req)
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
			if !generateCalled {
				t.Error("expected GenerateScheduledTransactions to be triggered")
			}
		})
	}
}

func TestCoordinator_UpdateRecurringTransaction(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		req           *UpdateRecurringTransactionRequest
		mockFn        func(ctx context.Context, transaction *finance.RecurringTransaction, mask []string) (*finance.RecurringTransaction, error)
		expectedID    finance.RecurringTransactionID
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &UpdateRecurringTransactionRequest{
				ID:         "rec_1",
				Name:       "Updated Netflix",
				Amount:     1999,
				Version:    1,
				UpdateMask: []string{"name", "amount"},
			},
			mockFn: func(ctx context.Context, transaction *finance.RecurringTransaction, mask []string) (*finance.RecurringTransaction, error) {
				if transaction.SpaceID != "spc_1" || transaction.ID != "rec_1" || len(mask) != 2 {
					t.Errorf("unexpected update args: %+v, mask=%v", transaction, mask)
				}
				return &finance.RecurringTransaction{ID: transaction.ID, Version: 2}, nil
			},
			expectedID:    "rec_1",
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &UpdateRecurringTransactionRequest{ID: "rec_1"},
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &UpdateRecurringTransactionRequest{ID: "rec_1"},
			mockFn: func(ctx context.Context, transaction *finance.RecurringTransaction, mask []string) (*finance.RecurringTransaction, error) {
				return nil, errors.New("update conflict")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{UpdateRecurringTransactionFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.UpdateRecurringTransaction(tc.ctx, tc.req)
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

func TestCoordinator_DeleteRecurringTransaction(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		id            finance.RecurringTransactionID
		opts          finance.DeleteOptions
		mockFn        func(ctx context.Context, id finance.RecurringTransactionID, opts finance.DeleteOptions) error
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			id:   "rec_1",
			opts: finance.DeleteOptions{Version: 3},
			mockFn: func(ctx context.Context, id finance.RecurringTransactionID, opts finance.DeleteOptions) error {
				if id != "rec_1" || opts.Version != 3 {
					t.Errorf("unexpected delete args: id=%v opts=%+v", id, opts)
				}
				return nil
			},
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			id:            "rec_1",
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			id:   "rec_1",
			mockFn: func(ctx context.Context, id finance.RecurringTransactionID, opts finance.DeleteOptions) error {
				return errors.New("delete failed")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{DeleteRecurringTransactionFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			err := coord.DeleteRecurringTransaction(tc.ctx, tc.id, tc.opts)
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

func TestCoordinator_ScheduledTransactions(t *testing.T) {
	now := time.Now().UTC()

	t.Run("ConfirmScheduledTransaction", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			req           *ConfirmScheduledTransactionRequest
			mockFn        func(ctx context.Context, req finance.ConfirmScheduledTransactionRequest) (*finance.Transaction, error)
			expectedID    finance.TransactionID
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				req: &ConfirmScheduledTransactionRequest{
					TransactionID:   "sched_1",
					TransactionDate: now,
					EffectiveDate:   now,
					ActualAmount:    1500,
					Description:     "Confirmed subscription",
				},
				mockFn: func(ctx context.Context, req finance.ConfirmScheduledTransactionRequest) (*finance.Transaction, error) {
					if req.SpaceID != "spc_1" || req.TransactionID != "sched_1" || req.ActualAmount != 1500 {
						t.Errorf("unexpected confirm args: %+v", req)
					}
					return &finance.Transaction{ID: "tx_conf_1"}, nil
				},
				expectedID:    "tx_conf_1",
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				req:           &ConfirmScheduledTransactionRequest{TransactionID: "sched_1"},
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				req:  &ConfirmScheduledTransactionRequest{TransactionID: "sched_1"},
				mockFn: func(ctx context.Context, req finance.ConfirmScheduledTransactionRequest) (*finance.Transaction, error) {
					return nil, errors.New("confirm failed")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{ConfirmScheduledTransactionFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				res, err := coord.ConfirmScheduledTransaction(tc.ctx, tc.req)
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
	})

	t.Run("MatchScheduledTransaction", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			req           *MatchScheduledTransactionRequest
			mockFn        func(ctx context.Context, req finance.MatchScheduledTransactionRequest) (*finance.Transaction, error)
			expectedID    finance.TransactionID
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				req: &MatchScheduledTransactionRequest{
					TransactionID: "sched_1",
					MatchedID:     "tx_matched",
				},
				mockFn: func(ctx context.Context, req finance.MatchScheduledTransactionRequest) (*finance.Transaction, error) {
					if req.SpaceID != "spc_1" || req.TransactionID != "sched_1" || req.MatchedID != "tx_matched" {
						t.Errorf("unexpected match args: %+v", req)
					}
					return &finance.Transaction{ID: req.MatchedID}, nil
				},
				expectedID:    "tx_matched",
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				req:           &MatchScheduledTransactionRequest{TransactionID: "sched_1"},
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				req:  &MatchScheduledTransactionRequest{TransactionID: "sched_1"},
				mockFn: func(ctx context.Context, req finance.MatchScheduledTransactionRequest) (*finance.Transaction, error) {
					return nil, errors.New("match failed")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{MatchScheduledTransactionFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				res, err := coord.MatchScheduledTransaction(tc.ctx, tc.req)
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
	})

	t.Run("SkipScheduledTransaction", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			id            finance.ScheduledTransactionID
			mockFn        func(ctx context.Context, spaceID finance.SpaceID, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error)
			expectedID    finance.ScheduledTransactionID
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				id:   "sched_1",
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error) {
					if spaceID != "spc_1" || id != "sched_1" {
						t.Errorf("unexpected skip args: space=%v id=%v", spaceID, id)
					}
					return &finance.ScheduledTransaction{ID: id}, nil
				},
				expectedID:    "sched_1",
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				id:            "sched_1",
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				id:   "sched_1",
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error) {
					return nil, errors.New("skip failed")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{SkipScheduledTransactionFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				res, err := coord.SkipScheduledTransaction(tc.ctx, tc.id)
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
	})

	t.Run("GetScheduledTransaction", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			id            finance.ScheduledTransactionID
			mockFn        func(ctx context.Context, spaceID finance.SpaceID, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error)
			expectedID    finance.ScheduledTransactionID
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				id:   "sched_1",
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error) {
					if spaceID != "spc_1" || id != "sched_1" {
						t.Errorf("unexpected get args: space=%v id=%v", spaceID, id)
					}
					return &finance.ScheduledTransaction{ID: id}, nil
				},
				expectedID:    "sched_1",
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				id:            "sched_1",
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				id:   "sched_1",
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error) {
					return nil, errors.New("not found")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{GetScheduledTransactionFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				res, err := coord.GetScheduledTransaction(tc.ctx, tc.id)
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
	})

	t.Run("GenerateScheduledTransactions", func(t *testing.T) {
		tests := []struct {
			name          string
			mockFn        func(ctx context.Context) error
			expectedError bool
		}{
			{
				name: "Success",
				mockFn: func(ctx context.Context) error {
					return nil
				},
				expectedError: false,
			},
			{
				name: "Domain error",
				mockFn: func(ctx context.Context) error {
					return errors.New("generation failure")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{GenerateScheduledTransactionsFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				err := coord.GenerateScheduledTransactions(context.Background())
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
	})
}
