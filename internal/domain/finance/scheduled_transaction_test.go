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

func TestScheduledTransactionID(t *testing.T) {
	stID, err := NewScheduledTransactionID()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"valid scheduled transaction ID", string(stID), false},
		{"invalid prefix", "txn_12345", true},
		{"empty string", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsed, err := ParseScheduledTransactionID(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseScheduledTransactionID(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
			if !tt.wantErr {
				if string(parsed) != tt.input {
					t.Errorf("string(parsed) = %q, want %q", string(parsed), tt.input)
				}
				if err := parsed.Validate(); err != nil {
					t.Errorf("Validate() error = %v", err)
				}
			}
		})
	}
}

func TestScheduledTransaction_ResolveDescription(t *testing.T) {
	sp := &ScheduledTransaction{
		Metadata: ScheduledTransactionMetadata{
			Description: "Meta Desc",
		},
	}

	tests := []struct {
		name     string
		sp       *ScheduledTransaction
		reqDesc  string
		fallback string
		want     string
	}{
		{
			name:     "request description takes priority",
			sp:       sp,
			reqDesc:  "Req Desc",
			fallback: "Fallback",
			want:     "Req Desc",
		},
		{
			name:     "metadata description used if reqDesc empty",
			sp:       sp,
			reqDesc:  "",
			fallback: "Fallback",
			want:     "Meta Desc",
		},
		{
			name:     "source fallback used if metadata empty",
			sp:       &ScheduledTransaction{},
			reqDesc:  "",
			fallback: "Fallback",
			want:     "Fallback",
		},
		{
			name:     "default fallback used if all empty",
			sp:       &ScheduledTransaction{},
			reqDesc:  "",
			fallback: "",
			want:     "Scheduled Transaction",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.sp.ResolveDescription(tt.reqDesc, tt.fallback)
			if got != tt.want {
				t.Errorf("ResolveDescription() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestScheduledTransaction_NewScheduledEvent(t *testing.T) {
	stID, _ := NewScheduledTransactionID()
	spaceID := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	txnID, _ := NewTransactionID()

	tests := []struct {
		name      string
		stType    TransactionType
		wantEvent string
	}{
		{
			name:      "expense event",
			stType:    TransactionTypeExpense,
			wantEvent: "EXPENSE_SCHEDULED",
		},
		{
			name:      "income event",
			stType:    TransactionTypeIncome,
			wantEvent: "INCOME_SCHEDULED",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sp := &ScheduledTransaction{
				ID:      stID,
				SpaceID: spaceID,
				Type:    tt.stType,
			}
			event := sp.NewScheduledEvent(txnID)
			if event.EventType != tt.wantEvent {
				t.Errorf("EventType = %q, want %q", event.EventType, tt.wantEvent)
			}
			if event.Metadata["scheduled_transaction_id"] != string(stID) {
				t.Errorf("event metadata ID = %v, want %v", event.Metadata["scheduled_transaction_id"], stID)
			}
		})
	}
}

func TestScheduledTransaction_SortFields(t *testing.T) {
	dueDate := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	createTime := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)
	sp := &ScheduledTransaction{
		DueDate:    dueDate,
		Amount:     12500,
		Status:     ScheduledTransactionPending,
		CreateTime: createTime,
	}

	tests := []struct {
		field   string
		isSort  bool
		wantVal string
	}{
		{"due_date", true, dueDate.Format(time.RFC3339)},
		{"amount", true, "000000000000012500"},
		{"status", true, "pending"},
		{"create_time", true, createTime.Format(time.RFC3339)},
		{"other", false, dueDate.Format(time.RFC3339)},
	}

	for _, tt := range tests {
		t.Run(tt.field, func(t *testing.T) {
			if got := IsScheduledTransactionSortField(tt.field); got != tt.isSort {
				t.Errorf("IsScheduledTransactionSortField(%q) = %v, want %v", tt.field, got, tt.isSort)
			}
			if got := sp.GetSortValue(tt.field); got != tt.wantVal {
				t.Errorf("sp.GetSortValue(%q) = %q, want %q", tt.field, got, tt.wantVal)
			}
		})
	}
}

func TestScheduledTransaction_MarkSkipped_PaidError(t *testing.T) {
	sp := &ScheduledTransaction{
		Status: ScheduledTransactionPaid,
	}
	if err := sp.MarkSkipped(); err == nil {
		t.Error("expected error skipping a paid scheduled transaction")
	}
}

func TestScheduledTransaction_Validate_Table(t *testing.T) {
	stID, _ := NewScheduledTransactionID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	budID, _ := NewBudgetID()
	accID, _ := NewAccountID()
	now := time.Now().UTC()

	tests := []struct {
		name      string
		scheduled ScheduledTransaction
		wantErr   bool
	}{
		{
			name: "valid expense with budget",
			scheduled: ScheduledTransaction{
				ID:         stID,
				SpaceID:    spaceID,
				Type:       TransactionTypeExpense,
				BudgetID:   &budID,
				SourceType: "RECURRING",
				SourceID:   "rec_123",
				Amount:     5000,
				Currency:   "USD",
				DueDate:    now,
			},
			wantErr: false,
		},
		{
			name: "valid income without budget",
			scheduled: ScheduledTransaction{
				ID:         stID,
				SpaceID:    spaceID,
				Type:       TransactionTypeIncome,
				SourceType: "INVOICE",
				SourceID:   "ibx_123",
				Amount:     120000,
				Currency:   "USD",
				DueDate:    now,
				AccountID:  &accID,
			},
			wantErr: false,
		},
		{
			name: "expense requires budget ID",
			scheduled: ScheduledTransaction{
				ID:         stID,
				SpaceID:    spaceID,
				Type:       TransactionTypeExpense,
				BudgetID:   nil,
				SourceType: "RECURRING",
				SourceID:   "rec_123",
				Amount:     5000,
				Currency:   "USD",
				DueDate:    now,
			},
			wantErr: true,
		},
		{
			name: "invalid transaction type",
			scheduled: ScheduledTransaction{
				ID:         stID,
				SpaceID:    spaceID,
				Type:       TransactionTypeTransferOut,
				SourceType: "RECURRING",
				SourceID:   "rec_123",
				Amount:     5000,
				Currency:   "USD",
				DueDate:    now,
			},
			wantErr: true,
		},
		{
			name: "missing source type",
			scheduled: ScheduledTransaction{
				ID:         stID,
				SpaceID:    spaceID,
				Type:       TransactionTypeIncome,
				SourceType: "",
				SourceID:   "rec_123",
				Amount:     5000,
				Currency:   "USD",
				DueDate:    now,
			},
			wantErr: true,
		},
		{
			name: "missing source ID",
			scheduled: ScheduledTransaction{
				ID:         stID,
				SpaceID:    spaceID,
				Type:       TransactionTypeIncome,
				SourceType: "RECURRING",
				SourceID:   "",
				Amount:     5000,
				Currency:   "USD",
				DueDate:    now,
			},
			wantErr: true,
		},
		{
			name: "zero amount",
			scheduled: ScheduledTransaction{
				ID:         stID,
				SpaceID:    spaceID,
				Type:       TransactionTypeIncome,
				SourceType: "RECURRING",
				SourceID:   "rec_123",
				Amount:     0,
				Currency:   "USD",
				DueDate:    now,
			},
			wantErr: true,
		},
		{
			name: "invalid currency",
			scheduled: ScheduledTransaction{
				ID:         stID,
				SpaceID:    spaceID,
				Type:       TransactionTypeIncome,
				SourceType: "RECURRING",
				SourceID:   "rec_123",
				Amount:     5000,
				Currency:   "INVALID",
				DueDate:    now,
			},
			wantErr: true,
		},
		{
			name: "zero due date",
			scheduled: ScheduledTransaction{
				ID:         stID,
				SpaceID:    spaceID,
				Type:       TransactionTypeIncome,
				SourceType: "RECURRING",
				SourceID:   "rec_123",
				Amount:     5000,
				Currency:   "USD",
				DueDate:    time.Time{},
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.scheduled.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("ScheduledTransaction.Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestParseScheduledTransactionID_Table(t *testing.T) {
	stID, _ := NewScheduledTransactionID()

	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"valid scheduled txn ID", string(stID), false},
		{"invalid prefix", "txn_12345", true},
		{"empty string", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsed, err := ParseScheduledTransactionID(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseScheduledTransactionID(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
			if !tt.wantErr && parsed != stID {
				t.Errorf("parsed = %v, want %v", parsed, stID)
			}
		})
	}
}
