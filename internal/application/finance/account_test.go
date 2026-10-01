package financeapp

import (
	"context"
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func newTestContext(spaceID, userID string) context.Context {
	ctx := context.Background()
	if spaceID != "" {
		ctx = auth.WithSpaceID(ctx, spaceID)
	}
	if userID != "" {
		ctx = auth.WithPrincipal(ctx, auth.Principal{Subject: userID})
	}
	return ctx
}

func TestCreateAccountRequest_Validation(t *testing.T) {
	req := &CreateAccountRequest{
		Name:           "Main Credit Card",
		Type:           string(finance.AccountTypeCreditCard),
		Currency:       "USD",
		InitialBalance: 0,
		CreditLimit:    500000,
		LastFour:       "4321",
	}

	if req.Name != "Main Credit Card" || req.Type != string(finance.AccountTypeCreditCard) {
		t.Errorf("unexpected account fields: %s / %s", req.Name, req.Type)
	}
	if req.LastFour != "4321" {
		t.Errorf("expected last four to be 4321")
	}
	if req.CreditLimit != 500000 {
		t.Errorf("expected credit limit to be 500000")
	}
}

func TestUpdateAccountRequest_Fields(t *testing.T) {
	req := &UpdateAccountRequest{
		ID:             finance.AccountID("acc_123"),
		Name:           "Savings Account",
		Type:           string(finance.AccountTypeBank),
		Currency:       "USD",
		InitialBalance: 100000,
		IsActive:       true,
	}

	if req.ID != "acc_123" || req.Name != "Savings Account" || !req.IsActive {
		t.Errorf("unexpected update account request fields")
	}
}

func TestCoordinator_CreateAccount(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		req           *CreateAccountRequest
		mockFn        func(ctx context.Context, rCtx finance.RequestContext, acc *finance.Account) (*finance.Account, error)
		expectedID    finance.AccountID
		expectedError bool
	}{
		{
			name: "Success with institution",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &CreateAccountRequest{
				Name:          "Checking",
				Type:          string(finance.AccountTypeBank),
				Currency:      "USD",
				InstitutionID: "inst_1",
			},
			mockFn: func(ctx context.Context, rCtx finance.RequestContext, acc *finance.Account) (*finance.Account, error) {
				if rCtx.SpaceID() != "spc_1" || acc.InstitutionID == nil || *acc.InstitutionID != "inst_1" {
					t.Errorf("unexpected account in mock: space=%v acc=%+v", rCtx.SpaceID(), acc)
				}
				return &finance.Account{ID: "acc_1", Name: acc.Name}, nil
			},
			expectedID:    "acc_1",
			expectedError: false,
		},
		{
			name: "Success without institution",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &CreateAccountRequest{
				Name:     "Cash Wallet",
				Type:     string(finance.AccountTypeCash),
				Currency: "EUR",
			},
			mockFn: func(ctx context.Context, rCtx finance.RequestContext, acc *finance.Account) (*finance.Account, error) {
				if acc.InstitutionID != nil {
					t.Errorf("expected nil InstitutionID, got %v", acc.InstitutionID)
				}
				return &finance.Account{ID: "acc_cash", Name: acc.Name}, nil
			},
			expectedID:    "acc_cash",
			expectedError: false,
		},
		{
			name: "Missing space context",
			ctx:  context.Background(),
			req: &CreateAccountRequest{
				Name: "Checking",
			},
			expectedError: true,
		},
		{
			name: "Domain service error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &CreateAccountRequest{
				Name: "Checking",
			},
			mockFn: func(ctx context.Context, rCtx finance.RequestContext, acc *finance.Account) (*finance.Account, error) {
				return nil, errors.New("domain validation failure")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{
				CreateAccountFunc: tc.mockFn,
			}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.CreateAccount(tc.ctx, tc.req)
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

func TestCoordinator_UpdateAccount(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		req           *UpdateAccountRequest
		mockFn        func(ctx context.Context, rCtx finance.RequestContext, acc *finance.Account, mask []string) (*finance.Account, error)
		expectedID    finance.AccountID
		expectedError bool
	}{
		{
			name: "Success with institution and mask",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &UpdateAccountRequest{
				ID:            "acc_1",
				Name:          "Updated Checking",
				Type:          string(finance.AccountTypeBank),
				Currency:      "USD",
				InstitutionID: "inst_1",
				Mask:          []string{"name"},
				Version:       2,
			},
			mockFn: func(ctx context.Context, rCtx finance.RequestContext, acc *finance.Account, mask []string) (*finance.Account, error) {
				if rCtx.SpaceID() != "spc_1" || acc.ID != "acc_1" || acc.Version != 2 || len(mask) != 1 {
					t.Errorf("unexpected update args: space=%v acc=%+v, mask=%v", rCtx.SpaceID(), acc, mask)
				}
				return &finance.Account{ID: acc.ID, Name: acc.Name, Version: 3}, nil
			},
			expectedID:    "acc_1",
			expectedError: false,
		},
		{
			name: "Success without institution",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &UpdateAccountRequest{
				ID:   "acc_2",
				Name: "Cash",
			},
			mockFn: func(ctx context.Context, rCtx finance.RequestContext, acc *finance.Account, mask []string) (*finance.Account, error) {
				if acc.InstitutionID != nil {
					t.Errorf("expected nil InstitutionID")
				}
				return &finance.Account{ID: acc.ID}, nil
			},
			expectedID:    "acc_2",
			expectedError: false,
		},
		{
			name: "Missing space context",
			ctx:  context.Background(),
			req: &UpdateAccountRequest{
				ID: "acc_1",
			},
			expectedError: true,
		},
		{
			name: "Domain service error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &UpdateAccountRequest{
				ID: "acc_1",
			},
			mockFn: func(ctx context.Context, rCtx finance.RequestContext, acc *finance.Account, mask []string) (*finance.Account, error) {
				return nil, errors.New("update failed")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{
				UpdateAccountFunc: tc.mockFn,
			}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.UpdateAccount(tc.ctx, tc.req)
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

func TestCoordinator_DeleteAccount(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		id            finance.AccountID
		opts          finance.DeleteOptions
		mockFn        func(ctx context.Context, rCtx finance.RequestContext, id finance.AccountID, opts finance.DeleteOptions) error
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			id:   "acc_1",
			opts: finance.DeleteOptions{Version: 1},
			mockFn: func(ctx context.Context, rCtx finance.RequestContext, id finance.AccountID, opts finance.DeleteOptions) error {
				if rCtx.SpaceID() != "spc_1" || id != "acc_1" || opts.Version != 1 {
					t.Errorf("unexpected delete args: space=%v id=%v opts=%+v", rCtx.SpaceID(), id, opts)
				}
				return nil
			},
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			id:            "acc_1",
			expectedError: true,
		},
		{
			name: "Domain service error",
			ctx:  newTestContext("spc_1", "usr_1"),
			id:   "acc_1",
			mockFn: func(ctx context.Context, rCtx finance.RequestContext, id finance.AccountID, opts finance.DeleteOptions) error {
				return errors.New("cannot delete default account")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{
				DeleteAccountFunc: tc.mockFn,
			}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			err := coord.DeleteAccount(tc.ctx, tc.id, tc.opts)
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

func TestCoordinator_AdjustAccountBalance(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		req           *AdjustAccountBalanceRequest
		mockFn        func(ctx context.Context, rCtx finance.RequestContext, req finance.AdjustAccountBalanceRequest) (*finance.Account, error)
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &AdjustAccountBalanceRequest{
				AccountID:      "acc_1",
				TargetBalance:  50000,
				AdjustmentDate: "2026-09-16",
				Note:           "Reconciliation adjustment",
			},
			mockFn: func(ctx context.Context, rCtx finance.RequestContext, req finance.AdjustAccountBalanceRequest) (*finance.Account, error) {
				if rCtx.SpaceID() != "spc_1" || req.AccountID != "acc_1" || req.TargetBalance != 50000 {
					t.Errorf("unexpected adjust args: space=%v req=%+v", rCtx.SpaceID(), req)
				}
				return &finance.Account{ID: req.AccountID, CurrentBalance: req.TargetBalance}, nil
			},
			expectedError: false,
		},
		{
			name: "Unauthenticated",
			ctx:  context.Background(),
			req: &AdjustAccountBalanceRequest{
				AccountID: "acc_1",
			},
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &AdjustAccountBalanceRequest{
				AccountID: "acc_1",
			},
			mockFn: func(ctx context.Context, rCtx finance.RequestContext, req finance.AdjustAccountBalanceRequest) (*finance.Account, error) {
				return nil, errors.New("account not found")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{
				AdjustAccountBalanceFunc: tc.mockFn,
			}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.AdjustAccountBalance(tc.ctx, tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res == nil || res.CurrentBalance != tc.req.TargetBalance {
				t.Errorf("expected balance %d, got %+v", tc.req.TargetBalance, res)
			}
		})
	}
}
