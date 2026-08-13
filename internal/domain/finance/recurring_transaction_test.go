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
	if !IsRecurringTransactionSortField("name") {
		t.Error("expected 'name' to be valid sort field")
	}
	if !IsRecurringTransactionSortField("next_due_date") {
		t.Error("expected 'next_due_date' to be valid sort field")
	}
	if IsRecurringTransactionSortField("unknown") {
		t.Error("expected 'unknown' to be invalid sort field")
	}

	now := time.Now()
	rec := &RecurringTransaction{
		Name:        "Spotify",
		Amount:      999,
		NextDueDate: now,
		Status:      RecurringTransactionActive,
	}

	val := rec.GetSortValue("name")
	if val != "Spotify" {
		t.Errorf("GetSortValue('name') = %q, want 'Spotify'", val)
	}
}
