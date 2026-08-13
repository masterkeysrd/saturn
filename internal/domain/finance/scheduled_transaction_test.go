package finance

import (
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

func TestScheduledTransaction_StateTransitions(t *testing.T) {
	spID, _ := NewScheduledTransactionID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	rawBudget, _ := id.Generate("bgt_")
	budgetID := BudgetID(rawBudget)

	sp := &ScheduledTransaction{
		ID:         spID,
		SpaceID:    spaceID,
		BudgetID:   &budgetID,
		SourceType: "recurrent_transaction",
		SourceID:   "rec_123",
		Amount:     5000,
		Currency:   "USD",
		DueDate:    time.Now().UTC(),
		Status:     ScheduledTransactionPending,
		Type:       TransactionTypeExpense,
	}

	t.Run("MarkSkipped updates status", func(t *testing.T) {
		spCopy := *sp
		if err := spCopy.MarkSkipped(); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if spCopy.Status != ScheduledTransactionSkipped {
			t.Errorf("status = %s, want %s", spCopy.Status, ScheduledTransactionSkipped)
		}
	})

	t.Run("MarkPaid updates status and prevents double paid", func(t *testing.T) {
		spCopy := *sp
		if err := spCopy.MarkPaid(); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if spCopy.Status != ScheduledTransactionPaid {
			t.Errorf("status = %s, want %s", spCopy.Status, ScheduledTransactionPaid)
		}

		if err := spCopy.MarkPaid(); err == nil {
			t.Error("expected error marking paid twice, got nil")
		}
	})
}

func TestScheduledTransaction_NewConfirmationTransaction(t *testing.T) {
	spID, _ := NewScheduledTransactionID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	rawBudget, _ := id.Generate("bgt_")
	budgetID := BudgetID(rawBudget)
	accID, _ := NewAccountID()
	now := time.Now().UTC()

	sp := &ScheduledTransaction{
		ID:         spID,
		SpaceID:    spaceID,
		BudgetID:   &budgetID,
		SourceType: "recurrent_transaction",
		SourceID:   "rec_123",
		Amount:     7500,
		Currency:   "USD",
		DueDate:    now,
		Status:     ScheduledTransactionPending,
		Type:       TransactionTypeExpense,
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
	if string(*txn.Metadata.ScheduledTransactionID) != string(spID) {
		t.Errorf("ScheduledTransactionID = %s, want %s", *txn.Metadata.ScheduledTransactionID, spID)
	}
}
