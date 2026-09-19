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

func TestTransactionID(t *testing.T) {
	tid, err := NewTransactionID()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	tests := []struct {
		name      string
		input     string
		wantPanic bool
		wantErr   bool
	}{
		{"valid transaction ID", string(tid), false, false},
		{"invalid prefix", "bgt_12345", true, true},
		{"empty string", "", true, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsed, err := ParseTransactionID(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseTransactionID(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
			if !tt.wantErr {
				if parsed.String() != tt.input {
					t.Errorf("String() = %q, want %q", parsed.String(), tt.input)
				}
				if err := parsed.Validate(); err != nil {
					t.Errorf("Validate() error = %v", err)
				}
			}

			if tt.wantPanic {
				defer func() {
					if r := recover(); r == nil {
						t.Errorf("MustTransactionID() did not panic for input %q", tt.input)
					}
				}()
				_ = MustTransactionID(tt.input)
			} else {
				must := MustTransactionID(tt.input)
				if must != parsed {
					t.Errorf("MustTransactionID() = %v, want %v", must, parsed)
				}
			}
		})
	}
}

func TestTransaction_SortFields(t *testing.T) {
	date := time.Date(2026, 8, 1, 10, 0, 0, 0, time.UTC)
	createTime := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
	txn := &Transaction{
		TransactionDate: date,
		Amount:          15000,
		Description:     "Coffee shop",
		CreateTime:      createTime,
	}

	tests := []struct {
		field   string
		isSort  bool
		wantVal string
	}{
		{"transaction_date", true, date.Format(time.RFC3339Nano)},
		{"amount", true, "000000000000015000"},
		{"description", true, "Coffee shop"},
		{"create_time", true, createTime.Format(time.RFC3339Nano)},
		{"unknown", false, date.Format(time.RFC3339Nano)}, // fallback to DefaultTransactionSortField
	}

	for _, tt := range tests {
		t.Run(tt.field, func(t *testing.T) {
			if got := IsTransactionSortField(tt.field); got != tt.isSort {
				t.Errorf("IsTransactionSortField(%q) = %v, want %v", tt.field, got, tt.isSort)
			}
			if got := txn.GetSortValue(tt.field); got != tt.wantVal {
				t.Errorf("txn.GetSortValue(%q) = %q, want %q", tt.field, got, tt.wantVal)
			}
		})
	}
}

func TestTransaction_LinkageAndImpact(t *testing.T) {
	stID := ScheduledTransactionID("spt_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	rtID := RecurringTransactionID("rec_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	borID := BorrowingID("bor_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")

	t.Run("LinkScheduledTransaction", func(t *testing.T) {
		txn := &Transaction{Amount: 1000}
		txn.LinkScheduledTransaction(stID, &rtID)
		if *txn.Metadata.ScheduledTransactionID != stID {
			t.Errorf("ScheduledTransactionID = %v, want %v", txn.Metadata.ScheduledTransactionID, stID)
		}
		if *txn.Metadata.RecurringTransactionID != rtID {
			t.Errorf("RecurringTransactionID = %v, want %v", txn.Metadata.RecurringTransactionID, rtID)
		}
	})

	t.Run("LinkBorrowing", func(t *testing.T) {
		txn := &Transaction{Amount: 1000}
		txn.LinkBorrowing(borID, "REPAYMENT")
		if *txn.Metadata.BorrowingID != borID {
			t.Errorf("BorrowingID = %v, want %v", txn.Metadata.BorrowingID, borID)
		}
		if txn.Metadata.BorrowingRole != "REPAYMENT" {
			t.Errorf("BorrowingRole = %q, want REPAYMENT", txn.Metadata.BorrowingRole)
		}
	})

	t.Run("ImpactAmount", func(t *testing.T) {
		txn := &Transaction{Amount: 1000}
		if txn.ImpactAmount() != 1000 {
			t.Errorf("ImpactAmount() = %d, want 1000", txn.ImpactAmount())
		}
		txn.Metadata.AccountImpactAmount = 1500
		if txn.ImpactAmount() != 1500 {
			t.Errorf("ImpactAmount() with override = %d, want 1500", txn.ImpactAmount())
		}
	})
}

func TestTransaction_Diff(t *testing.T) {
	t1 := &Transaction{
		Amount:      1000,
		Description: "Old Desc",
		Currency:    "USD",
	}
	t2 := &Transaction{
		Amount:      2000,
		Description: "New Desc",
		Currency:    "EUR",
	}

	diff := t1.Diff(t2)
	if diff["old_amount"] != int64(1000) || diff["new_amount"] != int64(2000) {
		t.Errorf("diff amounts incorrect: %v", diff)
	}
	if diff["old_description"] != "Old Desc" || diff["new_description"] != "New Desc" {
		t.Errorf("diff descriptions incorrect: %v", diff)
	}
	if diff["old_currency"] != "USD" || diff["new_currency"] != "EUR" {
		t.Errorf("diff currencies incorrect: %v", diff)
	}
}

func TestTransaction_Validate_Table(t *testing.T) {
	validTID, _ := NewTransactionID()
	validSpace := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	validAcc, _ := NewAccountID()
	validBudget, _ := NewBudgetID()
	validPeriod, _ := NewPeriodID()
	now := time.Now().UTC()

	tests := []struct {
		name    string
		txn     Transaction
		wantErr bool
	}{
		{
			name: "valid expense transaction",
			txn: Transaction{
				ID:              validTID,
				SpaceID:         validSpace,
				AccountID:       &validAcc,
				BudgetID:        &validBudget,
				PeriodID:        &validPeriod,
				Amount:          5000,
				AmountInBase:    5000,
				Currency:        "USD",
				Type:            TransactionTypeExpense,
				TransactionDate: now,
			},
			wantErr: false,
		},
		{
			name: "valid income transaction without budget",
			txn: Transaction{
				ID:              validTID,
				SpaceID:         validSpace,
				AccountID:       &validAcc,
				Amount:          5000,
				AmountInBase:    5000,
				Currency:        "USD",
				Type:            TransactionTypeIncome,
				TransactionDate: now,
			},
			wantErr: false,
		},
		{
			name: "missing budget for expense",
			txn: Transaction{
				ID:              validTID,
				SpaceID:         validSpace,
				AccountID:       &validAcc,
				Amount:          5000,
				Currency:        "USD",
				Type:            TransactionTypeExpense,
				TransactionDate: now,
			},
			wantErr: true,
		},
		{
			name: "amount <= 0",
			txn: Transaction{
				ID:              validTID,
				SpaceID:         validSpace,
				AccountID:       &validAcc,
				BudgetID:        &validBudget,
				Amount:          0,
				Currency:        "USD",
				Type:            TransactionTypeExpense,
				TransactionDate: now,
			},
			wantErr: true,
		},
		{
			name: "invalid currency",
			txn: Transaction{
				ID:              validTID,
				SpaceID:         validSpace,
				AccountID:       &validAcc,
				BudgetID:        &validBudget,
				Amount:          5000,
				Currency:        "INVALID",
				Type:            TransactionTypeExpense,
				TransactionDate: now,
			},
			wantErr: true,
		},
		{
			name: "zero transaction date",
			txn: Transaction{
				ID:        validTID,
				SpaceID:   validSpace,
				AccountID: &validAcc,
				BudgetID:  &validBudget,
				Amount:    5000,
				Currency:  "USD",
				Type:      TransactionTypeExpense,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.txn.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestTransaction_Init(t *testing.T) {
	txn := Transaction{
		Type: TransactionTypeExpense,
	}
	if err := txn.Init(); err != nil {
		t.Fatalf("Init() error = %v", err)
	}
	if txn.ID == "" {
		t.Error("expected ID to be generated")
	}
	if txn.CreateTime.IsZero() || txn.UpdateTime.IsZero() {
		t.Error("expected timestamps to be populated")
	}
}

func TestTransactionMetadata_Merge_Table(t *testing.T) {
	stID, _ := NewScheduledTransactionID()
	recID, _ := NewRecurringTransactionID()
	bID, _ := NewBorrowingID()
	trsfID, _ := NewTransferID()
	accID, _ := NewAccountID()
	now := time.Now().UTC()

	tests := []struct {
		name     string
		initial  TransactionMetadata
		other    TransactionMetadata
		validate func(t *testing.T, merged TransactionMetadata)
	}{
		{
			name:    "merge empty other does not overwrite initial",
			initial: TransactionMetadata{Notes: "Initial note", AccountImpactAmount: 500},
			other:   TransactionMetadata{},
			validate: func(t *testing.T, merged TransactionMetadata) {
				if merged.Notes != "Initial note" || merged.AccountImpactAmount != 500 {
					t.Errorf("initial fields overwritten: %+v", merged)
				}
			},
		},
		{
			name:    "merge all fields from other",
			initial: TransactionMetadata{},
			other: TransactionMetadata{
				ScheduledTransactionID:    &stID,
				RecurringTransactionID:    &recID,
				BorrowingID:               &bID,
				BorrowingRole:             "REPAYMENT",
				BorrowingAmount:           15000,
				AccountImpactAmount:       15000,
				TransferID:                &trsfID,
				CounterpartAccountID:      &accID,
				Notes:                     "Merged note",
				Reconciled:                true,
				ReconciliationStatementID: "stmt_123",
				ReconciledAt:              &now,
			},
			validate: func(t *testing.T, merged TransactionMetadata) {
				if merged.ScheduledTransactionID == nil || *merged.ScheduledTransactionID != stID {
					t.Errorf("ScheduledTransactionID mismatch")
				}
				if merged.RecurringTransactionID == nil || *merged.RecurringTransactionID != recID {
					t.Errorf("RecurringTransactionID mismatch")
				}
				if merged.BorrowingID == nil || *merged.BorrowingID != bID {
					t.Errorf("BorrowingID mismatch")
				}
				if merged.BorrowingRole != "REPAYMENT" || merged.BorrowingAmount != 15000 {
					t.Errorf("BorrowingRole/Amount mismatch")
				}
				if merged.AccountImpactAmount != 15000 {
					t.Errorf("AccountImpactAmount mismatch")
				}
				if merged.TransferID == nil || *merged.TransferID != trsfID {
					t.Errorf("TransferID mismatch")
				}
				if merged.CounterpartAccountID == nil || *merged.CounterpartAccountID != accID {
					t.Errorf("CounterpartAccountID mismatch")
				}
				if merged.Notes != "Merged note" {
					t.Errorf("Notes mismatch")
				}
				if !merged.Reconciled || merged.ReconciliationStatementID != "stmt_123" || merged.ReconciledAt == nil {
					t.Errorf("Reconciliation fields mismatch")
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := tt.initial
			m.Merge(tt.other)
			tt.validate(t, m)
		})
	}
}

func TestTransaction_Diff_Table(t *testing.T) {
	bgt1, _ := NewBudgetID()
	bgt2, _ := NewBudgetID()
	acc1, _ := NewAccountID()
	acc2, _ := NewAccountID()

	tests := []struct {
		name      string
		t1        *Transaction
		t2        *Transaction
		wantKeys  []string
		wantEmpty bool
	}{
		{
			name: "identical transactions produce empty diff",
			t1: &Transaction{
				Amount:      5000,
				Description: "Coffee",
				Currency:    "USD",
				BudgetID:    &bgt1,
				AccountID:   &acc1,
			},
			t2: &Transaction{
				Amount:      5000,
				Description: "Coffee",
				Currency:    "USD",
				BudgetID:    &bgt1,
				AccountID:   &acc1,
			},
			wantEmpty: true,
		},
		{
			name: "all basic fields differ",
			t1: &Transaction{
				Amount:      5000,
				Description: "Coffee",
				Currency:    "USD",
			},
			t2: &Transaction{
				Amount:      6000,
				Description: "Tea",
				Currency:    "EUR",
			},
			wantKeys: []string{"old_amount", "new_amount", "old_description", "new_description", "old_currency", "new_currency"},
		},
		{
			name:     "budget ID transitions from nil to non-nil",
			t1:       &Transaction{BudgetID: nil},
			t2:       &Transaction{BudgetID: &bgt1},
			wantKeys: []string{"new_budget_id"},
		},
		{
			name:     "budget ID transitions from non-nil to nil",
			t1:       &Transaction{BudgetID: &bgt1},
			t2:       &Transaction{BudgetID: nil},
			wantKeys: []string{"old_budget_id"},
		},
		{
			name:     "budget ID changes to different ID",
			t1:       &Transaction{BudgetID: &bgt1},
			t2:       &Transaction{BudgetID: &bgt2},
			wantKeys: []string{"old_budget_id", "new_budget_id"},
		},
		{
			name:     "account ID transitions from nil to non-nil",
			t1:       &Transaction{AccountID: nil},
			t2:       &Transaction{AccountID: &acc1},
			wantKeys: []string{"new_account_id"},
		},
		{
			name:     "account ID transitions from non-nil to nil",
			t1:       &Transaction{AccountID: &acc1},
			t2:       &Transaction{AccountID: nil},
			wantKeys: []string{"old_account_id"},
		},
		{
			name:     "account ID changes to different ID",
			t1:       &Transaction{AccountID: &acc1},
			t2:       &Transaction{AccountID: &acc2},
			wantKeys: []string{"old_account_id", "new_account_id"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			diff := tt.t1.Diff(tt.t2)
			if tt.wantEmpty && len(diff) != 0 {
				t.Errorf("expected empty diff, got %v", diff)
			}
			for _, k := range tt.wantKeys {
				if _, ok := diff[k]; !ok {
					t.Errorf("missing expected key %q in diff %v", k, diff)
				}
			}
		})
	}
}
