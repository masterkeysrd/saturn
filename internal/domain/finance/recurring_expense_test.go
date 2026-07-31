package finance

import (
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

func TestRecurringExpenseID(t *testing.T) {
	recID, err := NewRecurringExpenseID()
	if err != nil {
		t.Fatalf("unexpected error creating recurring expense ID: %v", err)
	}
	if err := recID.Validate(); err != nil {
		t.Errorf("expected valid recurring expense ID, got: %v", err)
	}

	parsed, err := ParseRecurringExpenseID(string(recID))
	if err != nil || parsed != recID {
		t.Errorf("failed to parse recurring expense ID: %v", err)
	}
}

func TestRecurringExpense_Validate(t *testing.T) {
	recID, _ := NewRecurringExpenseID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	budID, _ := NewBudgetID()
	now := time.Now()

	tests := []struct {
		name      string
		recurring RecurringExpense
		wantErr   bool
	}{
		{
			name: "valid monthly recurring expense",
			recurring: RecurringExpense{
				ID:          recID,
				SpaceID:     spaceID,
				BudgetID:    budID,
				Name:        "Netflix",
				Amount:      1500,
				Currency:    "USD",
				Interval:    "monthly",
				NextDueDate: now,
				Status:      RecurringExpenseActive,
			},
			wantErr: false,
		},
		{
			name: "valid weekly recurring expense",
			recurring: RecurringExpense{
				ID:          recID,
				SpaceID:     spaceID,
				BudgetID:    budID,
				Name:        "Gym",
				Amount:      1000,
				Currency:    "USD",
				Interval:    "weekly",
				NextDueDate: now,
				Status:      RecurringExpenseActive,
			},
			wantErr: false,
		},
		{
			name: "invalid interval",
			recurring: RecurringExpense{
				ID:          recID,
				SpaceID:     spaceID,
				BudgetID:    budID,
				Name:        "Software",
				Amount:      5000,
				Currency:    "USD",
				Interval:    "biweekly",
				NextDueDate: now,
				Status:      RecurringExpenseActive,
			},
			wantErr: true,
		},
		{
			name: "zero amount",
			recurring: RecurringExpense{
				ID:          recID,
				SpaceID:     spaceID,
				BudgetID:    budID,
				Name:        "Software",
				Amount:      0,
				Currency:    "USD",
				Interval:    "monthly",
				NextDueDate: now,
				Status:      RecurringExpenseActive,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.recurring.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("RecurringExpense.Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestRecurringExpense_SortFields(t *testing.T) {
	if !IsRecurringExpenseSortField("name") {
		t.Error("expected 'name' to be valid sort field")
	}
	if !IsRecurringExpenseSortField("next_due_date") {
		t.Error("expected 'next_due_date' to be valid sort field")
	}
	if IsRecurringExpenseSortField("unknown") {
		t.Error("expected 'unknown' to be invalid sort field")
	}

	now := time.Now()
	rec := &RecurringExpense{
		Name:        "Spotify",
		Amount:      999,
		NextDueDate: now,
		Status:      RecurringExpenseActive,
	}

	val := rec.GetSortValue("name")
	if val != "Spotify" {
		t.Errorf("GetSortValue('name') = %q, want 'Spotify'", val)
	}
}
