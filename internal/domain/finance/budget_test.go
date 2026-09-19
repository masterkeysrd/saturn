package finance_test

import (
	"strings"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

func TestBudget_ApplyPatch(t *testing.T) {
	budgetID, err := finance.NewBudgetID()
	if err != nil {
		t.Fatalf("failed generating budget ID: %v", err)
	}

	accountID, err := finance.NewAccountID()
	if err != nil {
		t.Fatalf("failed generating account ID: %v", err)
	}

	spaceID := finance.SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")

	createTime := time.Now().Add(-24 * time.Hour).UTC()
	original := &finance.Budget{
		ID:               budgetID,
		SpaceID:          spaceID,
		Name:             "Monthly Grocery",
		LimitAmount:      50000,
		Currency:         finance.Currency("USD"),
		Interval:         finance.IntervalMonthly,
		Status:           finance.BudgetStatusActive,
		Icon:             "cart",
		Color:            "green",
		DefaultAccountID: nil,
		Version:          1,
		CreateTime:       createTime,
		UpdateTime:       createTime,
	}

	t.Run("successfully patches name and limit_amount", func(t *testing.T) {
		b := *original
		incoming := &finance.Budget{
			Name:        "Weekly Grocery",
			LimitAmount: 15000,
		}

		mask := []string{"name", "limit_amount"}
		err := b.ApplyPatch(incoming, mask)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if b.Name != "Weekly Grocery" {
			t.Errorf("expected Name 'Weekly Grocery', got '%s'", b.Name)
		}
		if b.LimitAmount != 15000 {
			t.Errorf("expected LimitAmount 15000, got %d", b.LimitAmount)
		}
		if b.Currency != finance.Currency("USD") {
			t.Errorf("expected Currency USD, got %s", b.Currency)
		}
		if b.Icon != "cart" {
			t.Errorf("expected Icon 'cart', got '%s'", b.Icon)
		}
		if b.Version != 1 {
			t.Errorf("expected Version 1 (pre-persistence), got %d", b.Version)
		}
		if b.UpdateTime.Equal(createTime) {
			t.Error("expected UpdateTime to be updated")
		}
	})

	t.Run("successfully patches default_account_id pointer", func(t *testing.T) {
		b := *original
		incoming := &finance.Budget{
			DefaultAccountID: &accountID,
		}

		mask := []string{"default_account_id"}
		err := b.ApplyPatch(incoming, mask)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if b.DefaultAccountID == nil || *b.DefaultAccountID != accountID {
			t.Errorf("expected DefaultAccountID %v, got %v", accountID, b.DefaultAccountID)
		}
	})

	t.Run("fails validation if patched name is empty", func(t *testing.T) {
		b := *original
		incoming := &finance.Budget{
			Name: "",
		}

		mask := []string{"name"}
		err := b.ApplyPatch(incoming, mask)
		if err == nil {
			t.Fatal("expected error for empty name, got nil")
		}
	})
}

func TestBudget_Validate_OneTime(t *testing.T) {
	budgetID, err := finance.NewBudgetID()
	if err != nil {
		t.Fatalf("failed generating budget ID: %v", err)
	}

	spaceID := finance.SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")

	budget := &finance.Budget{
		ID:          budgetID,
		SpaceID:     spaceID,
		Name:        "Event Planning",
		LimitAmount: 100000,
		Currency:    finance.Currency("USD"),
		Interval:    finance.IntervalOneTime,
		Status:      finance.BudgetStatusActive,
	}

	if err := budget.Validate(); err != nil {
		t.Fatalf("expected Validate() to return nil for IntervalOneTime, got: %v", err)
	}
}

func TestBudget_CalculateBounds_OneTime(t *testing.T) {
	budget := &finance.Budget{
		Interval: finance.IntervalOneTime,
	}
	now := time.Now()
	start, end := budget.CalculateBounds(now)

	if start.Year() != 1970 {
		t.Errorf("expected start year 1970, got %d", start.Year())
	}
	if end.Year() != 9999 {
		t.Errorf("expected end year 9999, got %d", end.Year())
	}
}

func TestBudget_NewPeriod_And_Lifecycle(t *testing.T) {
	budgetID, _ := finance.NewBudgetID()
	spaceID := finance.SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")

	budget := &finance.Budget{
		ID:          budgetID,
		SpaceID:     spaceID,
		Name:        "Groceries",
		LimitAmount: 50000,
		Currency:    finance.Currency("USD"),
		Interval:    finance.IntervalMonthly,
		Status:      finance.BudgetStatusActive,
	}

	t.Run("NewPeriod generates valid BudgetPeriod", func(t *testing.T) {
		targetDate := time.Date(2026, 8, 15, 12, 0, 0, 0, time.UTC)
		period, err := budget.NewPeriod(finance.NewPeriodOpts{
			TargetDate:         targetDate,
			BaseCurrency:       finance.Currency("USD"),
			ExchangeRateToBase: 1.0,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if period.LimitAmount != 50000 {
			t.Errorf("period limit = %d, want 50000", period.LimitAmount)
		}
		if err := period.UpdateLimit(60000); err != nil {
			t.Fatalf("unexpected error updating period limit: %v", err)
		}
		if period.LimitAmount != 60000 {
			t.Errorf("updated period limit = %d, want 60000", period.LimitAmount)
		}
	})

	t.Run("Lifecycle: Pause, Resume, Close", func(t *testing.T) {
		if err := budget.Pause(); err != nil {
			t.Fatalf("unexpected error pausing budget: %v", err)
		}
		if budget.Status != finance.BudgetStatusPaused {
			t.Errorf("status after pause = %s, want %s", budget.Status, finance.BudgetStatusPaused)
		}

		if err := budget.Resume(); err != nil {
			t.Fatalf("unexpected error resuming budget: %v", err)
		}
		if budget.Status != finance.BudgetStatusActive {
			t.Errorf("status after resume = %s, want %s", budget.Status, finance.BudgetStatusActive)
		}

		budget.Close()
		if budget.Status != finance.BudgetStatusClosed {
			t.Errorf("status after close = %s, want %s", budget.Status, finance.BudgetStatusClosed)
		}

		if err := budget.Pause(); err == nil {
			t.Error("expected error pausing a closed budget")
		}
	})
}

func TestBudgetID(t *testing.T) {
	bID, err := finance.NewBudgetID()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	tests := []struct {
		name      string
		input     string
		wantPanic bool
		wantErr   bool
	}{
		{
			name:      "valid budget ID",
			input:     string(bID),
			wantPanic: false,
			wantErr:   false,
		},
		{
			name:      "invalid prefix",
			input:     "acc_12345",
			wantPanic: true,
			wantErr:   true,
		},
		{
			name:      "empty string",
			input:     "",
			wantPanic: true,
			wantErr:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsed, err := finance.ParseBudgetID(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseBudgetID() error = %v, wantErr %v", err, tt.wantErr)
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
						t.Errorf("MustBudgetID() did not panic for input %q", tt.input)
					}
				}()
				_ = finance.MustBudgetID(tt.input)
			} else {
				must := finance.MustBudgetID(tt.input)
				if must != parsed {
					t.Errorf("MustBudgetID() = %v, want %v", must, parsed)
				}
			}
		})
	}
}

func TestBudget_Validate_Table(t *testing.T) {
	validID, _ := finance.NewBudgetID()
	validSpace := finance.SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	validAcc, _ := finance.NewAccountID()
	invalidAcc := finance.AccountID("invalid_acc")

	tests := []struct {
		name    string
		budget  finance.Budget
		wantErr bool
	}{
		{
			name: "valid monthly budget",
			budget: finance.Budget{
				ID:          validID,
				SpaceID:     validSpace,
				Name:        "Groceries",
				LimitAmount: 50000,
				Currency:    "USD",
				Interval:    finance.IntervalMonthly,
				Status:      finance.BudgetStatusActive,
			},
			wantErr: false,
		},
		{
			name: "valid with default account",
			budget: finance.Budget{
				ID:               validID,
				SpaceID:          validSpace,
				Name:             "Dining",
				LimitAmount:      20000,
				Currency:         "USD",
				Interval:         finance.IntervalMonthly,
				DefaultAccountID: &validAcc,
			},
			wantErr: false,
		},
		{
			name: "empty name",
			budget: finance.Budget{
				ID:          validID,
				SpaceID:     validSpace,
				Name:        "   ",
				LimitAmount: 50000,
				Currency:    "USD",
				Interval:    finance.IntervalMonthly,
			},
			wantErr: true,
		},
		{
			name: "name exceeds 255 chars",
			budget: finance.Budget{
				ID:          validID,
				SpaceID:     validSpace,
				Name:        strings.Repeat("a", 256),
				LimitAmount: 50000,
				Currency:    "USD",
				Interval:    finance.IntervalMonthly,
			},
			wantErr: true,
		},
		{
			name: "limit <= 0",
			budget: finance.Budget{
				ID:          validID,
				SpaceID:     validSpace,
				Name:        "Groceries",
				LimitAmount: 0,
				Currency:    "USD",
				Interval:    finance.IntervalMonthly,
			},
			wantErr: true,
		},
		{
			name: "invalid currency",
			budget: finance.Budget{
				ID:          validID,
				SpaceID:     validSpace,
				Name:        "Groceries",
				LimitAmount: 1000,
				Currency:    "INVALID",
				Interval:    finance.IntervalMonthly,
			},
			wantErr: true,
		},
		{
			name: "invalid interval",
			budget: finance.Budget{
				ID:          validID,
				SpaceID:     validSpace,
				Name:        "Groceries",
				LimitAmount: 1000,
				Currency:    "USD",
				Interval:    finance.RecurrenceInterval("HOURLY"),
			},
			wantErr: true,
		},
		{
			name: "invalid status",
			budget: finance.Budget{
				ID:          validID,
				SpaceID:     validSpace,
				Name:        "Groceries",
				LimitAmount: 1000,
				Currency:    "USD",
				Interval:    finance.IntervalMonthly,
				Status:      finance.BudgetStatus("UNKNOWN"),
			},
			wantErr: true,
		},
		{
			name: "invalid budget ID",
			budget: finance.Budget{
				ID:          "invalid_id",
				SpaceID:     validSpace,
				Name:        "Groceries",
				LimitAmount: 1000,
				Currency:    "USD",
				Interval:    finance.IntervalMonthly,
			},
			wantErr: true,
		},
		{
			name: "invalid space ID",
			budget: finance.Budget{
				ID:          validID,
				SpaceID:     "invalid_space",
				Name:        "Groceries",
				LimitAmount: 1000,
				Currency:    "USD",
				Interval:    finance.IntervalMonthly,
			},
			wantErr: true,
		},
		{
			name: "invalid default account ID",
			budget: finance.Budget{
				ID:               validID,
				SpaceID:          validSpace,
				Name:             "Groceries",
				LimitAmount:      1000,
				Currency:         "USD",
				Interval:         finance.IntervalMonthly,
				DefaultAccountID: &invalidAcc,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			b := tt.budget
			err := b.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
			if err == nil {
				if b.Icon == "" || b.Color == "" {
					t.Errorf("expected default icon and color to be populated, got icon=%q color=%q", b.Icon, b.Color)
				}
				if b.Status == "" {
					t.Errorf("expected status to be active by default")
				}
			}
		})
	}
}

func TestBudget_SortFields(t *testing.T) {
	b := &finance.Budget{
		Name:        "Entertainment",
		LimitAmount: 45000,
	}

	tests := []struct {
		field   string
		isSort  bool
		wantVal string
	}{
		{
			field:   "name",
			isSort:  true,
			wantVal: "Entertainment",
		},
		{
			field:   "limit_amount",
			isSort:  true,
			wantVal: "000000000000045000",
		},
		{
			field:   "other",
			isSort:  false,
			wantVal: "Entertainment",
		},
	}

	for _, tt := range tests {
		t.Run(tt.field, func(t *testing.T) {
			if got := finance.IsBudgetSortField(tt.field); got != tt.isSort {
				t.Errorf("IsBudgetSortField(%q) = %v, want %v", tt.field, got, tt.isSort)
			}
			if got := b.GetSortValue(tt.field); got != tt.wantVal {
				t.Errorf("b.GetSortValue(%q) = %q, want %q", tt.field, got, tt.wantVal)
			}
		})
	}
}

func TestBudget_IsActive_And_EnsureActive(t *testing.T) {
	tests := []struct {
		status     finance.BudgetStatus
		wantActive bool
		wantErr    bool
	}{
		{
			status:     finance.BudgetStatusActive,
			wantActive: true,
			wantErr:    false,
		},
		{
			status:     finance.BudgetStatusPaused,
			wantActive: false,
			wantErr:    true,
		},
		{
			status:     finance.BudgetStatusClosed,
			wantActive: false,
			wantErr:    true,
		},
		{
			status:     "",
			wantActive: false, // Status == "" means IsActive() is false
			wantErr:    false, // EnsureActive defaults empty to active
		},
	}

	for _, tt := range tests {
		t.Run(string(tt.status), func(t *testing.T) {
			b := &finance.Budget{Name: "Test", Status: tt.status}
			if got := b.IsActive(); got != tt.wantActive {
				t.Errorf("IsActive() = %v, want %v", got, tt.wantActive)
			}
			err := b.EnsureActive()
			if (err != nil) != tt.wantErr {
				t.Errorf("EnsureActive() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestBudget_Init(t *testing.T) {
	tests := []struct {
		name    string
		budget  finance.Budget
		wantErr bool
	}{
		{
			name: "generate new ID and active status",
			budget: finance.Budget{
				Name: "Health",
			},
			wantErr: false,
		},
		{
			name: "preserve existing ID and status",
			budget: finance.Budget{
				ID:     finance.MustBudgetID("bgt_2dE1V8ZqWz4eS2N9yX3bL1mK7pO"),
				Status: finance.BudgetStatusPaused,
				Name:   "Health",
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			b := tt.budget
			err := b.Init()
			if (err != nil) != tt.wantErr {
				t.Errorf("Init() error = %v, wantErr %v", err, tt.wantErr)
			}
			if b.ID == "" {
				t.Error("expected ID to be set")
			}
			if b.Status == "" {
				t.Error("expected Status to be set")
			}
			if b.CreateTime.IsZero() || b.UpdateTime.IsZero() {
				t.Error("expected CreateTime and UpdateTime to be populated")
			}
		})
	}
}

func TestBudget_CalculateBounds_AllIntervals(t *testing.T) {
	target := time.Date(2026, 3, 15, 14, 30, 0, 0, time.UTC)

	tests := []struct {
		interval finance.RecurrenceInterval
	}{
		{finance.IntervalWeekly},
		{finance.IntervalMonthly},
		{finance.IntervalYearly},
	}

	for _, tt := range tests {
		t.Run(string(tt.interval), func(t *testing.T) {
			b := &finance.Budget{Interval: tt.interval}
			start, end := b.CalculateBounds(target)
			if start.After(end) {
				t.Errorf("start %v is after end %v", start, end)
			}
			if target.Before(start) || target.After(end) {
				t.Errorf("target %v is not within bounds [%v, %v]", target, start, end)
			}
		})
	}
}
