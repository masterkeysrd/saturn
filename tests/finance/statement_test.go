package finance_test

import (
	"testing"
	"time"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestStatementReconciliation_Import_Get_And_Suggestions(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Chase Checking",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 100000, // $1,000.00
		}).
		CreateBudget(t, driver.BudgetOptions{
			Name:        "Dining",
			LimitAmount: 50000,
			Currency:    "USD",
			Interval:    financev1.Budget_MONTHLY,
		}).
		CreateExpense(t, driver.ExpenseOptions{
			Account:         "Chase Checking",
			Budget:          "Dining",
			Currency:        "USD",
			Amount:          2500, // $25.00
			Description:     "Starbucks Coffee",
			TransactionDate: time.Date(2026, 8, 10, 10, 0, 0, 0, time.UTC),
		})

	rawCSV := `Date,Description,Amount
2026-08-10,Starbucks Coffee,-25.00
2026-08-11,Salary Payroll,3000.00
2026-08-12,Planet Fitness,-50.00`

	// 1. Import statement CSV
	d.Finance().
		ImportStatement(t, driver.ImportStatementOptions{
			Account:         "Chase Checking",
			StatementDate:   "2026-08-12",
			StartingBalance: 100000, // $1,000.00
			EndingBalance:   392500, // $3,925.00 (Net flow: -25 + 3000 - 50 = +2925)
			Filename:        "august_statement.csv",
			RawContent:      rawCSV,
			Name:            "august_stmt",
			Assert: func(tb testing.TB, stmt *financev1.Statement) {
				if stmt.GetStatus() != financev1.Statement_IN_PROGRESS {
					tb.Errorf("statement status = %s, want IN_PROGRESS", stmt.GetStatus())
				}
				if stmt.GetStatementStartingBalance() != 100000 {
					tb.Errorf("starting balance = %d, want 100000", stmt.GetStatementStartingBalance())
				}
				if stmt.GetStatementEndingBalance() != 392500 {
					tb.Errorf("ending balance = %d, want 392500", stmt.GetStatementEndingBalance())
				}
				if stmt.GetVersion() != 1 {
					tb.Errorf("version = %d, want 1", stmt.GetVersion())
				}
			},
		})

	// 2. Query via GetStatement (verifying via API get without direct DB query)
	d.Finance().
		GetStatement(t, "august_stmt", func(tb testing.TB, stmt *financev1.Statement) {
			if stmt.GetFilename() != "august_statement.csv" {
				tb.Errorf("filename = %q, want august_statement.csv", stmt.GetFilename())
			}
			if stmt.GetStatementDate() != "2026-08-12" {
				tb.Errorf("statement date = %s, want 2026-08-12", stmt.GetStatementDate())
			}
			if stmt.GetVersion() != 1 {
				tb.Errorf("version = %d, want 1", stmt.GetVersion())
			}
		})

	// 3. Query Statement Lines & Verify dynamic matching suggestions
	d.Finance().
		ListStatementLines(t, "august_stmt", func(tb testing.TB, lines []*financev1.StatementLine) {
			if len(lines) != 3 {
				tb.Fatalf("lines count = %d, want 3", len(lines))
			}

			// Line 0: Starbucks (-$25.00) should have suggestions pointing to existing transaction
			line0 := lines[0]
			if line0.GetDescription() != "Starbucks Coffee" || line0.GetAmount() != -2500 {
				tb.Errorf("line 0 mismatch: desc=%s, amount=%d", line0.GetDescription(), line0.GetAmount())
			}
			if line0.GetStatus() != financev1.StatementLine_UNMATCHED {
				tb.Errorf("line 0 status = %s, want UNMATCHED", line0.GetStatus())
			}
			if line0.GetVersion() != 1 {
				tb.Errorf("line 0 version = %d, want 1", line0.GetVersion())
			}
			sug0 := line0.GetSuggestions()
			if sug0 == nil {
				tb.Fatal("line 0 expected dynamic suggestions, got nil")
			}
			if len(sug0.GetMatches()) == 0 {
				tb.Error("line 0 expected suggested matches for Starbucks, got 0")
			} else if sug0.GetMatches()[0].GetDescription() != "Starbucks Coffee" {
				tb.Errorf("line 0 match desc = %s, want Starbucks Coffee", sug0.GetMatches()[0].GetDescription())
			}

			// Line 1: Salary (+$3,000.00)
			line1 := lines[1]
			if line1.GetAmount() != 300000 || line1.GetDescription() != "Salary Payroll" {
				tb.Errorf("line 1 mismatch: desc=%s, amount=%d", line1.GetDescription(), line1.GetAmount())
			}

			// Line 2: Gym (-$50.00)
			line2 := lines[2]
			if line2.GetAmount() != -5000 || line2.GetDescription() != "Planet Fitness" {
				tb.Errorf("line 2 mismatch: desc=%s, amount=%d", line2.GetDescription(), line2.GetAmount())
			}
		})
}

func TestStatementReconciliation_OptimisticLocking(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Savings Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 50000,
		})

	rawCSV := `Date,Description,Amount
2026-08-01,Groceries,-100.00`

	d.Finance().
		ImportStatement(t, driver.ImportStatementOptions{
			Account:         "Savings Account",
			StatementDate:   "2026-08-01",
			StartingBalance: 50000,
			EndingBalance:   40000,
			Filename:        "stmt.csv",
			RawContent:      rawCSV,
			Name:            "lock_stmt",
		})

	// 1. Update Statement EndingBalance with Version 1 -> Version becomes 2
	ver1 := int64(1)
	newBal := int64(45000)
	d.Finance().
		UpdateStatement(t, driver.StatementUpdateOptions{
			Statement:     "lock_stmt",
			EndingBalance: &newBal,
			UpdateMask:    []string{"statement_ending_balance"},
			Version:       &ver1,
			Assert: func(tb testing.TB, stmt *financev1.Statement) {
				if stmt.GetVersion() != 2 {
					tb.Errorf("statement version = %d, want 2", stmt.GetVersion())
				}
				if stmt.GetStatementEndingBalance() != 45000 {
					tb.Errorf("ending balance = %d, want 45000", stmt.GetStatementEndingBalance())
				}
			},
		})

	// 2. Update Statement with stale Version 1 -> Should fail with Version Mismatch
	staleVer := int64(1)
	invalidBal := int64(60000)
	d.Finance().
		UpdateStatement(t, driver.StatementUpdateOptions{
			Statement:     "lock_stmt",
			EndingBalance: &invalidBal,
			UpdateMask:    []string{"statement_ending_balance"},
			Version:       &staleVer,
			ExpectErr:     "version mismatch",
		})

	// 3. Test StatementLine Versioning
	var lineID string
	d.Finance().
		ListStatementLines(t, "lock_stmt", func(tb testing.TB, lines []*financev1.StatementLine) {
			if len(lines) == 0 {
				tb.Fatal("expected at least 1 line")
			}
			lineID = lines[0].GetId()
		})

	// Update line with version 1 -> becomes 2
	lineVer1 := int64(1)
	d.Finance().
		UpdateStatementLine(t, driver.StatementLineUpdateOptions{
			LineID: lineID,
			Action: &financev1.StatementLine{
				Action: &financev1.StatementLine_Skip{
					Skip: &financev1.StatementLine_SkipAction{},
				},
				Status: financev1.StatementLine_SKIPPED,
			},
			UpdateMask: []string{"action", "status"},
			Version:    &lineVer1,
			Assert: func(tb testing.TB, line *financev1.StatementLine) {
				if line.GetVersion() != 2 {
					tb.Errorf("line version = %d, want 2", line.GetVersion())
				}
				if line.GetStatus() != financev1.StatementLine_SKIPPED {
					tb.Errorf("line status = %s, want SKIPPED", line.GetStatus())
				}
			},
		})

	// Update line with stale version 1 -> fails
	staleLineVer := int64(1)
	d.Finance().
		UpdateStatementLine(t, driver.StatementLineUpdateOptions{
			LineID: lineID,
			Action: &financev1.StatementLine{
				Action: &financev1.StatementLine_CreateIncome{
					CreateIncome: &financev1.StatementLine_CreateIncomeAction{},
				},
			},
			UpdateMask: []string{"action"},
			Version:    &staleLineVer,
			ExpectErr:  "version mismatch",
		})

	// 4. Delete Statement with stale Version 1 -> fails
	staleDeleteVer := int64(1)
	d.Finance().
		DeleteStatement(t, "lock_stmt", &staleDeleteVer, "version mismatch")

	// Delete Statement with current Version 2 -> succeeds
	currentVer := int64(2)
	d.Finance().
		DeleteStatement(t, "lock_stmt", &currentVer, "")
}

func TestStatementReconciliation_EndToEndLifecycle(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	var supermarketTxnID string

	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Main Checking",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 500000, // $5,000.00
		}).
		CreateAccount(t, driver.AccountOptions{
			Name:           "Emergency Savings",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 1000000, // $10,000.00
		}).
		CreateBudget(t, driver.BudgetOptions{
			Name:        "Groceries",
			LimitAmount: 80000,
			Currency:    "USD",
			Interval:    financev1.Budget_MONTHLY,
		}).
		CreateBudget(t, driver.BudgetOptions{
			Name:        "Healthcare",
			LimitAmount: 20000,
			Currency:    "USD",
			Interval:    financev1.Budget_MONTHLY,
		}).
		CreateExpense(t, driver.ExpenseOptions{
			Account:         "Main Checking",
			Budget:          "Groceries",
			Currency:        "USD",
			Amount:          4000, // $40.00
			Description:     "Supermarket",
			TransactionDate: time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC),
			Assert: func(tb testing.TB, txn *financev1.Transaction) {
				supermarketTxnID = txn.GetId()
			},
		}).
		CreateRecurringTransaction(t, "Internet Bill", "Healthcare", 12000, "USD").
		CreateBorrowing(t, driver.BorrowingOptions{
			Counterparty: "Alice",
			Direction:    financev1.Borrowing_LENT,
			Currency:     "USD",
			TotalAmount:  50000, // $500.00
		})

	rawCSV := `Date,Description,Amount
2026-08-01,Supermarket Groceries,-40.00
2026-08-02,CVS Pharmacy,-75.00
2026-08-03,Client Consulting,2500.00
2026-08-04,Transfer to Emergency,-500.00
2026-08-05,Comcast Internet,-120.00
2026-08-06,Alice Partial Loan Return,100.00
2026-08-07,Skipped Bank Fee,-15.00`

	// Net cash flow: -40 - 75 + 2500 - 500 - 120 + 100 = +1865.00 (+186500 cents)
	// (Skipped fee is ignored in expected flow)
	startingBal := int64(500000)
	endingBal := int64(686500)

	// 1. Import Statement
	d.Finance().
		ImportStatement(t, driver.ImportStatementOptions{
			Account:         "Main Checking",
			StatementDate:   "2026-08-10",
			StartingBalance: startingBal,
			EndingBalance:   endingBal,
			Filename:        "lifecycle_stmt.csv",
			RawContent:      rawCSV,
			Name:            "life_stmt",
		})

	// 2. Fetch Lines and prepare draft actions
	var lines []*financev1.StatementLine
	d.Finance().
		ListStatementLines(t, "life_stmt", func(tb testing.TB, fetched []*financev1.StatementLine) {
			if len(fetched) != 7 {
				tb.Fatalf("expected 7 statement lines, got %d", len(fetched))
			}
			lines = fetched
		})

	var (
		groceriesBudgetID  = d.State().Budgets["Groceries"]
		healthcareBudgetID = d.State().Budgets["Healthcare"]
		savingsAccountID   = d.State().Accounts["Emergency Savings"].ID
		scheduledTxnID     = d.State().LastScheduledTransactionID
		borrowingID        = d.State().LastBorrowing.ID
	)

	// Line 0: Match existing transaction
	d.Finance().
		UpdateStatementLine(t, driver.StatementLineUpdateOptions{
			LineID: lines[0].GetId(),
			Action: &financev1.StatementLine{
				Action: &financev1.StatementLine_Match{
					Match: &financev1.StatementLine_MatchAction{
						TransactionId: supermarketTxnID,
					},
				},
				Status: financev1.StatementLine_MATCHED,
			},
			UpdateMask: []string{"action", "status"},
		})

	// Line 1: Create standalone Expense
	d.Finance().
		UpdateStatementLine(t, driver.StatementLineUpdateOptions{
			LineID: lines[1].GetId(),
			Action: &financev1.StatementLine{
				Action: &financev1.StatementLine_CreateExpense{
					CreateExpense: &financev1.StatementLine_CreateExpenseAction{
						BudgetId: healthcareBudgetID,
					},
				},
			},
			UpdateMask: []string{"action"},
		})

	// Line 2: Create standalone Income
	d.Finance().
		UpdateStatementLine(t, driver.StatementLineUpdateOptions{
			LineID: lines[2].GetId(),
			Action: &financev1.StatementLine{
				Action: &financev1.StatementLine_CreateIncome{
					CreateIncome: &financev1.StatementLine_CreateIncomeAction{},
				},
			},
			UpdateMask: []string{"action"},
		})

	// Line 3: Create Transfer to Savings
	d.Finance().
		UpdateStatementLine(t, driver.StatementLineUpdateOptions{
			LineID: lines[3].GetId(),
			Action: &financev1.StatementLine{
				Action: &financev1.StatementLine_CreateTransfer{
					CreateTransfer: &financev1.StatementLine_CreateTransferAction{
						CounterpartAccountId: savingsAccountID,
					},
				},
			},
			UpdateMask: []string{"action"},
		})

	// Line 4: Confirm Scheduled Payment
	d.Finance().
		UpdateStatementLine(t, driver.StatementLineUpdateOptions{
			LineID: lines[4].GetId(),
			Action: &financev1.StatementLine{
				Action: &financev1.StatementLine_ConfirmScheduled{
					ConfirmScheduled: &financev1.StatementLine_ConfirmScheduledAction{
						ScheduledTransactionId: scheduledTxnID,
					},
				},
			},
			UpdateMask: []string{"action"},
		})

	// Line 5: Repay Borrowing
	d.Finance().
		UpdateStatementLine(t, driver.StatementLineUpdateOptions{
			LineID: lines[5].GetId(),
			Action: &financev1.StatementLine{
				Action: &financev1.StatementLine_CreateRepayment{
					CreateRepayment: &financev1.StatementLine_CreateRepaymentAction{
						BorrowingId: borrowingID,
					},
				},
			},
			UpdateMask: []string{"action"},
		})

	// Line 6: Skip
	d.Finance().
		UpdateStatementLine(t, driver.StatementLineUpdateOptions{
			LineID: lines[6].GetId(),
			Action: &financev1.StatementLine{
				Action: &financev1.StatementLine_Skip{
					Skip: &financev1.StatementLine_SkipAction{},
				},
				Status: financev1.StatementLine_SKIPPED,
			},
			UpdateMask: []string{"action", "status"},
		})

	// 3. Complete Statement Reconciliation
	d.Finance().
		CompleteStatement(t, "life_stmt", "", func(tb testing.TB, stmt *financev1.Statement) {
			if stmt.GetStatus() != financev1.Statement_COMPLETED {
				tb.Errorf("statement status = %s, want COMPLETED", stmt.GetStatus())
			}
		})

	// 4. Verify Final State via GetStatement
	d.Finance().
		GetStatement(t, "life_stmt", func(tb testing.TB, stmt *financev1.Statement) {
			if stmt.GetStatus() != financev1.Statement_COMPLETED {
				tb.Errorf("get statement status = %s, want COMPLETED", stmt.GetStatus())
			}
		})

	// 5. Verify all lines have been committed to MATCHED or SKIPPED
	d.Finance().
		ListStatementLines(t, "life_stmt", func(tb testing.TB, finalLines []*financev1.StatementLine) {
			for i, l := range finalLines {
				if i == 6 {
					if l.GetStatus() != financev1.StatementLine_SKIPPED {
						tb.Errorf("line %d status = %s, want SKIPPED", i, l.GetStatus())
					}
				} else {
					if l.GetStatus() != financev1.StatementLine_MATCHED {
						tb.Errorf("line %d status = %s, want MATCHED", i, l.GetStatus())
					}
					if l.GetMatchedTransactionId() == "" {
						tb.Errorf("line %d expected linked matched_transaction_id, got empty", i)
					}
				}
			}
		})

	// 6. Verify final account balance matches ending balance
	d.Finance().
		AssertAccountBalance(t, "Main Checking", endingBal)

	_ = groceriesBudgetID
}

func TestStatementReconciliation_MatchAction_OverwriteTransaction(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	var txnID string
	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Reconcile Checking",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 100000, // $1,000.00
		}).
		CreateBudget(t, driver.BudgetOptions{
			Name:        "Utilities",
			LimitAmount: 50000,
			Currency:    "USD",
			Interval:    financev1.Budget_MONTHLY,
		}).
		CreateExpense(t, driver.ExpenseOptions{
			Account:         "Reconcile Checking",
			Budget:          "Utilities",
			Currency:        "USD",
			Amount:          1000, // $10.00 recorded in ledger
			Description:     "Electric Power Co",
			TransactionDate: time.Date(2026, 8, 14, 0, 0, 0, 0, time.UTC),
		}).
		AssertTransactions(t, func(txns []*financev1.Transaction) {
			if len(txns) == 0 {
				t.Fatal("expected at least 1 transaction")
			}
			txnID = txns[0].GetId()
		})

	// After $10.00 expense, balance is $990.00 (99000 cents)
	d.Finance().AssertAccountBalance(t, "Reconcile Checking", 99000)

	// Statement shows the charge was actually -$15.00 (-1500 cents)
	rawCSV := `Date,Description,Amount
2026-08-14,Electric Power Co,-15.00`

	var lineID string
	d.Finance().
		ImportStatement(t, driver.ImportStatementOptions{
			Account:         "Reconcile Checking",
			StatementDate:   "2026-08-14",
			StartingBalance: 100000, // $1,000.00
			EndingBalance:   98500,  // $985.00 ($1000 - $15)
			Filename:        "overwrite.csv",
			RawContent:      rawCSV,
			Name:            "overwrite_stmt",
		}).
		ListStatementLines(t, "overwrite_stmt", func(tb testing.TB, lines []*financev1.StatementLine) {
			if len(lines) != 1 {
				tb.Fatalf("expected 1 line, got %d", len(lines))
			}
			lineID = lines[0].GetId()
		})

	// Match the line to the existing transaction with overwrite_transaction = true
	overwrite := true
	d.Finance().
		UpdateStatementLine(t, driver.StatementLineUpdateOptions{
			LineID: lineID,
			Action: &financev1.StatementLine{
				Action: &financev1.StatementLine_Match{
					Match: &financev1.StatementLine_MatchAction{
						TransactionId:        txnID,
						OverwriteTransaction: &overwrite,
					},
				},
				Status: financev1.StatementLine_MATCHED,
			},
			UpdateMask: []string{"action", "status"},
		}).
		CompleteStatement(t, "overwrite_stmt", "", func(tb testing.TB, stmt *financev1.Statement) {
			if stmt.GetStatus() != financev1.Statement_COMPLETED {
				tb.Errorf("statement status = %s, want COMPLETED", stmt.GetStatus())
			}
		})

	// Verify the transaction was updated to $15.00 and marked reconciled
	d.Finance().
		AssertTransactions(t, func(txns []*financev1.Transaction) {
			var found *financev1.Transaction
			for _, tx := range txns {
				if tx.GetId() == txnID {
					found = tx
					break
				}
			}
			if found == nil {
				t.Fatalf("transaction %s not found", txnID)
			}
			if found.GetAmount() != 1500 {
				t.Errorf("transaction amount = %d, want 1500", found.GetAmount())
			}
			if found.GetMetadata()["reconciled"] != "true" {
				t.Errorf("expected transaction reconciled = true, got %v", found.GetMetadata()["reconciled"])
			}
		})

	// Verify account balance was adjusted by the $5.00 delta to $985.00 (98500 cents)
	d.Finance().
		AssertAccountBalance(t, "Reconcile Checking", 98500)
}
