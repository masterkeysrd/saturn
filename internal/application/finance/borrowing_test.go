package financeapp

import (
	"context"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestCreateBorrowingRequest_Fields(t *testing.T) {
	accID := finance.AccountID("acc_123")
	req := &CreateBorrowingRequest{
		Counterparty: "Alice",
		Direction:    string(finance.BorrowingDirectionLent),
		TotalAmount:  15000,
		Currency:     "USD",
		Notes:        "Dinner loan",
		AccountID:    &accID,
	}

	if req.Counterparty != "Alice" || req.Direction != string(finance.BorrowingDirectionLent) {
		t.Errorf("unexpected borrowing person or direction: %s / %s", req.Counterparty, req.Direction)
	}
	if req.TotalAmount != 15000 || req.AccountID == nil || *req.AccountID != "acc_123" {
		t.Errorf("unexpected target account or amount")
	}
}

func TestLogBorrowingTransactionRequest_Fields(t *testing.T) {
	accID := finance.AccountID("acc_456")
	now := time.Now().UTC()

	req := &LogBorrowingTransactionRequest{
		BorrowingID:     finance.BorrowingID("bor_999"),
		Type:            finance.BorrowingTransactionTypePayment,
		Amount:          5000,
		TransactionDate: now,
		Notes:           "Partial payment",
		AccountID:       &accID,
	}

	if req.BorrowingID != "bor_999" || req.Amount != 5000 {
		t.Errorf("unexpected repayment parameters")
	}
	if req.AccountID == nil || *req.AccountID != "acc_456" {
		t.Errorf("expected account ID acc_456")
	}
}

func TestCoordinator_CreateBorrowing(t *testing.T) {
	accID := finance.AccountID("acc_1")
	now := time.Now().UTC()

	tests := []struct {
		name          string
		ctx           context.Context
		req           *CreateBorrowingRequest
		mockFn        func(ctx context.Context, b *finance.Borrowing, createAsTransaction bool) (*finance.Borrowing, error)
		expectedID    finance.BorrowingID
		expectedError bool
	}{
		{
			name: "Success as transaction",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &CreateBorrowingRequest{
				Direction:           string(finance.BorrowingDirectionBorrowed),
				Counterparty:        "Bank",
				ContactInfo:         "bank@example.com",
				TotalAmount:         100000,
				Currency:            "USD",
				EstablishedAt:       now,
				CreateAsTransaction: true,
				AccountID:           &accID,
			},
			mockFn: func(ctx context.Context, b *finance.Borrowing, createAsTransaction bool) (*finance.Borrowing, error) {
				if b.SpaceID != "spc_1" || !createAsTransaction || b.TotalAmount != 100000 {
					t.Errorf("unexpected borrowing args: %+v, asTx=%v", b, createAsTransaction)
				}
				return &finance.Borrowing{ID: "bor_1", SpaceID: b.SpaceID, TotalAmount: b.TotalAmount}, nil
			},
			expectedID:    "bor_1",
			expectedError: false,
		},
		{
			name: "Success not as transaction",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &CreateBorrowingRequest{
				Direction:           string(finance.BorrowingDirectionLent),
				Counterparty:        "Bob",
				TotalAmount:         5000,
				Currency:            "EUR",
				CreateAsTransaction: false,
			},
			mockFn: func(ctx context.Context, b *finance.Borrowing, createAsTransaction bool) (*finance.Borrowing, error) {
				if createAsTransaction {
					t.Errorf("expected createAsTransaction false")
				}
				return &finance.Borrowing{ID: "bor_2", SpaceID: b.SpaceID}, nil
			},
			expectedID:    "bor_2",
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &CreateBorrowingRequest{Counterparty: "Bob"},
			expectedError: true,
		},
		{
			name: "Domain service error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &CreateBorrowingRequest{Counterparty: "Bob"},
			mockFn: func(ctx context.Context, b *finance.Borrowing, createAsTransaction bool) (*finance.Borrowing, error) {
				return nil, errors.New("domain error")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{CreateBorrowingFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.CreateBorrowing(tc.ctx, tc.req)
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

func TestCoordinator_UpdateBorrowing(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		req           *UpdateBorrowingRequest
		mockFn        func(ctx context.Context, b *finance.Borrowing, mask []string) (*finance.Borrowing, error)
		expectedID    finance.BorrowingID
		expectedError bool
	}{
		{
			name: "Success with update mask",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &UpdateBorrowingRequest{
				ID:           "bor_1",
				Counterparty: "Updated Alice",
				TotalAmount:  20000,
				Currency:     "USD",
				Version:      1,
				UpdateMask:   []string{"counterparty", "total_amount"},
			},
			mockFn: func(ctx context.Context, b *finance.Borrowing, mask []string) (*finance.Borrowing, error) {
				if b.ID != "bor_1" || b.SpaceID != "spc_1" || len(mask) != 2 {
					t.Errorf("unexpected update args: %+v, mask=%v", b, mask)
				}
				return &finance.Borrowing{ID: b.ID, Version: 2}, nil
			},
			expectedID:    "bor_1",
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &UpdateBorrowingRequest{ID: "bor_1"},
			expectedError: true,
		},
		{
			name: "Domain service error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &UpdateBorrowingRequest{ID: "bor_1"},
			mockFn: func(ctx context.Context, b *finance.Borrowing, mask []string) (*finance.Borrowing, error) {
				return nil, errors.New("update conflict")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{UpdateBorrowingFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.UpdateBorrowing(tc.ctx, tc.req)
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

func TestCoordinator_DeleteBorrowing(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		id            finance.BorrowingID
		mockFn        func(ctx context.Context, spaceID finance.SpaceID, id finance.BorrowingID) error
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			id:   "bor_1",
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.BorrowingID) error {
				if spaceID != "spc_1" || id != "bor_1" {
					t.Errorf("unexpected delete args: space=%v id=%v", spaceID, id)
				}
				return nil
			},
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			id:            "bor_1",
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			id:   "bor_1",
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.BorrowingID) error {
				return errors.New("delete error")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{DeleteBorrowingFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			err := coord.DeleteBorrowing(tc.ctx, tc.id)
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

func TestCoordinator_AdjustBorrowingBalance(t *testing.T) {
	accID := finance.AccountID("acc_1")
	tests := []struct {
		name          string
		ctx           context.Context
		req           *AdjustBorrowingBalanceRequest
		mockFn        func(ctx context.Context, req finance.AdjustBorrowingBalanceRequest) (*finance.Borrowing, error)
		expectedID    finance.BorrowingID
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &AdjustBorrowingBalanceRequest{
				BorrowingID:    "bor_1",
				TargetBalance:  10000,
				AdjustmentDate: "2026-09-16",
				Notes:          "Adjustment",
				AccountID:      &accID,
			},
			mockFn: func(ctx context.Context, req finance.AdjustBorrowingBalanceRequest) (*finance.Borrowing, error) {
				if req.SpaceID != "spc_1" || req.BorrowingID != "bor_1" || req.TargetBalance != 10000 {
					t.Errorf("unexpected adjust args: %+v", req)
				}
				return &finance.Borrowing{ID: req.BorrowingID}, nil
			},
			expectedID:    "bor_1",
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &AdjustBorrowingBalanceRequest{BorrowingID: "bor_1"},
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &AdjustBorrowingBalanceRequest{BorrowingID: "bor_1"},
			mockFn: func(ctx context.Context, req finance.AdjustBorrowingBalanceRequest) (*finance.Borrowing, error) {
				return nil, errors.New("adjust failed")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{AdjustBorrowingBalanceFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.AdjustBorrowingBalance(tc.ctx, tc.req)
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

func TestCoordinator_BorrowingTransactions(t *testing.T) {
	now := time.Now().UTC()
	accID := finance.AccountID("acc_1")

	t.Run("LogBorrowingTransaction", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			req           *LogBorrowingTransactionRequest
			mockFn        func(ctx context.Context, req finance.LogBorrowingTransactionRequest) (*finance.Transaction, error)
			expectedID    finance.TransactionID
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				req: &LogBorrowingTransactionRequest{
					BorrowingID:     "bor_1",
					Type:            finance.BorrowingTransactionTypePayment,
					Amount:          2500,
					TransactionDate: now,
					AccountID:       &accID,
					Notes:           "repayment",
				},
				mockFn: func(ctx context.Context, req finance.LogBorrowingTransactionRequest) (*finance.Transaction, error) {
					if req.SpaceID != "spc_1" || req.BorrowingID != "bor_1" || req.Amount != 2500 {
						t.Errorf("unexpected log tx args: %+v", req)
					}
					return &finance.Transaction{ID: "tx_1"}, nil
				},
				expectedID:    "tx_1",
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				req:           &LogBorrowingTransactionRequest{BorrowingID: "bor_1"},
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				req:  &LogBorrowingTransactionRequest{BorrowingID: "bor_1"},
				mockFn: func(ctx context.Context, req finance.LogBorrowingTransactionRequest) (*finance.Transaction, error) {
					return nil, errors.New("log failed")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{LogBorrowingTransactionFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				res, err := coord.LogBorrowingTransaction(tc.ctx, tc.req)
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

	t.Run("UpdateBorrowingTransaction", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			req           *UpdateBorrowingTransactionRequest
			mockFn        func(ctx context.Context, req finance.UpdateBorrowingTransactionRequest) (*finance.Transaction, error)
			expectedID    finance.TransactionID
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				req: &UpdateBorrowingTransactionRequest{
					BorrowingID:     "bor_1",
					TransactionID:   "tx_1",
					Type:            finance.BorrowingTransactionTypePayment,
					Amount:          3000,
					TransactionDate: now,
					AccountID:       &accID,
					Notes:           "updated payment",
				},
				mockFn: func(ctx context.Context, req finance.UpdateBorrowingTransactionRequest) (*finance.Transaction, error) {
					if req.SpaceID != "spc_1" || req.TransactionID != "tx_1" || req.Amount != 3000 {
						t.Errorf("unexpected update tx args: %+v", req)
					}
					return &finance.Transaction{ID: req.TransactionID}, nil
				},
				expectedID:    "tx_1",
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				req:           &UpdateBorrowingTransactionRequest{BorrowingID: "bor_1"},
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				req:  &UpdateBorrowingTransactionRequest{BorrowingID: "bor_1"},
				mockFn: func(ctx context.Context, req finance.UpdateBorrowingTransactionRequest) (*finance.Transaction, error) {
					return nil, errors.New("update failed")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{UpdateBorrowingTransactionFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				res, err := coord.UpdateBorrowingTransaction(tc.ctx, tc.req)
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

	t.Run("DeleteBorrowingTransaction", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			req           *DeleteBorrowingTransactionRequest
			mockFn        func(ctx context.Context, req finance.DeleteBorrowingTransactionRequest) error
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				req: &DeleteBorrowingTransactionRequest{
					BorrowingID:   "bor_1",
					TransactionID: "tx_1",
				},
				mockFn: func(ctx context.Context, req finance.DeleteBorrowingTransactionRequest) error {
					if req.SpaceID != "spc_1" || req.BorrowingID != "bor_1" || req.TransactionID != "tx_1" {
						t.Errorf("unexpected delete tx args: %+v", req)
					}
					return nil
				},
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				req:           &DeleteBorrowingTransactionRequest{BorrowingID: "bor_1"},
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				req:  &DeleteBorrowingTransactionRequest{BorrowingID: "bor_1"},
				mockFn: func(ctx context.Context, req finance.DeleteBorrowingTransactionRequest) error {
					return errors.New("delete failed")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{DeleteBorrowingTransactionFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				err := coord.DeleteBorrowingTransaction(tc.ctx, tc.req)
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
