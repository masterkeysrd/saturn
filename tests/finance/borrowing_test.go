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
		LogBorrowingTransaction(t, driver.LogBorrowingTransactionOptions{
			Borrowing: "John Loan",
			Account:   "Checking Account",
			Type:      financev1.BorrowingTransactionType_BORROWING_TRANSACTION_TYPE_PAYMENT,
			Amount:    3000, // $30.00 repayment
			Notes:     "Part payment received from John",
			Key:       "John Loan_repayment",
		}).
		AssertAccountBalance(t, "Checking Account", 53000).         // $530.00 (Inflow +$30)
		AssertAccountBalance(t, "Savings Account", 100000).         // Untouched ($1,000)
		AssertBorrowingBalance(t, "John Loan", 7000).               // $70.00 remaining
		AssertBorrowingTransaction(t, "John Loan_repayment", 3000). // Transaction logged
		DeleteBorrowingTransaction(t, "John Loan_repayment").
		AssertAccountBalance(t, "Checking Account", 50000). // Restored to $500.00
		AssertBorrowingBalance(t, "John Loan", 10000).      // Restored to $100.00
		AssertTransactionCount(t, 0)                        // Repayment transaction deleted
}

func TestBorrowingBalanceAdjustmentLentFlow(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Main Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 100000, // $1,000.00
		}).
		CreateBorrowing(t, driver.BorrowingOptions{
			Name:         "Alice Loan",
			Counterparty: "Alice",
			Direction:    financev1.Borrowing_LENT,
			Currency:     "USD",
			TotalAmount:  50000, // $500.00
		}).
		AssertBorrowingBalance(t, "Alice Loan", 50000).
		// 1. Decrease LENT remaining balance ($500 -> $300): Bank receives +$200 INFLOW
		AdjustBorrowingBalance(t, driver.AdjustBorrowingBalanceOptions{
			Borrowing:     "Alice Loan",
			TargetBalance: 30000,
			Account:       "Main Account",
			Notes:         "Repayment adjustment",
		}).
		AssertBorrowingBalance(t, "Alice Loan", 30000).
		AssertAccountBalance(t, "Main Account", 120000). // 100000 + 20000 = 120000 ($1,200)
		// 2. Increase LENT remaining balance ($300 -> $450): Bank pays -$150 OUTFLOW
		AdjustBorrowingBalance(t, driver.AdjustBorrowingBalanceOptions{
			Borrowing:     "Alice Loan",
			TargetBalance: 45000,
			Account:       "Main Account",
			Notes:         "Additional loan payout",
		}).
		AssertBorrowingBalance(t, "Alice Loan", 45000).
		AssertAccountBalance(t, "Main Account", 105000). // 120000 - 15000 = 105000 ($1,050)
		AssertBorrowingTransactions(t, "Alice Loan", func(repayments []*financev1.Transaction) {
			if len(repayments) != 2 {
				t.Fatalf("Expected 2 adjustment repayment records, got %d", len(repayments))
			}
		}).
		AssertTransactions(t, func(txns []*financev1.Transaction) {
			if len(txns) != 2 {
				t.Fatalf("Expected 2 adjustment transactions, got %d", len(txns))
			}
			for _, txn := range txns {
				if txn.GetMetadata()["borrowing_role"] == "ADJUSTMENT" {
					if txn.GetAmountInBase() == 0 {
						t.Errorf("Adjustment transaction ID %s has AmountInBase = 0, want non-zero base amount", txn.GetId())
					}
				}
			}
		})
}

func TestBorrowingBalanceAdjustmentBorrowedFlow(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Credit Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 100000, // $1,000.00
		}).
		CreateBorrowing(t, driver.BorrowingOptions{
			Name:         "Bob Loan",
			Counterparty: "Bob",
			Direction:    financev1.Borrowing_BORROWED,
			Currency:     "USD",
			TotalAmount:  50000, // $500.00
		}).
		AssertBorrowingBalance(t, "Bob Loan", 50000).
		// Adjust balance down (decrease debt to $300): BORROWED decrease = OUTFLOW from bank (-$200)
		AdjustBorrowingBalance(t, driver.AdjustBorrowingBalanceOptions{
			Borrowing:     "Bob Loan",
			TargetBalance: 30000,
			Account:       "Credit Account",
			Notes:         "Partial payment to Bob",
		}).
		AssertBorrowingBalance(t, "Bob Loan", 30000).
		AssertAccountBalance(t, "Credit Account", 80000). // 100000 - 20000 = 80000 ($800)
		// Adjust balance up (increase debt to $450): BORROWED increase = INFLOW to bank (+$150)
		AdjustBorrowingBalance(t, driver.AdjustBorrowingBalanceOptions{
			Borrowing:     "Bob Loan",
			TargetBalance: 45000,
			Account:       "Credit Account",
			Notes:         "Borrowed additional $150 from Bob",
		}).
		AssertBorrowingBalance(t, "Bob Loan", 45000).
		AssertAccountBalance(t, "Credit Account", 95000) // 80000 + 15000 = 95000 ($950)
}

func TestBorrowingBalanceAdjustmentWithoutAccountFlow(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Checking",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 100000, // $1,000.00
		}).
		CreateBorrowing(t, driver.BorrowingOptions{
			Name:         "Charlie Loan",
			Counterparty: "Charlie",
			Direction:    financev1.Borrowing_LENT,
			Currency:     "USD",
			TotalAmount:  50000, // $500.00
		}).
		AssertBorrowingBalance(t, "Charlie Loan", 50000).
		// Adjust balance to 0 without specifying an Account (e.g. debt waived)
		AdjustBorrowingBalance(t, driver.AdjustBorrowingBalanceOptions{
			Borrowing:     "Charlie Loan",
			TargetBalance: 0,
			Notes:         "Waived debt for Charlie",
		}).
		AssertBorrowingBalance(t, "Charlie Loan", 0).
		AssertAccountBalance(t, "Checking", 100000) // Bank account remains untouched!
}

func TestBorrowingUpdateFlow(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	d.Finance().
		InitSettings(t, "USD").
		CreateBorrowing(t, driver.BorrowingOptions{
			Name:         "David Loan",
			Counterparty: "David",
			Direction:    financev1.Borrowing_LENT,
			Currency:     "USD",
			TotalAmount:  50000, // $500.00
		}).
		AssertBorrowingBalance(t, "David Loan", 50000).
		// Update borrowing metadata and total amount
		UpdateBorrowing(t, driver.UpdateBorrowingOptions{
			Borrowing:    "David Loan",
			TotalAmount:  75000, // $750.00
			Counterparty: "David Miller",
		}).
		AssertBorrowingBalance(t, "David Loan", 75000)
}

func TestBorrowingUpdateWithLinkedAccountFlow(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Main Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 100000, // $1,000.00
		}).
		// Create borrowing linked to bank account (LENT $500 from Main Account)
		CreateBorrowing(t, driver.BorrowingOptions{
			Name:         "Frank Loan",
			Counterparty: "Frank",
			Direction:    financev1.Borrowing_LENT,
			Currency:     "USD",
			TotalAmount:  50000, // $500.00
			Account:      "Main Account",
		}).
		AssertBorrowingBalance(t, "Frank Loan", 50000).
		AssertAccountBalance(t, "Main Account", 50000). // 100000 - 50000 = 50000 ($500)
		// Update borrowing total amount to $800 with auto-sync enabled
		UpdateBorrowing(t, driver.UpdateBorrowingOptions{
			Borrowing:   "Frank Loan",
			TotalAmount: 80000, // $800.00
			Account:     "Main Account",
		}).
		AssertBorrowingBalance(t, "Frank Loan", 80000).
		AssertAccountBalance(t, "Main Account", 20000) // 100000 - 80000 = 20000 ($200)
}

func TestBorrowingUpdateWithoutSyncFlow(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Vault",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 100000, // $1,000.00
		}).
		// Create borrowing without linking bank account
		CreateBorrowing(t, driver.BorrowingOptions{
			Name:         "George Loan",
			Counterparty: "George",
			Direction:    financev1.Borrowing_LENT,
			Currency:     "USD",
			TotalAmount:  50000, // $500.00
		}).
		AssertBorrowingBalance(t, "George Loan", 50000).
		AssertAccountBalance(t, "Vault", 100000). // Vault is untouched ($1,000.00)
		// Update borrowing total amount to $600 without sync (omitting Account)
		UpdateBorrowing(t, driver.UpdateBorrowingOptions{
			Borrowing:   "George Loan",
			TotalAmount: 60000, // $600.00
		}).
		AssertBorrowingBalance(t, "George Loan", 60000).
		AssertAccountBalance(t, "Vault", 100000) // Bank balance remains untouched at $1,000.00!
}

func TestBorrowingTransactionDisbursementFlow(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Main Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 100000, // $1,000.00
		}).
		CreateBorrowing(t, driver.BorrowingOptions{
			Name:         "Helen Loan",
			Counterparty: "Helen",
			Direction:    financev1.Borrowing_LENT,
			Currency:     "USD",
			TotalAmount:  50000, // $500.00
		}).
		AssertBorrowingBalance(t, "Helen Loan", 50000).
		// 1. Log Disbursement (additional loan of $200): TotalAmount becomes $700, RemainingAmount becomes $700, Bank pays -$200 OUTFLOW
		LogBorrowingTransaction(t, driver.LogBorrowingTransactionOptions{
			Borrowing: "Helen Loan",
			Type:      financev1.BorrowingTransactionType_BORROWING_TRANSACTION_TYPE_DISBURSEMENT,
			Amount:    20000, // $200.00
			Account:   "Main Account",
			Notes:     "Second loan installment",
		}).
		AssertBorrowingBalance(t, "Helen Loan", 70000).
		AssertAccountBalance(t, "Main Account", 80000). // 100000 - 20000 = 80000 ($800)
		// 2. Log Payment (repayment of $300): RemainingAmount becomes $400, Bank receives +$300 INFLOW
		LogBorrowingTransaction(t, driver.LogBorrowingTransactionOptions{
			Borrowing: "Helen Loan",
			Type:      financev1.BorrowingTransactionType_BORROWING_TRANSACTION_TYPE_PAYMENT,
			Amount:    30000, // $300.00
			Account:   "Main Account",
			Notes:     "Partial repayment",
		}).
		AssertBorrowingBalance(t, "Helen Loan", 40000).
		AssertAccountBalance(t, "Main Account", 110000) // 80000 + 30000 = 110000 ($1,100)
}
