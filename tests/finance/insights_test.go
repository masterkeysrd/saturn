//go:build integration

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

// TestFinanceInsights_ClosedBudgetFiltering verifies that:
// 1. Active budgets (with or without spend) are included in insights metrics.
// 2. Closed budgets with zero spend are excluded from insights (preventing ghost limits).
// 3. Closed budgets with activity in the period are preserved in insights (preserving historical accounting).
func TestFinanceInsights_ClosedBudgetFiltering(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Main Checking",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 500000,
		}).
		// Budget A: Active with spend ($300 limit, $100 spent)
		CreateBudget(t, driver.BudgetOptions{
			Name:        "Dining Out",
			LimitAmount: 30000,
			Currency:    "USD",
		}).
		CreateExpense(t, driver.ExpenseOptions{
			Account:     "Main Checking",
			Budget:      "Dining Out",
			Amount:      10000, // $100.00
			Description: "Dinner with friends",
		}).
		// Budget B: Active with zero spend ($500 limit, $0 spent)
		CreateBudget(t, driver.BudgetOptions{
			Name:        "Groceries",
			LimitAmount: 50000,
			Currency:    "USD",
		}).
		// Budget C: Closed with zero spend ($1000 limit, $0 spent -> must be EXCLUDED!)
		CreateBudget(t, driver.BudgetOptions{
			Name:        "Old Trip",
			LimitAmount: 100000,
			Currency:    "USD",
		}).
		CloseBudget(t, "Old Trip").
		// Budget D: Closed with activity ($200 limit, $50 spent -> must be INCLUDED!)
		CreateBudget(t, driver.BudgetOptions{
			Name:        "Renovations",
			LimitAmount: 20000,
			Currency:    "USD",
		}).
		CreateExpense(t, driver.ExpenseOptions{
			Account:     "Main Checking",
			Budget:      "Renovations",
			Amount:      5000, // $50.00
			Description: "Paint supplies",
		}).
		CloseBudget(t, "Renovations").
		// Expected Total Limit: $300 (Dining) + $500 (Groceries) + $200 (Renovations) = $1,000 (100,000 cents).
		// "Old Trip" ($1,000) must NOT be counted in TotalLimit!
		// Expected Total Spent: $100 (Dining) + $50 (Renovations) = $150 (15,000 cents).
		AssertSpentInsightsDetailed(t, driver.SpentInsightsAssertions{
			TotalSpent: 15000,
			TotalLimit: 100000,
			ExpectedBudgetNames: []string{
				"Dining Out",
				"Groceries",
				"Renovations",
			},
			OmittedBudgetNames: []string{
				"Old Trip",
			},
		})
}
