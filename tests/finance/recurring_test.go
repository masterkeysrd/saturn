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
		CreateRecurringExpense(t, "Netflix Subscription", "Subscriptions", 1500, "USD").
		AssertPendingScheduledPaymentsCount(t, 1)

	return d, fin
}

// TestRecurringSubscriptions_ScheduledPayments tests creating recurring expenses, querying scheduled payment details via GetScheduledPayment API, and confirming scheduled payments.
func TestRecurringSubscriptions_ScheduledPayments(t *testing.T) {
	t.Run("ConfirmScheduledPayment_ForeignCurrency_MissingRate_Fails", func(t *testing.T) {
		_, fin := setupRecurringTest(t)

		fin.ConfirmScheduledPayment(t, driver.ConfirmScheduledPaymentOptions{
			Account:   "Checking Account",
			Currency:  "EUR",
			ExpectErr: "exchange rate not found",
		}).
			AssertPendingScheduledPaymentsCount(t, 1) // Scheduled payment remains pending on failure
	})

	t.Run("ConfirmScheduledPayment_ForeignCurrency_RegisteredRate_Succeeds", func(t *testing.T) {
		_, fin := setupRecurringTest(t)
		re := fin.GetLastRecurringExpense(t)

		fin.CreateExchangeRate(t, "EUR", "USD", 1.08).
			ConfirmScheduledPayment(t, driver.ConfirmScheduledPaymentOptions{
				Account:  "Checking Account",
				Currency: "EUR",
				Amount:   1000, // 10.00 EUR -> 1080 cents ($10.80 USD)
			}).
			AssertPendingScheduledPaymentsCount(t, 0).          // Scheduled payment cleared/resolved
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
				if txn.GetMetadata()["recurring_expense_id"] != re.GetId() {
					t.Errorf("Transaction Metadata[recurring_expense_id] = %q, want %q", txn.GetMetadata()["recurring_expense_id"], re.GetId())
				}
			})
	})

	t.Run("ConfirmScheduledPayment_BaseCurrency_ExecutesExpenseAndUpdateBalances", func(t *testing.T) {
		_, fin := setupRecurringTest(t)
		re := fin.GetLastRecurringExpense(t)
		sp := fin.GetPendingScheduledPayment(t)

		fin.
			AssertScheduledPayment(t, sp.GetId(), func(sp *financev1.ScheduledPayment) {
				if sp.GetAmount() != 1500 {
					t.Errorf("ScheduledPayment Amount = %d, want 1500", sp.GetAmount())
				}
				if sp.GetCurrency() != "USD" {
					t.Errorf("ScheduledPayment Currency = %s, want USD", sp.GetCurrency())
				}
			}).
			ConfirmScheduledPayment(t, driver.ConfirmScheduledPaymentOptions{
				PaymentID: sp.GetId(),
				Account:   "Checking Account",
			}).
			AssertPendingScheduledPaymentsCount(t, 0).            // Scheduled payment cleared/resolved from pending list
			AssertAccountBalance(t, "Checking Account", 18500).   // Balance reduced by $15.00 ($200.00 -> $185.00)
			AssertBudgetProgress(t, "Subscriptions", 1500, 8500). // $15.00 spent, $85.00 remaining
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 1500 {
					t.Errorf("Transaction Amount = %d, want 1500", txn.GetAmount())
				}
				if txn.GetType() != financev1.Transaction_EXPENSE {
					t.Errorf("Transaction Type = %v, want EXPENSE", txn.GetType())
				}
				if txn.GetMetadata()["recurring_expense_id"] != re.GetId() {
					t.Errorf("Transaction Metadata[recurring_expense_id] = %q, want %q", txn.GetMetadata()["recurring_expense_id"], re.GetId())
				}
				if txn.GetMetadata()["scheduled_payment_id"] != sp.GetId() {
					t.Errorf("Transaction Metadata[scheduled_payment_id] = %q, want %q", txn.GetMetadata()["scheduled_payment_id"], sp.GetId())
				}
			})
	})
}
