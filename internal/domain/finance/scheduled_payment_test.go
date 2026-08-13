package finance

import (
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

func TestScheduledPayment_StateTransitions(t *testing.T) {
	spID, _ := NewScheduledPaymentID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	rawBudget, _ := id.Generate("bgt_")
	budgetID := BudgetID(rawBudget)

	sp := &ScheduledPayment{
		ID:         spID,
		SpaceID:    spaceID,
		BudgetID:   budgetID,
		SourceType: "recurrent_expense",
		SourceID:   "rec_123",
		Amount:     5000,
		Currency:   "USD",
		DueDate:    time.Now().UTC(),
		Status:     ScheduledPaymentPending,
	}

	t.Run("MarkSkipped updates status", func(t *testing.T) {
		spCopy := *sp
		if err := spCopy.MarkSkipped(); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if spCopy.Status != ScheduledPaymentSkipped {
			t.Errorf("status = %s, want %s", spCopy.Status, ScheduledPaymentSkipped)
		}
	})

	t.Run("MarkPaid updates status and prevents double paid", func(t *testing.T) {
		spCopy := *sp
		if err := spCopy.MarkPaid(); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if spCopy.Status != ScheduledPaymentPaid {
			t.Errorf("status = %s, want %s", spCopy.Status, ScheduledPaymentPaid)
		}

		if err := spCopy.MarkPaid(); err == nil {
			t.Error("expected error marking paid twice, got nil")
		}
	})
}

func TestScheduledPayment_NewConfirmationTransaction(t *testing.T) {
	spID, _ := NewScheduledPaymentID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	rawBudget, _ := id.Generate("bgt_")
	budgetID := BudgetID(rawBudget)
	accID, _ := NewAccountID()
	now := time.Now().UTC()

	sp := &ScheduledPayment{
		ID:         spID,
		SpaceID:    spaceID,
		BudgetID:   budgetID,
		SourceType: "recurrent_expense",
		SourceID:   "rec_123",
		Amount:     7500,
		Currency:   "USD",
		DueDate:    now,
		Status:     ScheduledPaymentPending,
	}

	txn, err := sp.NewConfirmationTransaction(ConfirmOpts{
		AccountID:           &accID,
		AmountInBase:        7500,
		AccountImpactAmount: 7500,
		TransactionDate:     now,
	})
	if err != nil {
		t.Fatalf("NewConfirmationTransaction failed: %v", err)
	}

	if txn.Type != TransactionTypeExpense {
		t.Errorf("type = %s, want EXPENSE", txn.Type)
	}
	if *txn.BudgetID != budgetID {
		t.Errorf("budgetID = %s, want %s", *txn.BudgetID, budgetID)
	}
	if *txn.Metadata.ScheduledPaymentID != spID {
		t.Errorf("ScheduledPaymentID = %s, want %s", *txn.Metadata.ScheduledPaymentID, spID)
	}
}
