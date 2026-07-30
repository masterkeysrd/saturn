package finance_test

import (
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
		IsActive:         true,
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
