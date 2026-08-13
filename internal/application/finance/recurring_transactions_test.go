package financeapp_test

import (
	"testing"
	"time"

	financeapp "github.com/masterkeysrd/saturn/internal/application/finance"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

func TestCreateRecurringTransactionRequest_Fields(t *testing.T) {
	now := time.Now().UTC()
	budID := finance.BudgetID("bud_123")

	req := &financeapp.CreateRecurringTransactionRequest{
		BudgetID:        &budID,
		Name:            "Netflix Subscription",
		Amount:          1599,
		Currency:        "USD",
		Interval:        "monthly",
		DueDate:         now,
		IsVariable:      false,
		GracePeriodDays: 3,
		Type:            "EXPENSE",
	}

	if req.Name != "Netflix Subscription" || req.Amount != 1599 {
		t.Errorf("unexpected recurring transaction name/amount")
	}
	if req.Interval != "monthly" || req.GracePeriodDays != 3 {
		t.Errorf("unexpected recurring interval or grace period")
	}
}

func TestConfirmScheduledTransactionRequest_Fields(t *testing.T) {
	now := time.Now().UTC()
	accID := finance.AccountID("acc_pay")

	req := &financeapp.ConfirmScheduledTransactionRequest{
		TransactionID:   finance.ScheduledTransactionID("sch_777"),
		TransactionDate: now,
		EffectiveDate:   now,
		ActualAmount:    1599,
		Description:     "Auto-confirmed Netflix payment",
		AccountID:       &accID,
	}

	if req.TransactionID != "sch_777" || req.ActualAmount != 1599 {
		t.Errorf("unexpected scheduled transaction confirmation fields")
	}
	if req.AccountID == nil || *req.AccountID != "acc_pay" {
		t.Errorf("expected account ID acc_pay")
	}
}
