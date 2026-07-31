package finance_test

import (
	"testing"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/tests/driver"
)

// TestAccountTransfer_LiquidityRebalancing tests single-currency transfer between accounts
// and fluently asserts account balances, total transaction count, and ledger legs with metadata callback.
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
			InitialBalance: 0, // $0.00 initial
		}).
		CreateTransfer(t, driver.TransferOptions{
			Key:          "savings_transfer",
			FromAccount:  "Checking Account",
			ToAccount:    "Savings Account",
			SourceAmount: 40000, // $400.00 transfer
			Notes:        "Transfer to savings",
		}).
		AssertAccountBalance(t, "Checking Account", 60000). // $600.00 remaining
		AssertAccountBalance(t, "Savings Account", 40000).  // $400.00 balance
		AssertTransactionCount(t, 2).
		AssertTransfer(t, "savings_transfer", func(transfer *financev1.Transfer, outflow, inflow *financev1.Transaction) {
			if outflow.Type != financev1.Transaction_TRANSFER_OUT {
				t.Errorf("expected outflow leg TRANSFER_OUT, got %s", outflow.Type)
			}
			if outflow.Amount != 40000 {
				t.Errorf("expected outflow amount 40000, got %d", outflow.Amount)
			}
			if outflow.Metadata["transfer_id"] != transfer.Id {
				t.Errorf("expected outflow transfer_id %s, got %s", transfer.Id, outflow.Metadata["transfer_id"])
			}

			if inflow.Type != financev1.Transaction_TRANSFER_IN {
				t.Errorf("expected inflow leg TRANSFER_IN, got %s", inflow.Type)
			}
			if inflow.Amount != 40000 {
				t.Errorf("expected inflow amount 40000, got %d", inflow.Amount)
			}
			if inflow.Metadata["transfer_id"] != transfer.Id {
				t.Errorf("expected inflow transfer_id %s, got %s", transfer.Id, inflow.Metadata["transfer_id"])
			}

			if outflow.Metadata["counterpart_account_id"] != inflow.GetAccountId() {
				t.Errorf("expected outflow counterpart %s, got %s", inflow.GetAccountId(), outflow.Metadata["counterpart_account_id"])
			}
			if inflow.Metadata["counterpart_account_id"] != outflow.GetAccountId() {
				t.Errorf("expected inflow counterpart %s, got %s", outflow.GetAccountId(), inflow.Metadata["counterpart_account_id"])
			}
		})
}

// TestAccountTransfer_MultiCurrencyConversion tests transfer between EUR and USD accounts
// with exchange rate conversion and fluent metadata callback assertions on both legs.
func TestAccountTransfer_MultiCurrencyConversion(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	d.Finance().
		InitSettings(t, "USD").
		CreateExchangeRate(t, "EUR", "USD", 1.08). // 1.08 rate
		CreateAccount(t, driver.AccountOptions{
			Name:           "EUR Account",
			Type:           financev1.Account_BANK,
			Currency:       "EUR",
			InitialBalance: 100000, // €1,000.00
		}).
		CreateAccount(t, driver.AccountOptions{
			Name:           "USD Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 0,
		}).
		CreateTransfer(t, driver.TransferOptions{
			Key:               "eur_usd_transfer",
			FromAccount:       "EUR Account",
			ToAccount:         "USD Account",
			SourceAmount:      50000, // €500.00
			DestinationAmount: 54000, // $540.00
			Notes:             "EUR to USD transfer",
		}).
		AssertAccountBalance(t, "EUR Account", 50000).
		AssertAccountBalance(t, "USD Account", 54000).
		AssertTransfer(t, "eur_usd_transfer", func(transfer *financev1.Transfer, outflow, inflow *financev1.Transaction) {
			if outflow.Currency != "EUR" || outflow.Amount != 50000 {
				t.Errorf("unexpected EUR outflow leg: %+v", outflow)
			}
			if inflow.Currency != "USD" || inflow.Amount != 54000 {
				t.Errorf("unexpected USD inflow leg: %+v", inflow)
			}
			if outflow.Metadata["transfer_id"] != transfer.Id || inflow.Metadata["transfer_id"] != transfer.Id {
				t.Errorf("expected transfer_id %s on both legs", transfer.Id)
			}
		})
}

// TestAccountTransfer_CreditCardRepayment tests paying down credit card debt via account transfer
// and fluently asserts resulting account balances and transaction legs.
func TestAccountTransfer_CreditCardRepayment(t *testing.T) {
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
			Name:           "Credit Card",
			Type:           financev1.Account_CREDIT_CARD,
			Currency:       "USD",
			InitialBalance: 50000, // $500.00 debt owed
		}).
		CreateTransfer(t, driver.TransferOptions{
			FromAccount:  "Checking Account",
			ToAccount:    "Credit Card",
			SourceAmount: 30000, // $300.00 payment
			Notes:        "Pay credit card",
		}).
		AssertAccountBalance(t, "Checking Account", 70000). // $700.00 remaining
		AssertAccountBalance(t, "Credit Card", 20000).      // $200.00 debt remaining
		AssertTransfer(t, "", func(transfer *financev1.Transfer, outflow, inflow *financev1.Transaction) {
			if outflow.Amount != 30000 || inflow.Amount != 30000 {
				t.Errorf("expected $300.00 transfer amounts, got outflow %d and inflow %d", outflow.Amount, inflow.Amount)
			}
		})
}
