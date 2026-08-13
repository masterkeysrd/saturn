package finance_test

import (
	"testing"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/tests/driver"
)

func setupRecurringTest(t *testing.T) (*driver.Driver, *driver.FinanceDriver) {
	t.Helper()
	d := driver.New(t, testEnv)
	d.Auth().CreateApprovedUser(t).Login(t)
	d.Space().Ensure(t, "Personal Space")

	fin := d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Checking Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 20000,
		}).
		CreateBudget(t, driver.BudgetOptions{
			Name:        "Subscriptions",
			LimitAmount: 10000,
			Currency:    "USD",
		}).
		CreateRecurringTransaction(t, "Netflix Subscription", "Subscriptions", 1500, "USD").
		AssertPendingScheduledTransactionsCount(t, 1)

	return d, fin
}

// TestRecurringSubscriptions_ScheduledTransactions tests creating recurring transactions, querying scheduled transaction details via GetScheduledTransaction API, and confirming scheduled transactions.
func TestRecurringSubscriptions_ScheduledTransactions(t *testing.T) {
	t.Run("ConfirmScheduledTransaction_ForeignCurrency_MissingRate_Fails", func(t *testing.T) {
		_, fin := setupRecurringTest(t)

		fin.ConfirmScheduledTransaction(t, driver.ConfirmScheduledTransactionOptions{
			ScheduledTransactionAmount: 1500,
			Account:                    "Checking Account",
			Currency:                   "EUR",
			ExpectErr:                  "exchange rate not found",
		}).
			AssertPendingScheduledTransactionsCount(t, 1) // Scheduled transaction remains pending on failure
	})

	t.Run("ConfirmScheduledTransaction_ForeignCurrency_RegisteredRate_Succeeds", func(t *testing.T) {
		_, fin := setupRecurringTest(t)

		fin.CreateExchangeRate(t, "EUR", "USD", 1.08).
			ConfirmScheduledTransaction(t, driver.ConfirmScheduledTransactionOptions{
				ScheduledTransactionAmount: 1500,
				Account:                    "Checking Account",
				Currency:                   "EUR",
				Amount:                     1000, // 10.00 EUR -> 1080 cents ($10.80 USD)
			}).
			AssertPendingScheduledTransactionsCount(t, 0).      // Scheduled transaction cleared/resolved
			AssertAccountBalance(t, "Checking Account", 19000). // 20000 - 1000 EUR = 19000
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetCurrency() != "EUR" {
					t.Errorf("Transaction Currency = %s, want EUR", txn.GetCurrency())
				}
				if txn.GetAmount() != 1000 {
					t.Errorf("Transaction Amount = %d, want 1000", txn.GetAmount())
				}
				if txn.GetAmountInBase() != 1080 {
					t.Errorf("Transaction AmountInBase = %d, want 1080", txn.GetAmountInBase())
				}
				if txn.GetMetadata()["recurring_transaction_id"] == "" {
					t.Errorf("expected recurring_transaction_id set in metadata")
				}
			})
	})

	t.Run("ConfirmScheduledTransaction_BaseCurrency_ExecutesExpenseAndUpdateBalances", func(t *testing.T) {
		_, fin := setupRecurringTest(t)

		fin.
			AssertPendingScheduledTransaction(t, func(sp *financev1.ScheduledTransaction) {
				if sp.GetAmount() != 1500 {
					t.Errorf("ScheduledTransaction Amount = %d, want 1500", sp.GetAmount())
				}
				if sp.GetCurrency() != "USD" {
					t.Errorf("ScheduledTransaction Currency = %s, want USD", sp.GetCurrency())
				}
			}).
			ConfirmScheduledTransaction(t, driver.ConfirmScheduledTransactionOptions{
				ScheduledTransactionAmount: 1500,
				Account:                    "Checking Account",
			}).
			AssertPendingScheduledTransactionsCount(t, 0).        // Scheduled transaction cleared/resolved from pending list
			AssertAccountBalance(t, "Checking Account", 18500).   // Balance reduced by $15.00 ($200.00 -> $185.00)
			AssertBudgetProgress(t, "Subscriptions", 1500, 8500). // $15.00 spent, $85.00 remaining
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 1500 {
					t.Errorf("Transaction Amount = %d, want 1500", txn.GetAmount())
				}
				if txn.GetType() != financev1.Transaction_EXPENSE {
					t.Errorf("Transaction Type = %v, want EXPENSE", txn.GetType())
				}
			})
	})

	t.Run("ConfirmScheduledTransaction_BaseCurrency_ExecutesIncomeAndUpdateBalances", func(t *testing.T) {
		d := driver.New(t, testEnv)
		d.Auth().CreateApprovedUser(t).Login(t)
		d.Space().Ensure(t, "Personal Space")

		fin := d.Finance().
			InitSettings(t, "USD").
			CreateAccount(t, driver.AccountOptions{
				Name:           "Checking Account",
				Type:           financev1.Account_BANK,
				Currency:       "USD",
				InitialBalance: 20000,
			}).
			CreateRecurringIncome(t, "Monthly Salary Inflow", 50000, "USD").
			AssertPendingScheduledTransactionsCount(t, 1)

		fin.
			AssertPendingScheduledTransaction(t, func(sp *financev1.ScheduledTransaction) {
				if sp.GetAmount() != 50000 {
					t.Errorf("ScheduledTransaction Amount = %d, want 50000", sp.GetAmount())
				}
				if sp.GetCurrency() != "USD" {
					t.Errorf("ScheduledTransaction Currency = %s, want USD", sp.GetCurrency())
				}
				if sp.GetType() != financev1.RecurringType_INCOME {
					t.Errorf("ScheduledTransaction Type = %v, want INCOME", sp.GetType())
				}
			}).
			ConfirmScheduledTransaction(t, driver.ConfirmScheduledTransactionOptions{
				ScheduledTransactionAmount: 50000,
				Account:                    "Checking Account",
			}).
			AssertPendingScheduledTransactionsCount(t, 0).
			AssertAccountBalance(t, "Checking Account", 70000).
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 50000 {
					t.Errorf("Transaction Amount = %d, want 50000", txn.GetAmount())
				}
				if txn.GetType() != financev1.Transaction_INCOME {
					t.Errorf("Transaction Type = %v, want INCOME", txn.GetType())
				}
			})
	})
}
