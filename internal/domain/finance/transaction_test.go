package finance

import (
	"testing"
	"time"

	"github.com/segmentio/ksuid"
)

func TestTransactionMetadata_Merge(t *testing.T) {
	transferID := TransferID("trf_" + ksuid.New().String())
	counterpartID := AccountID("acc_" + ksuid.New().String())
	stmtID := "stmt_" + ksuid.New().String()
	now := time.Now().UTC()

	initial := TransactionMetadata{
		TransferID:           &transferID,
		CounterpartAccountID: &counterpartID,
		AccountImpactAmount:  5000,
		Notes:                "Initial note",
	}

	overlay := TransactionMetadata{
		Reconciled:                true,
		ReconciliationStatementID: stmtID,
		ReconciledAt:              &now,
	}

	initial.Merge(overlay)

	// Verify original fields preserved
	if initial.TransferID == nil || *initial.TransferID != transferID {
		t.Errorf("expected transfer ID %s to be preserved, got %v", transferID, initial.TransferID)
	}
	if initial.CounterpartAccountID == nil || *initial.CounterpartAccountID != counterpartID {
		t.Errorf("expected counterpart account ID %s to be preserved, got %v", counterpartID, initial.CounterpartAccountID)
	}
	if initial.AccountImpactAmount != 5000 {
		t.Errorf("expected account impact amount 5000, got %d", initial.AccountImpactAmount)
	}
	if initial.Notes != "Initial note" {
		t.Errorf("expected notes 'Initial note', got %s", initial.Notes)
	}

	// Verify overlay fields merged
	if !initial.Reconciled {
		t.Error("expected Reconciled to be true")
	}
	if initial.ReconciliationStatementID != stmtID {
		t.Errorf("expected reconciliation statement ID %s, got %s", stmtID, initial.ReconciliationStatementID)
	}
	if initial.ReconciledAt == nil || *initial.ReconciledAt != now {
		t.Errorf("expected reconciled at %v, got %v", now, initial.ReconciledAt)
	}
}
