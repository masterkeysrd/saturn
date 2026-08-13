package finance_test

import (
	"testing"
	"time"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/tests/driver"
)

// TestMonthlyBudget_ExpenseTracking tests Use Case 3: Monthly budget creation and expense logging.
func TestMonthlyBudget_ExpenseTracking(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Checking Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 100000,
		}).
		CreateBudget(t, driver.BudgetOptions{
			Name:        "Groceries",
			LimitAmount: 50000,
			Currency:    "USD",
		}).
		CreateExpense(t, driver.ExpenseOptions{
			Account:     "Checking Account",
			Budget:      "Groceries",
			Amount:      15000,
			Description: "Supermarket shopping",
		}).
		AssertAccountBalance(t, "Checking Account", 85000). // $850.00 remaining balance
		AssertBudgetProgress(t, "Groceries", 15000, 35000)  // $150 spent, $350 remaining
}

// TestBudgetDeletion_WithActiveTransactions_Fails tests that attempting to delete a budget with active transactions is rejected.
func TestBudgetDeletion_WithActiveTransactions_Fails(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Checking Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 100000,
		}).
		CreateBudget(t, driver.BudgetOptions{
			Name:        "Groceries",
			LimitAmount: 50000,
			Currency:    "USD",
		}).
		CreateExpense(t, driver.ExpenseOptions{
			Account:     "Checking Account",
			Budget:      "Groceries",
			Amount:      15000,
			Description: "Supermarket shopping",
		}).
		DeleteBudget(t, driver.BudgetDeleteOptions{
			Budget:    "Groceries",
			ExpectErr: "transactions",
		})
}

// TestOneTimeBudget_Accumulation tests multi-month spend aggregation into a single period without calendar resets.
func TestOneTimeBudget_Accumulation(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Checking Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 1000000,
		}).
		CreateBudget(t, driver.BudgetOptions{
			Name:        "Office Renovation",
			LimitAmount: 500000, // $5,000.00
			Currency:    "USD",
			Interval:    financev1.Budget_ONE_TIME,
		}).
		CreateExpense(t, driver.ExpenseOptions{
			Account:         "Checking Account",
			Budget:          "Office Renovation",
			Amount:          150000, // $1,500.00 in Month 1
			TransactionDate: time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC),
			Description:     "Initial paint and desk purchases",
		}).
		CreateExpense(t, driver.ExpenseOptions{
			Account:         "Checking Account",
			Budget:          "Office Renovation",
			Amount:          200000, // $2,000.00 in Month 4
			TransactionDate: time.Date(2026, 4, 20, 10, 0, 0, 0, time.UTC),
			Description:     "Ergonomic chairs and lighting",
		}).
		AssertBudgetProgress(t, "Office Renovation", 350000, 150000) // $3,500 spent across months, $1,500 remaining
}

// TestOneTimeBudget_OCC_And_Patch tests version checks and optimistic concurrency control for One-Time budgets.
func TestOneTimeBudget_OCC_And_Patch(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	fin := d.Finance().InitSettings(t, "USD")

	fin.CreateBudget(t, driver.BudgetOptions{
		Name:        "Equipment Upgrade",
		LimitAmount: 200000,
		Currency:    "USD",
		Interval:    financev1.Budget_ONE_TIME,
		Assert: func(tb testing.TB, b *financev1.Budget) {
			if b.GetVersion() != 1 {
				tb.Errorf("expected initial version 1, got %d", b.GetVersion())
			}
		},
	})

	client := fin.Client()
	ctx := t.Context()

	budgetsResp, err := client.ListBudgets(ctx, &financev1.ListBudgetsRequest{})
	if err != nil {
		t.Fatalf("ListBudgets failed: %v", err)
	}

	var bgt *financev1.Budget
	for _, b := range budgetsResp.GetBudgets() {
		if b.GetName() == "Equipment Upgrade" {
			bgt = b
			break
		}
	}
	if bgt == nil {
		t.Fatalf("budget Equipment Upgrade not found")
	}

	// Successful update with correct version = 1
	updated, err := client.UpdateBudget(ctx, &financev1.UpdateBudgetRequest{
		Id:      bgt.GetId(),
		Version: &bgt.Version,
		Budget: &financev1.Budget{
			Name:        "Equipment Upgrade",
			LimitAmount: 300000,
			Currency:    "USD",
			Interval:    financev1.Budget_ONE_TIME,
		},
	})
	if err != nil {
		t.Fatalf("UpdateBudget with valid version failed: %v", err)
	}

	if updated.GetVersion() != 2 {
		t.Errorf("expected version 2 after update, got %d", updated.GetVersion())
	}

	// Attempt update with stale version = 1 -> should fail
	staleVersion := int64(1)
	_, err = client.UpdateBudget(ctx, &financev1.UpdateBudgetRequest{
		Id:      bgt.GetId(),
		Version: &staleVersion,
		Budget: &financev1.Budget{
			Name:        "Equipment Upgrade",
			LimitAmount: 400000,
			Currency:    "USD",
			Interval:    financev1.Budget_ONE_TIME,
		},
	})
	if err == nil {
		t.Fatal("expected update with stale version to fail, got success")
	}
}

func TestBudgetStatus_TransactionEnforcement(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	fin := d.Finance().
		InitSettings(t, "USD")

	client := fin.Client()
	ctx := t.Context()

	// Create budget in PAUSED status
	pausedBgt, err := client.CreateBudget(ctx, &financev1.CreateBudgetRequest{
		Budget: &financev1.Budget{
			Name:        "Paused Budget",
			LimitAmount: 100000,
			Currency:    "USD",
			Interval:    financev1.Budget_MONTHLY,
			Status:      financev1.Budget_PAUSED,
		},
	})
	if err != nil {
		t.Fatalf("CreateBudget failed: %v", err)
	}

	// Attempt to log expense against paused budget -> must fail
	_, err = client.CreateExpense(ctx, &financev1.CreateExpenseRequest{
		Expense: &financev1.ExpenseInput{
			BudgetId:    pausedBgt.GetId(),
			Amount:      2500,
			Currency:    "USD",
			Description: "Test expense",
		},
	})
	if err == nil {
		t.Fatal("expected CreateExpense against PAUSED budget to fail, got success")
	}

	// Update budget to CLOSED
	_, err = client.UpdateBudget(ctx, &financev1.UpdateBudgetRequest{
		Id:      pausedBgt.GetId(),
		Version: &pausedBgt.Version,
		Budget: &financev1.Budget{
			Name:        "Closed Budget",
			LimitAmount: 100000,
			Currency:    "USD",
			Interval:    financev1.Budget_MONTHLY,
			Status:      financev1.Budget_CLOSED,
		},
	})
	if err != nil {
		t.Fatalf("UpdateBudget to CLOSED failed: %v", err)
	}

	// Attempt to log expense against closed budget -> must fail
	_, err = client.CreateExpense(ctx, &financev1.CreateExpenseRequest{
		Expense: &financev1.ExpenseInput{
			BudgetId:    pausedBgt.GetId(),
			Amount:      2500,
			Currency:    "USD",
			Description: "Test expense",
		},
	})
	if err == nil {
		t.Fatal("expected CreateExpense against CLOSED budget to fail, got success")
	}
}

func TestBudgetStatus_MultiStatusFiltering(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	fin := d.Finance().
		InitSettings(t, "USD")

	client := fin.Client()
	ctx := t.Context()

	// 1. Create Active budget
	activeBgt, err := client.CreateBudget(ctx, &financev1.CreateBudgetRequest{
		Budget: &financev1.Budget{
			Name:        "Active Budget",
			LimitAmount: 50000,
			Currency:    "USD",
			Interval:    financev1.Budget_MONTHLY,
			Status:      financev1.Budget_ACTIVE,
		},
	})
	if err != nil {
		t.Fatalf("Create active budget failed: %v", err)
	}

	// 2. Create Paused budget
	pausedBgt, err := client.CreateBudget(ctx, &financev1.CreateBudgetRequest{
		Budget: &financev1.Budget{
			Name:        "Paused Budget",
			LimitAmount: 30000,
			Currency:    "USD",
			Interval:    financev1.Budget_MONTHLY,
			Status:      financev1.Budget_PAUSED,
		},
	})
	if err != nil {
		t.Fatalf("Create paused budget failed: %v", err)
	}

	// 3. Create Closed budget
	closedBgt, err := client.CreateBudget(ctx, &financev1.CreateBudgetRequest{
		Budget: &financev1.Budget{
			Name:        "Closed Budget",
			LimitAmount: 20000,
			Currency:    "USD",
			Interval:    financev1.Budget_MONTHLY,
			Status:      financev1.Budget_CLOSED,
		},
	})
	if err != nil {
		t.Fatalf("Create closed budget failed: %v", err)
	}

	// Query ACTIVE only
	activeResp, err := client.ListBudgets(ctx, &financev1.ListBudgetsRequest{
		Statuses: []financev1.Budget_Status{financev1.Budget_ACTIVE},
	})
	if err != nil {
		t.Fatalf("ListBudgets active failed: %v", err)
	}
	if len(activeResp.GetBudgets()) != 1 || activeResp.GetBudgets()[0].GetId() != activeBgt.GetId() {
		t.Errorf("expected 1 active budget (%s), got %d", activeBgt.GetId(), len(activeResp.GetBudgets()))
	}

	// Query PAUSED + CLOSED
	inactiveResp, err := client.ListBudgets(ctx, &financev1.ListBudgetsRequest{
		Statuses: []financev1.Budget_Status{financev1.Budget_PAUSED, financev1.Budget_CLOSED},
	})
	if err != nil {
		t.Fatalf("ListBudgets paused+closed failed: %v", err)
	}
	if len(inactiveResp.GetBudgets()) != 2 {
		t.Errorf("expected 2 inactive budgets (paused+closed), got %d", len(inactiveResp.GetBudgets()))
	}
	foundIDs := map[string]bool{}
	for _, b := range inactiveResp.GetBudgets() {
		foundIDs[b.GetId()] = true
	}
	if !foundIDs[pausedBgt.GetId()] || !foundIDs[closedBgt.GetId()] {
		t.Errorf("expected paused (%s) and closed (%s) in results", pausedBgt.GetId(), closedBgt.GetId())
	}
}
