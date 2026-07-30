package finance_test

import (
	"testing"

	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestBorrowingRepayment_MultiAccountAndRollbackFlow(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, "Checking Account", "BANK", "USD", 50000).    // $500.00 initial
		CreateAccount(t, "Savings Account", "BANK", "USD", 100000).    // $1,000.00 initial
		CreateBorrowing(t, "John Loan", "John", "LENT", "USD", 10000). // $100.00 lent
		CreateRepayment(t, driver.RepaymentOptions{
			Borrowing: "John Loan",
			Account:   "Checking Account",
			Amount:    3000, // $30.00 repayment
			Notes:     "Part payment received from John",
		}).
		AssertAccountBalance(t, "Checking Account", 53000).         // $530.00 (Inflow +$30)
		AssertAccountBalance(t, "Savings Account", 100000).         // Untouched ($1,000)
		AssertBorrowingBalance(t, "John Loan", 7000).               // $70.00 remaining
		AssertRepaymentTransaction(t, "John Loan_repayment", 3000). // Transaction logged
		DeleteRepayment(t, "John Loan_repayment").
		AssertAccountBalance(t, "Checking Account", 50000). // Restored to $500.00
		AssertBorrowingBalance(t, "John Loan", 10000).      // Restored to $100.00
		AssertTransactionCount(t, 0)                        // Repayment transaction deleted
}
