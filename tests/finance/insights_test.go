package finance_test

import (
	"testing"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/tests/driver"
)

// TestFinanceInsights_AnalyticsAggregation tests Use Case 6: Aggregated analytics & insights calculations.
func TestFinanceInsights_AnalyticsAggregation(t *testing.T) {
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
			InitialBalance: 200000,
		}).
		CreateBudget(t, driver.BudgetOptions{
			Name:        "Dining Out",
			LimitAmount: 30000,
			Currency:    "USD",
		}).
		CreateExpense(t, driver.ExpenseOptions{
			Account:     "Checking Account",
			Budget:      "Dining Out",
			Amount:      4500, // $45.00
			Description: "Friday Dinner",
		}).
		CreateExpense(t, driver.ExpenseOptions{
			Account:     "Checking Account",
			Budget:      "Dining Out",
			Amount:      2500, // $25.00
			Description: "Lunch",
		}).
		AssertSpentInsights(t, 7000) // Total spent: $70.00 (7000 cents)
}
