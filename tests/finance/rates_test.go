package finance_test

import (
	"testing"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/tests/driver"
)

// TestMultiCurrency_ExchangeRate uses subtests to verify missing vs registered exchange rate workflows and conversion calculations.
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
		CreateAccount(t, driver.AccountOptions{
			Name:           "Checking Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 100000,
		}).
		CreateBudget(t, driver.BudgetOptions{
			Name:        "Travel",
			LimitAmount: 50000,
			Currency:    "USD",
		})

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
				Amount:      5000, // 50.00 EUR
				Description: "Paris restaurant bill",
			}).
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmountInBase() != 5400 {
					t.Errorf("AmountInBase = %d, want 5400 ($54.00 USD)", txn.GetAmountInBase())
				}
			})
	})

	t.Run("ForeignCurrencyBudget_ConvertsBaseAmountAndTracksPeriod", func(t *testing.T) {
		d.Finance().
			CreateBudget(t, driver.BudgetOptions{
				Name:        "European Vacation",
				LimitAmount: 100000,
				Currency:    "EUR",
			}). // 1,000.00 EUR budget limit
			CreateExpense(t, driver.ExpenseOptions{
				Account:     "Checking Account",
				Budget:      "European Vacation",
				Currency:    "EUR",
				Amount:      10000, // 100.00 EUR expense
				Description: "Hotel reservation",
			}).
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmountInBase() != 10800 {
					t.Errorf("AmountInBase = %d, want 10800 ($108.00 USD)", txn.GetAmountInBase())
				}
			})
	})
}
