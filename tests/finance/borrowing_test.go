package finance_test

import (
	"testing"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
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
		CreateAccount(t, driver.AccountOptions{
			Name:           "Checking Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 50000,
		}).
		CreateAccount(t, driver.AccountOptions{
			Name:           "Savings Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 100000,
		}).
		CreateBorrowing(t, driver.BorrowingOptions{
			Name:         "John Loan",
			Counterparty: "John",
			Direction:    financev1.Borrowing_LENT,
			Currency:     "USD",
			TotalAmount:  10000,
		}).
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
