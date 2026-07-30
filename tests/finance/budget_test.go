package finance_test

import (
	"testing"

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
		CreateAccount(t, "Checking Account", "BANK", "USD", 100000). // $1,000.00
		CreateBudget(t, "Groceries", 50000, "USD").                  // $500.00 monthly budget
		CreateExpense(t, driver.ExpenseOptions{
			Account:     "Checking Account",
			Budget:      "Groceries",
			Amount:      15000,
			Description: "Supermarket shopping",
		}).
		AssertAccountBalance(t, "Checking Account", 85000).          // $850.00 remaining balance
		AssertBudgetProgress(t, "Groceries", 15000, 35000)           // $150 spent, $350 remaining
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
		CreateAccount(t, "Checking Account", "BANK", "USD", 100000).
		CreateBudget(t, "Groceries", 50000, "USD").
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
