package finance_test

import (
	"testing"

	"github.com/masterkeysrd/saturn/tests/driver"
)

// TestMultiCurrency_ExchangeRate uses subtests to verify missing vs registered exchange rate workflows.
func TestMultiCurrency_ExchangeRate(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		Register(t).
		Approve(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, "Checking Account", "BANK", "USD", 100000).
		CreateBudget(t, "Travel", 50000, "USD")

	t.Run("MissingRate_RejectsTransaction", func(t *testing.T) {
		d.Finance().CreateExpense(t, driver.ExpenseOptions{
			Account:   "Checking Account",
			Budget:    "Travel",
			Currency:  "EUR",
			Amount:    5000,
			ExpectErr: "rate",
		})
	})

	t.Run("RegisteredRate_AllowsTransaction", func(t *testing.T) {
		d.Finance().
			CreateExchangeRate(t, "EUR", "USD", 1.08).
			CreateExpense(t, driver.ExpenseOptions{
				Account:     "Checking Account",
				Budget:      "Travel",
				Currency:    "EUR",
				Amount:      5000,
				Description: "Paris restaurant bill",
			})
	})
}
