package finance_test

import (
	"testing"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/tests/driver"
)

// TestAccountTransfer_LiquidityRebalancing tests Use Case 2: Transferring funds between accounts.
func TestAccountTransfer_LiquidityRebalancing(t *testing.T) {
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
			InitialBalance: 100000, // $1,000.00

		}).
		CreateAccount(t, driver.AccountOptions{
			Name:           "Savings Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 0,
		}).                                                                                     // $0.00 initial,
		CreateTransfer(t, "Checking Account", "Savings Account", 40000, "Transfer to savings"). // $400.00 transfer
		AssertAccountBalance(t, "Checking Account", 60000).                                     // $600.00 remaining
		AssertAccountBalance(t, "Savings Account", 40000)                                       // $400.00 balance
}
