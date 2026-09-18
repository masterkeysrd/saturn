package financeapp

import (
	"context"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestCreateBudgetRequest_Validation(t *testing.T) {
	accID := finance.AccountID("acc_def")
	budget := &finance.Budget{
		Name:             "Groceries",
		LimitAmount:      80000,
		Currency:         "USD",
		Interval:         finance.IntervalMonthly,
		Icon:             "ShoppingBag",
		Color:            "green",
		DefaultAccountID: &accID,
	}
	req := &CreateBudgetRequest{
		Budget: budget,
	}

	if req.Budget == nil || req.Budget.Name != "Groceries" || req.Budget.LimitAmount != 80000 {
		t.Errorf("unexpected budget name or limit in request")
	}
	if req.Budget.Interval != finance.IntervalMonthly {
		t.Errorf("unexpected budget interval: %s", req.Budget.Interval)
	}
	if req.Budget.DefaultAccountID == nil || *req.Budget.DefaultAccountID != "acc_def" {
		t.Errorf("expected default account ID acc_def")
	}
}

func TestUpdateBudgetRequest_Fields(t *testing.T) {
	budget := &finance.Budget{
		ID:          finance.BudgetID("bgt_123"),
		Name:        "Entertainment",
		LimitAmount: 50000,
	}
	req := &UpdateBudgetRequest{
		Budget:     budget,
		UpdateMask: []string{"name", "limit_amount"},
	}

	if req.Budget == nil || req.Budget.ID != "bgt_123" {
		t.Errorf("unexpected update budget request fields")
	}
	if len(req.UpdateMask) != 2 {
		t.Errorf("unexpected update mask length")
	}
}

func TestCoordinator_CreateBudget(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		req           *CreateBudgetRequest
		mockFn        func(ctx context.Context, budget *finance.Budget) (*finance.Budget, error)
		expectedID    finance.BudgetID
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &CreateBudgetRequest{
				Budget: &finance.Budget{Name: "Dining", LimitAmount: 50000},
			},
			mockFn: func(ctx context.Context, budget *finance.Budget) (*finance.Budget, error) {
				if budget.SpaceID != "spc_1" || budget.Name != "Dining" {
					t.Errorf("unexpected budget payload: %+v", budget)
				}
				return &finance.Budget{ID: "bgt_1", SpaceID: budget.SpaceID, Name: budget.Name}, nil
			},
			expectedID:    "bgt_1",
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &CreateBudgetRequest{Budget: &finance.Budget{Name: "Dining"}},
			expectedError: true,
		},
		{
			name:          "Nil request",
			ctx:           newTestContext("spc_1", "usr_1"),
			req:           nil,
			expectedError: true,
		},
		{
			name:          "Nil budget inside request",
			ctx:           newTestContext("spc_1", "usr_1"),
			req:           &CreateBudgetRequest{Budget: nil},
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &CreateBudgetRequest{Budget: &finance.Budget{Name: "Dining"}},
			mockFn: func(ctx context.Context, budget *finance.Budget) (*finance.Budget, error) {
				return nil, errors.New("budget name exists")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{CreateBudgetFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.CreateBudget(tc.ctx, tc.req)
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

func TestCoordinator_UpdateBudget(t *testing.T) {
	var periodLimitUpdated bool

	tests := []struct {
		name                 string
		ctx                  context.Context
		req                  *UpdateBudgetRequest
		mockUpdateFn         func(ctx context.Context, budget *finance.Budget, mask []string) (*finance.Budget, error)
		mockGetPeriodFn      func(ctx context.Context, spaceID finance.SpaceID, budgetID finance.BudgetID, date time.Time) (*finance.BudgetPeriod, error)
		mockUpdatePeriodFn   func(ctx context.Context, id finance.PeriodID, limit int64) error
		expectedID           finance.BudgetID
		assertPeriodPropaged bool
		expectedError        bool
	}{
		{
			name: "Success without period propagation",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &UpdateBudgetRequest{
				Budget:     &finance.Budget{ID: "bgt_1", Name: "Groceries", LimitAmount: 60000},
				UpdateMask: []string{"name", "limit_amount"},
			},
			mockUpdateFn: func(ctx context.Context, budget *finance.Budget, mask []string) (*finance.Budget, error) {
				if budget.SpaceID != "spc_1" || len(mask) != 2 {
					t.Errorf("unexpected update args: %+v, mask=%v", budget, mask)
				}
				return &finance.Budget{ID: budget.ID, Name: budget.Name}, nil
			},
			expectedID:    "bgt_1",
			expectedError: false,
		},
		{
			name: "Success with period propagation",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &UpdateBudgetRequest{
				Budget:      &finance.Budget{ID: "bgt_1", LimitAmount: 75000},
				Propagation: finance.PropagationCurrentPeriod,
				UpdateMask:  []string{"limit_amount"},
			},
			mockUpdateFn: func(ctx context.Context, budget *finance.Budget, mask []string) (*finance.Budget, error) {
				return &finance.Budget{ID: budget.ID, SpaceID: budget.SpaceID, LimitAmount: 75000}, nil
			},
			mockGetPeriodFn: func(ctx context.Context, spaceID finance.SpaceID, budgetID finance.BudgetID, date time.Time) (*finance.BudgetPeriod, error) {
				return &finance.BudgetPeriod{ID: "prd_1", BudgetID: budgetID}, nil
			},
			mockUpdatePeriodFn: func(ctx context.Context, id finance.PeriodID, limit int64) error {
				if id == "prd_1" && limit == 75000 {
					periodLimitUpdated = true
				}
				return nil
			},
			expectedID:           "bgt_1",
			assertPeriodPropaged: true,
			expectedError:        false,
		},
		{
			name: "Success with period propagation error handled safely",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &UpdateBudgetRequest{
				Budget:      &finance.Budget{ID: "bgt_1", LimitAmount: 75000},
				Propagation: finance.PropagationCurrentPeriod,
			},
			mockUpdateFn: func(ctx context.Context, budget *finance.Budget, mask []string) (*finance.Budget, error) {
				return &finance.Budget{ID: budget.ID, SpaceID: budget.SpaceID}, nil
			},
			mockGetPeriodFn: func(ctx context.Context, spaceID finance.SpaceID, budgetID finance.BudgetID, date time.Time) (*finance.BudgetPeriod, error) {
				return nil, errors.New("period not found")
			},
			expectedID:    "bgt_1",
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &UpdateBudgetRequest{Budget: &finance.Budget{ID: "bgt_1"}},
			expectedError: true,
		},
		{
			name:          "Nil request",
			ctx:           newTestContext("spc_1", "usr_1"),
			req:           nil,
			expectedError: true,
		},
		{
			name:          "Nil budget inside request",
			ctx:           newTestContext("spc_1", "usr_1"),
			req:           &UpdateBudgetRequest{Budget: nil},
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &UpdateBudgetRequest{Budget: &finance.Budget{ID: "bgt_1"}},
			mockUpdateFn: func(ctx context.Context, budget *finance.Budget, mask []string) (*finance.Budget, error) {
				return nil, errors.New("conflict")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			periodLimitUpdated = false
			fsMock := &FinanceServiceMock{
				UpdateBudgetFunc:      tc.mockUpdateFn,
				GetOrCreatePeriodFunc: tc.mockGetPeriodFn,
				UpdatePeriodLimitFunc: tc.mockUpdatePeriodFn,
			}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.UpdateBudget(tc.ctx, tc.req)
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
			if tc.assertPeriodPropaged && !periodLimitUpdated {
				t.Error("expected period limit to be updated")
			}
		})
	}
}

func TestCoordinator_GetBudget(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		id            finance.BudgetID
		mockFn        func(ctx context.Context, spaceID finance.SpaceID, id finance.BudgetID) (*finance.Budget, error)
		expectedID    finance.BudgetID
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			id:   "bgt_1",
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.BudgetID) (*finance.Budget, error) {
				if spaceID != "spc_1" || id != "bgt_1" {
					t.Errorf("unexpected get budget args: space=%v id=%v", spaceID, id)
				}
				return &finance.Budget{ID: id, SpaceID: spaceID}, nil
			},
			expectedID:    "bgt_1",
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			id:            "bgt_1",
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			id:   "bgt_1",
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.BudgetID) (*finance.Budget, error) {
				return nil, errors.New("budget not found")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{GetBudgetFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.GetBudget(tc.ctx, tc.id)
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

func TestCoordinator_DeleteBudget(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		req           *DeleteBudgetRequest
		mockFn        func(ctx context.Context, spaceID finance.SpaceID, id finance.BudgetID, opts finance.DeleteOptions) error
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &DeleteBudgetRequest{ID: "bgt_1", Version: 2},
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.BudgetID, opts finance.DeleteOptions) error {
				if spaceID != "spc_1" || id != "bgt_1" || opts.Version != 2 {
					t.Errorf("unexpected delete args: space=%v id=%v opts=%+v", spaceID, id, opts)
				}
				return nil
			},
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &DeleteBudgetRequest{ID: "bgt_1"},
			expectedError: true,
		},
		{
			name:          "Nil request",
			ctx:           newTestContext("spc_1", "usr_1"),
			req:           nil,
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &DeleteBudgetRequest{ID: "bgt_1"},
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.BudgetID, opts finance.DeleteOptions) error {
				return errors.New("cannot delete budget")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{DeleteBudgetFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			err := coord.DeleteBudget(tc.ctx, tc.req)
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
