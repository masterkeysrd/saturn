package finance_test

import (
	"testing"

	"github.com/masterkeysrd/saturn/tests/driver"
)

// TestRecurringSubscriptions_ScheduledPayments tests Use Case 4: Setting up recurring expenses.
func TestRecurringSubscriptions_ScheduledPayments(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, "Checking Account", "BANK", "USD", 20000).                      // $200.00 initial
		CreateBudget(t, "Subscriptions", 5000, "USD").                                   // $50.00 budget
		CreateRecurringExpense(t, "Netflix Subscription", "Subscriptions", 1500, "USD"). // $15.00/mo
		AssertAccountBalance(t, "Checking Account", 20000)                               // Account untouched initially
}
