package finance

import (
	"testing"

	"github.com/segmentio/ksuid"
)

func TestParseAmountToCents(t *testing.T) {
	tests := []struct {
		input   string
		want    int64
		wantErr bool
	}{
		{"200.00", 20000, false},
		{"200", 20000, false},
		{"-200.50", -20050, false},
		{"($200.50)", -20050, false},
		{"$1,250.75", 125075, false},
		{"- $1,250.75", -125075, false},
		{"", 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := parseAmountToCents(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("parseAmountToCents(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("parseAmountToCents(%q) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}

func TestStatementLine_NewTransaction(t *testing.T) {
	spaceID := SpaceID("spc_" + ksuid.New().String())
	accountID := AccountID("acc_" + ksuid.New().String())
	stmtID := StatementID("stmt_" + ksuid.New().String())
	bID := BudgetID("bgt_" + ksuid.New().String())

	line := &StatementLine{
		ID:          "stln_test123",
		StatementID: stmtID,
		RowIndex:    0,
		DateStr:     "2026-08-12",
		Description: "Grocery Store",
		Amount:      -4500,
	}

	txn, err := line.NewTransaction(StatementLineTransactionOpts{
		SpaceID:   spaceID,
		AccountID: accountID,
		Currency:  "USD",
		Type:      TransactionTypeExpense,
		BudgetID:  &bID,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if txn.Amount != 4500 {
		t.Errorf("expected amount 4500, got %d", txn.Amount)
	}
	if txn.Type != TransactionTypeExpense {
		t.Errorf("expected type EXPENSE, got %s", txn.Type)
	}
	if !txn.Metadata.Reconciled {
		t.Error("expected reconciled to be true")
	}
	if txn.Metadata.ReconciliationStatementID != string(stmtID) {
		t.Errorf("expected statement ID %s, got %s", stmtID, txn.Metadata.ReconciliationStatementID)
	}
}

func TestStatementLine_NewTransfer(t *testing.T) {
	spaceID := SpaceID("spc_" + ksuid.New().String())
	stmtAccID := AccountID("acc_" + ksuid.New().String())
	counterpartAccID := AccountID("acc_" + ksuid.New().String())
	stmtID := StatementID("stmt_" + ksuid.New().String())

	// 1. Outflow transfer test (negative amount)
	outflowLine := &StatementLine{
		ID:          "stln_test456",
		StatementID: stmtID,
		RowIndex:    1,
		DateStr:     "2026-08-14",
		Description: "Transfer to Savings",
		Amount:      -25000,
	}

	transfer, transferOpts, err := outflowLine.NewTransfer(StatementLineTransferOpts{
		SpaceID:              spaceID,
		StatementAccountID:   stmtAccID,
		CounterpartAccountID: counterpartAccID,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if transfer.SourceAccountID != stmtAccID || transfer.DestinationAccountID != counterpartAccID {
		t.Errorf("expected source=%s dest=%s, got source=%s dest=%s", stmtAccID, counterpartAccID, transfer.SourceAccountID, transfer.DestinationAccountID)
	}
	if transfer.SourceAmount != 25000 || transfer.DestinationAmount != 25000 {
		t.Errorf("expected transfer amount 25000, got source=%d dest=%d", transfer.SourceAmount, transfer.DestinationAmount)
	}
	if transferOpts.OutflowMetadata == nil || !transferOpts.OutflowMetadata.Reconciled {
		t.Error("expected OutflowMetadata to be reconciled")
	}
	if transferOpts.InflowMetadata != nil {
		t.Error("expected InflowMetadata to be nil for outflow transfer")
	}

	// 2. Inflow transfer test (positive amount)
	inflowLine := &StatementLine{
		ID:          "stln_test789",
		StatementID: stmtID,
		RowIndex:    2,
		DateStr:     "2026-08-14",
		Description: "Transfer from Savings",
		Amount:      15000,
	}

	inflowTransfer, inflowOpts, err := inflowLine.NewTransfer(StatementLineTransferOpts{
		SpaceID:              spaceID,
		StatementAccountID:   stmtAccID,
		CounterpartAccountID: counterpartAccID,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if inflowTransfer.SourceAccountID != counterpartAccID || inflowTransfer.DestinationAccountID != stmtAccID {
		t.Errorf("expected source=%s dest=%s, got source=%s dest=%s", counterpartAccID, stmtAccID, inflowTransfer.SourceAccountID, inflowTransfer.DestinationAccountID)
	}
	if inflowTransfer.SourceAmount != 15000 || inflowTransfer.DestinationAmount != 15000 {
		t.Errorf("expected transfer amount 15000, got source=%d dest=%d", inflowTransfer.SourceAmount, inflowTransfer.DestinationAmount)
	}
	if inflowOpts.InflowMetadata == nil || !inflowOpts.InflowMetadata.Reconciled {
		t.Error("expected InflowMetadata to be reconciled")
	}
	if inflowOpts.OutflowMetadata != nil {
		t.Error("expected OutflowMetadata to be nil for inflow transfer")
	}
}
