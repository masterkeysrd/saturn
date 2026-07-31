package financeapp_test

import (
	"testing"
	"time"

	financeapp "github.com/masterkeysrd/saturn/internal/application/finance"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

func TestCreateRecurringExpenseRequest_Fields(t *testing.T) {
	now := time.Now().UTC()

	req := &financeapp.CreateRecurringExpenseRequest{
		BudgetID:        finance.BudgetID("bud_123"),
		Name:            "Netflix Subscription",
		Amount:          1599,
		Currency:        "USD",
		Interval:        "monthly",
		DueDate:         now,
		IsVariable:      false,
		GracePeriodDays: 3,
	}

	if req.Name != "Netflix Subscription" || req.Amount != 1599 {
		t.Errorf("unexpected recurring expense name/amount")
	}
	if req.Interval != "monthly" || req.GracePeriodDays != 3 {
		t.Errorf("unexpected recurring interval or grace period")
	}
}

func TestConfirmScheduledPaymentRequest_Fields(t *testing.T) {
	now := time.Now().UTC()
	accID := finance.AccountID("acc_pay")

	req := &financeapp.ConfirmScheduledPaymentRequest{
		PaymentID:       finance.ScheduledPaymentID("sch_777"),
		TransactionDate: now,
		EffectiveDate:   now,
		ActualAmount:    1599,
		Description:     "Auto-confirmed Netflix payment",
		AccountID:       &accID,
	}

	if req.PaymentID != "sch_777" || req.ActualAmount != 1599 {
		t.Errorf("unexpected scheduled payment confirmation fields")
	}
	if req.AccountID == nil || *req.AccountID != "acc_pay" {
		t.Errorf("expected account ID acc_pay")
	}
}
