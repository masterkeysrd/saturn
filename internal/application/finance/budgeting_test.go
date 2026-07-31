package financeapp_test

import (
	"testing"

	financeapp "github.com/masterkeysrd/saturn/internal/application/finance"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
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
	req := &financeapp.CreateBudgetRequest{
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
	req := &financeapp.UpdateBudgetRequest{
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
