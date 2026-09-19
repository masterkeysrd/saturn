package finance

import (
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

func TestRecurringTransactionID(t *testing.T) {
	recID, err := NewRecurringTransactionID()
	if err != nil {
		t.Fatalf("unexpected error creating recurring transaction ID: %v", err)
	}
	if err := recID.Validate(); err != nil {
		t.Errorf("expected valid recurring transaction ID, got: %v", err)
	}

	parsed, err := ParseRecurringTransactionID(string(recID))
	if err != nil || parsed != recID {
		t.Errorf("failed to parse recurring transaction ID: %v", err)
	}
}

func TestRecurringTransaction_Validate(t *testing.T) {
	recID, _ := NewRecurringTransactionID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	budID, _ := NewBudgetID()
	now := time.Now()

	tests := []struct {
		name      string
		recurring RecurringTransaction
		wantErr   bool
	}{
		{
			name: "valid monthly recurring expense",
			recurring: RecurringTransaction{
				ID:          recID,
				SpaceID:     spaceID,
				BudgetID:    &budID,
				Name:        "Netflix",
				Amount:      1500,
				Currency:    "USD",
				Interval:    IntervalMonthly,
				NextDueDate: now,
				Status:      RecurringTransactionActive,
				Type:        TransactionTypeExpense,
			},
			wantErr: false,
		},
		{
			name: "valid monthly recurring income without budget ID",
			recurring: RecurringTransaction{
				ID:          recID,
				SpaceID:     spaceID,
				BudgetID:    nil,
				Name:        "Salary",
				Amount:      500000,
				Currency:    "USD",
				Interval:    IntervalMonthly,
				NextDueDate: now,
				Status:      RecurringTransactionActive,
				Type:        TransactionTypeIncome,
			},
			wantErr: false,
		},
		{
			name: "invalid interval",
			recurring: RecurringTransaction{
				ID:          recID,
				SpaceID:     spaceID,
				BudgetID:    &budID,
				Name:        "Software",
				Amount:      5000,
				Currency:    "USD",
				Interval:    RecurrenceInterval("biweekly"),
				NextDueDate: now,
				Status:      RecurringTransactionActive,
				Type:        TransactionTypeExpense,
			},
			wantErr: true,
		},
		{
			name: "zero amount",
			recurring: RecurringTransaction{
				ID:          recID,
				SpaceID:     spaceID,
				BudgetID:    &budID,
				Name:        "Software",
				Amount:      0,
				Currency:    "USD",
				Interval:    IntervalMonthly,
				NextDueDate: now,
				Status:      RecurringTransactionActive,
				Type:        TransactionTypeExpense,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.recurring.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("RecurringTransaction.Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestRecurringTransaction_AdvanceNextDueDateAndNewScheduledTransaction(t *testing.T) {
	recID, _ := NewRecurringTransactionID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	budID, _ := NewBudgetID()
	now := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)

	re := &RecurringTransaction{
		ID:          recID,
		SpaceID:     spaceID,
		BudgetID:    &budID,
		Name:        "SaaS Subscription",
		Amount:      4900,
		Currency:    "USD",
		Interval:    IntervalMonthly,
		NextDueDate: now,
		Status:      RecurringTransactionActive,
		Type:        TransactionTypeExpense,
	}

	spID, _ := NewScheduledTransactionID()
	sp, err := re.NewScheduledTransaction(spID)
	if err != nil {
		t.Fatalf("NewScheduledTransaction failed: %v", err)
	}

	if sp.Amount != 4900 || *sp.BudgetID != budID {
		t.Errorf("sp amount = %d, budget = %s, want 4900 and %s", sp.Amount, *sp.BudgetID, budID)
	}

	if err := re.AdvanceNextDueDate(); err != nil {
		t.Fatalf("AdvanceNextDueDate failed: %v", err)
	}

	expectedNext := time.Date(2026, 2, 15, 0, 0, 0, 0, time.UTC)
	if !re.NextDueDate.Equal(expectedNext) {
		t.Errorf("NextDueDate = %v, want %v", re.NextDueDate, expectedNext)
	}
}

func TestRecurringTransaction_SortFields(t *testing.T) {
	now := time.Date(2026, 8, 15, 10, 0, 0, 0, time.UTC)
	createTime := time.Date(2026, 8, 1, 10, 0, 0, 0, time.UTC)
	rec := &RecurringTransaction{
		Name:        "Spotify",
		Amount:      999,
		NextDueDate: now,
		Status:      RecurringTransactionActive,
		CreateTime:  createTime,
	}

	tests := []struct {
		field   string
		isSort  bool
		wantVal string
	}{
		{"name", true, "Spotify"},
		{"amount", true, "000000000000000999"},
		{"next_due_date", true, now.Format(time.RFC3339)},
		{"status", true, "active"},
		{"create_time", true, createTime.Format(time.RFC3339)},
		{"other", false, createTime.Format(time.RFC3339)},
	}

	for _, tt := range tests {
		t.Run(tt.field, func(t *testing.T) {
			if got := IsRecurringTransactionSortField(tt.field); got != tt.isSort {
				t.Errorf("IsRecurringTransactionSortField(%q) = %v, want %v", tt.field, got, tt.isSort)
			}
			if got := rec.GetSortValue(tt.field); got != tt.wantVal {
				t.Errorf("rec.GetSortValue(%q) = %q, want %q", tt.field, got, tt.wantVal)
			}
		})
	}
}

func TestRecurringTransaction_ApplyPatch(t *testing.T) {
	recID, _ := NewRecurringTransactionID()
	spaceID := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	budID, _ := NewBudgetID()
	now := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)

	original := &RecurringTransaction{
		ID:          recID,
		SpaceID:     spaceID,
		BudgetID:    &budID,
		Name:        "Old Name",
		Amount:      1000,
		Currency:    "USD",
		Interval:    IntervalMonthly,
		NextDueDate: now,
		Status:      RecurringTransactionActive,
		Type:        TransactionTypeExpense,
		Version:     1,
	}

	tests := []struct {
		name     string
		incoming RecurringTransaction
		mask     []string
		wantErr  bool
	}{
		{
			name: "patch name and amount",
			incoming: RecurringTransaction{
				Name:   "New Name",
				Amount: 2000,
			},
			mask:    []string{"name", "amount"},
			wantErr: false,
		},
		{
			name: "patch invalid field",
			incoming: RecurringTransaction{
				Name: "New Name",
			},
			mask:    []string{"invalid_field"},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			re := *original
			err := re.ApplyPatch(&tt.incoming, tt.mask)
			if (err != nil) != tt.wantErr {
				t.Errorf("ApplyPatch() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr {
				if re.Name != "New Name" || re.Amount != 2000 {
					t.Errorf("patch not applied correctly: name=%q amount=%d", re.Name, re.Amount)
				}
			}
		})
	}
}

func TestRecurringTransaction_Init(t *testing.T) {
	tests := []struct {
		name string
		rec  RecurringTransaction
	}{
		{
			name: "init with empty ID and defaults",
			rec:  RecurringTransaction{},
		},
		{
			name: "init preserving existing ID",
			rec: RecurringTransaction{
				ID:     "rec_2dE1V8ZqWz4eS2N9yX3bL1mK7pO",
				Status: RecurringTransactionPaused,
				Type:   TransactionTypeIncome,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			re := tt.rec
			if err := re.Init(); err != nil {
				t.Fatalf("Init() error = %v", err)
			}
			if re.ID == "" {
				t.Error("expected ID to be set")
			}
			if re.Status == "" {
				t.Error("expected Status to be set")
			}
			if re.Type == "" {
				t.Error("expected Type to be set")
			}
			if re.CreateTime.IsZero() || re.UpdateTime.IsZero() {
				t.Error("expected timestamps to be set")
			}
		})
	}
}

func TestRecurringTransaction_AdvanceNextDueDate_Table(t *testing.T) {
	baseDate := time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)

	tests := []struct {
		name     string
		interval RecurrenceInterval
		wantDate time.Time
		wantErr  bool
	}{
		{
			name:     "weekly adds 7 days",
			interval: IntervalWeekly,
			wantDate: time.Date(2026, 1, 22, 10, 0, 0, 0, time.UTC),
			wantErr:  false,
		},
		{
			name:     "monthly adds 1 month",
			interval: IntervalMonthly,
			wantDate: time.Date(2026, 2, 15, 10, 0, 0, 0, time.UTC),
			wantErr:  false,
		},
		{
			name:     "yearly adds 1 year",
			interval: IntervalYearly,
			wantDate: time.Date(2027, 1, 15, 10, 0, 0, 0, time.UTC),
			wantErr:  false,
		},
		{
			name:     "unsupported interval returns error",
			interval: IntervalOneTime,
			wantErr:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			re := &RecurringTransaction{
				ID:          "rec_2dE1V8ZqWz4eS2N9yX3bL1mK7pO",
				Interval:    tt.interval,
				NextDueDate: baseDate,
			}
			err := re.AdvanceNextDueDate()
			if (err != nil) != tt.wantErr {
				t.Errorf("AdvanceNextDueDate() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && !re.NextDueDate.Equal(tt.wantDate) {
				t.Errorf("NextDueDate = %v, want %v", re.NextDueDate, tt.wantDate)
			}
		})
	}
}

func TestRecurringTransaction_Validate_Table_Extended(t *testing.T) {
	recID, _ := NewRecurringTransactionID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	budID, _ := NewBudgetID()
	accID, _ := NewAccountID()
	now := time.Now().UTC()

	tests := []struct {
		name      string
		recurring RecurringTransaction
		wantErr   bool
	}{
		{
			name: "valid income without budget",
			recurring: RecurringTransaction{
				ID:          recID,
				SpaceID:     spaceID,
				Type:        TransactionTypeIncome,
				Name:        "Salary",
				Amount:      500000,
				Currency:    "USD",
				Interval:    IntervalMonthly,
				NextDueDate: now,
			},
			wantErr: false,
		},
		{
			name: "expense missing budget ID",
			recurring: RecurringTransaction{
				ID:          recID,
				SpaceID:     spaceID,
				Type:        TransactionTypeExpense,
				BudgetID:    nil,
				Name:        "Internet",
				Amount:      8000,
				Currency:    "USD",
				Interval:    IntervalMonthly,
				NextDueDate: now,
			},
			wantErr: true,
		},
		{
			name: "invalid recurring transaction type",
			recurring: RecurringTransaction{
				ID:          recID,
				SpaceID:     spaceID,
				Type:        TransactionTypeTransferOut,
				Name:        "Transfer",
				Amount:      8000,
				Currency:    "USD",
				Interval:    IntervalMonthly,
				NextDueDate: now,
			},
			wantErr: true,
		},
		{
			name: "recurring transaction cannot have one_time interval",
			recurring: RecurringTransaction{
				ID:          recID,
				SpaceID:     spaceID,
				Type:        TransactionTypeExpense,
				BudgetID:    &budID,
				Name:        "One Timer",
				Amount:      1000,
				Currency:    "USD",
				Interval:    IntervalOneTime,
				NextDueDate: now,
			},
			wantErr: true,
		},
		{
			name: "zero next due date",
			recurring: RecurringTransaction{
				ID:          recID,
				SpaceID:     spaceID,
				Type:        TransactionTypeExpense,
				BudgetID:    &budID,
				Name:        "Subscription",
				Amount:      1000,
				Currency:    "USD",
				Interval:    IntervalMonthly,
				NextDueDate: time.Time{},
			},
			wantErr: true,
		},
		{
			name: "valid with account ID",
			recurring: RecurringTransaction{
				ID:          recID,
				SpaceID:     spaceID,
				AccountID:   &accID,
				Type:        TransactionTypeIncome,
				Name:        "Consulting",
				Amount:      250000,
				Currency:    "USD",
				Interval:    IntervalWeekly,
				NextDueDate: now,
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.recurring.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("RecurringTransaction.Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestParseRecurringTransactionID_Table(t *testing.T) {
	recID, _ := NewRecurringTransactionID()

	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"valid recurring txn ID", string(recID), false},
		{"invalid prefix", "bgt_12345", true},
		{"empty string", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsed, err := ParseRecurringTransactionID(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseRecurringTransactionID(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
			if !tt.wantErr && parsed != recID {
				t.Errorf("parsed = %v, want %v", parsed, recID)
			}
		})
	}
}
