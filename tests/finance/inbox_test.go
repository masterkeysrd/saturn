package finance_test

import (
	"testing"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/tests/driver"
)

// TestInboxItem_ReceiptApprovalJourney tests the end-to-end staging, listing, updating,
// and approval flow for an ingested receipt item into a permanent ledger transaction.
func TestInboxItem_ReceiptApprovalJourney(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	d.Platform().EnsureIntegration(t, driver.IntegrationOptions{
		Kind:     "transaction_ingestion",
		Provider: "email",
	})
	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Checking Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 100000, // $1,000.00
		}).
		CreateBudget(t, driver.BudgetOptions{
			Name:        "Dining Out",
			LimitAmount: 50000, // $500.00 budget
			Currency:    "USD",
		}).
		AssertInboxItemCount(t, financev1.InboxItem_PENDING, 0). // 1. Verify 0 pending items before staging
		StageInboxItem(t, driver.StageInboxItemOptions{
			Key:      "dinner_receipt",
			DocType:  financev1.InboxItem_RECEIPT,
			Amount:   4500, // $45.00
			Currency: "USD",
			Vendor:   "Luigi's Italian",
		}).
		AssertInboxItemCount(t, financev1.InboxItem_PENDING, 1). // 2. Verify 1 pending item after staging
		AssertInboxItem(t, "dinner_receipt", func(item *financev1.InboxItem) {
			if item.GetStatus() != financev1.InboxItem_PENDING {
				t.Errorf("expected PENDING status, got %s", item.GetStatus())
			}
			if item.GetAmount() != 4500 {
				t.Errorf("expected amount 4500, got %d", item.GetAmount())
			}
			if item.GetVendorName() != "Luigi's Italian" {
				t.Errorf("expected vendor Luigi's Italian, got %s", item.GetVendorName())
			}
		}).
		UpdateInboxItem(t, "dinner_receipt", driver.StageInboxItemOptions{
			AccountName: "Checking Account",
			BudgetName:  "Dining Out",
		}).
		ApproveInboxItem(t, "dinner_receipt").                   // 3. Approve staged item
		AssertInboxItemCount(t, financev1.InboxItem_PENDING, 0). // 4. Verify 0 pending items after approval
		AssertAccountBalance(t, "Checking Account", 95500).      // 5. Verify account balance ($1000 - $45 = $955.00)
		AssertTransactionCount(t, 1).                            // 6. Verify 1 expense transaction generated
		AssertInboxItem(t, "dinner_receipt", func(item *financev1.InboxItem) {
			if item.GetStatus() != financev1.InboxItem_RESOLVED {
				t.Errorf("expected RESOLVED status, got %s", item.GetStatus())
			}
			if item.GetTransactionId() == "" {
				t.Fatalf("expected transaction ID set on inbox item")
			}
			d.Finance().AssertTransaction(t, item.GetTransactionId(), func(tx *financev1.Transaction) {
				if tx.GetAmount() != 4500 {
					t.Errorf("expected transaction amount 4500, got %d", tx.GetAmount())
				}
				if tx.GetType() != financev1.Transaction_EXPENSE {
					t.Errorf("expected transaction type EXPENSE, got %s", tx.GetType())
				}
				if tx.GetDescription() != "Luigi's Italian" {
					t.Errorf("expected description Luigi's Italian, got %s", tx.GetDescription())
				}
			})
		})
}

// TestInboxItem_DiscardJourney tests staging an inbox item and discarding it,
// verifying that no transactions are created and account balances remain unchanged.
func TestInboxItem_DiscardJourney(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	d.Platform().EnsureIntegration(t, driver.IntegrationOptions{
		Kind:     "transaction_ingestion",
		Provider: "email",
	})
	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Checking Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 50000, // $500.00
		}).
		StageInboxItem(t, driver.StageInboxItemOptions{
			Key:     "spam_invoice",
			DocType: financev1.InboxItem_INVOICE,
			Amount:  99900, // $999.00
			Vendor:  "Unknown Phishing Co",
		}).
		AssertInboxItemCount(t, financev1.InboxItem_PENDING, 1).
		DiscardInboxItem(t, "spam_invoice").
		AssertInboxItemCount(t, financev1.InboxItem_PENDING, 0).
		AssertAccountBalance(t, "Checking Account", 50000). // Account balance unchanged
		AssertTransactionCount(t, 0)                        // No transactions created
}

// TestInboxItem_CardLastFourCurrencyPriority tests account matching fallback by last 4 digits,
// verifying that when multiple accounts share the same last 4 digits ("9999"), the matching logic
// prioritizes the account whose currency matches the ingested receipt currency.
func TestInboxItem_CardLastFourCurrencyPriority(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Multi-Currency Space")

	d.Platform().EnsureIntegration(t, driver.IntegrationOptions{
		Kind:     "transaction_ingestion",
		Provider: "email",
	})
	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "USD Checking",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 100000,
			LastFour:       "9999",
		}).
		CreateAccount(t, driver.AccountOptions{
			Name:           "EUR Checking",
			Type:           financev1.Account_BANK,
			Currency:       "EUR",
			InitialBalance: 100000,
			LastFour:       "9999",
		}).
		// Case A: Stage EUR receipt with LastFour "9999" -> must resolve EUR Checking account!
		StageInboxItem(t, driver.StageInboxItemOptions{
			Key:          "eur_receipt",
			DocType:      financev1.InboxItem_RECEIPT,
			Amount:       2500, // €25.00
			Currency:     "EUR",
			Vendor:       "Café Paris",
			CardLastFour: "9999",
		}).
		AssertInboxItem(t, "eur_receipt", func(item *financev1.InboxItem) {
			d.Finance().AssertAccount(t, "EUR Checking", func(acc *financev1.Account) {
				if item.GetAccountId() != acc.GetId() {
					t.Errorf("expected EUR receipt to match EUR Checking account (%s), got %s", acc.GetId(), item.GetAccountId())
				}
			})
		}).
		// Case B: Stage USD receipt with LastFour "9999" -> must resolve USD Checking account!
		StageInboxItem(t, driver.StageInboxItemOptions{
			Key:          "usd_receipt",
			DocType:      financev1.InboxItem_RECEIPT,
			Amount:       5000, // $50.00
			Currency:     "USD",
			Vendor:       "NY Diner",
			CardLastFour: "9999",
		}).
		AssertInboxItem(t, "usd_receipt", func(item *financev1.InboxItem) {
			d.Finance().AssertAccount(t, "USD Checking", func(acc *financev1.Account) {
				if item.GetAccountId() != acc.GetId() {
					t.Errorf("expected USD receipt to match USD Checking account (%s), got %s", acc.GetId(), item.GetAccountId())
				}
			})
		})
}

// TestInboxItem_SystemVerificationJourney tests end-to-end handling of system verification signals,
// verifying that approving a SYSTEM_VERIFICATION item marks it RESOLVED without mutating account balances
// or generating ledger transactions.
func TestInboxItem_SystemVerificationJourney(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Verification Space")

	d.Platform().EnsureIntegration(t, driver.IntegrationOptions{
		Kind:     "transaction_ingestion",
		Provider: "email",
	})
	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Checking Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 100000,
		}).
		StageInboxItem(t, driver.StageInboxItemOptions{
			Key:      "verify_email",
			DocType:  financev1.InboxItem_SYSTEM_VERIFICATION,
			Vendor:   "Auth Provider",
			Amount:   0,
			Currency: "USD",
		}).
		AssertInboxItem(t, "verify_email", func(item *financev1.InboxItem) {
			if item.GetStatus() != financev1.InboxItem_PENDING {
				t.Errorf("expected PENDING status, got %s", item.GetStatus())
			}
			if item.GetDocType() != financev1.InboxItem_SYSTEM_VERIFICATION {
				t.Errorf("expected SYSTEM_VERIFICATION docType, got %s", item.GetDocType())
			}
		}).
		ApproveInboxItem(t, "verify_email").
		AssertInboxItem(t, "verify_email", func(item *financev1.InboxItem) {
			if item.GetStatus() != financev1.InboxItem_RESOLVED {
				t.Errorf("expected RESOLVED status after approval, got %s", item.GetStatus())
			}
		}).
		AssertAccountBalance(t, "Checking Account", 100000). // Account balance unchanged
		AssertTransactionCount(t, 0)                         // 0 side-effect transactions created
}

// TestInboxItem_InvoiceJourney tests the complete sequential life cycle of invoices:
// 1. Unlinked invoice staging & approval (creates a new scheduled payment bill).
// 2. Linked invoice to unpaid bill (updates estimated bill figures).
// 3. Linked invoice to an already paid bill (attaches audit link to completed transaction).
// 4. Discard invoice (deletes item cleanly from queue).
func TestInboxItem_InvoiceJourney(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Invoice Journey Space")

	d.Platform().EnsureIntegration(t, driver.IntegrationOptions{
		Kind:     "transaction_ingestion",
		Provider: "email",
	})
	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Main Checking",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 100000, // $1,000.00
		}).
		CreateBudget(t, driver.BudgetOptions{
			Name:        "Utilities",
			LimitAmount: 50000, // $500.00
			Currency:    "USD",
		})

	t.Run("Unlinked invoice creates new scheduled payment", func(t *testing.T) {
		d.Finance().
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "electric_invoice",
				DocType:     financev1.InboxItem_INVOICE,
				Amount:      12500, // $125.00
				Vendor:      "Electric Co",
				AccountName: "Main Checking",
				BudgetName:  "Utilities",
			}).
			AssertInboxItemCount(t, financev1.InboxItem_PENDING, 1). // 1 pending item before approval
			ApproveInboxItem(t, "electric_invoice").
			AssertInboxItemCount(t, financev1.InboxItem_PENDING, 0). // 0 pending items after approval
			AssertInboxItem(t, "electric_invoice", func(item *financev1.InboxItem) {
				if item.GetStatus() != financev1.InboxItem_RESOLVED {
					t.Errorf("expected RESOLVED status, got %s", item.GetStatus())
				}
			}).
			AssertPendingScheduledTransactionsCount(t, 1). // 1 unpaid bill created
			AssertPendingScheduledTransaction(t, func(sp *financev1.ScheduledTransaction) {
				if sp.GetAmount() != 12500 {
					t.Errorf("expected new scheduled transaction amount 12500, got %d", sp.GetAmount())
				}
				if sp.GetStatus() != financev1.ScheduledTransaction_PENDING {
					t.Errorf("expected PENDING status for new bill, got %s", sp.GetStatus())
				}
			}).
			AssertTransactionCount(t, 0) // 0 transactions (unpaid bill)
	})

	t.Run("Linked invoice to unpaid scheduled payment updates bill figures", func(t *testing.T) {
		d.Finance().
			CreateRecurringTransaction(t, "Internet Bill", "Utilities", 8000, "USD"). // $80.00 estimated bill
			AssertPendingScheduledTransactionsCount(t, 2).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "internet_invoice",
				DocType:     financev1.InboxItem_INVOICE,
				Amount:      8500, // $85.00 actual invoice
				Vendor:      "ISP Provider",
				AccountName: "Main Checking",
				BudgetName:  "Utilities",
			}).
			UpdateInboxItem(t, "internet_invoice", driver.StageInboxItemOptions{
				ScheduledTransactionAmount: 8000,
			}).
			AssertInboxItemCount(t, financev1.InboxItem_PENDING, 1).
			ApproveInboxItem(t, "internet_invoice").
			AssertInboxItemCount(t, financev1.InboxItem_PENDING, 0).
			AssertScheduledTransactionByAmount(t, 8500, func(sp *financev1.ScheduledTransaction) {
				if sp.GetStatus() != financev1.ScheduledTransaction_PENDING {
					t.Errorf("expected PENDING status for updated bill, got %s", sp.GetStatus())
				}
			}).
			AssertPendingScheduledTransactionsCount(t, 2). // Bill count unchanged (updated existing)
			AssertTransactionCount(t, 0)
	})

	t.Run("Linked invoice to already paid scheduled payment attaches audit link to paid transaction", func(t *testing.T) {
		d.Finance().
			CreateRecurringTransaction(t, "Water Bill", "Utilities", 5000, "USD").
			ConfirmScheduledTransaction(t, driver.ConfirmScheduledTransactionOptions{
				ScheduledTransactionAmount: 5000,
				Account:                    "Main Checking",
			}). // Confirms payment into completed transaction ($50.00 deducted)
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "water_invoice",
				DocType:     financev1.InboxItem_INVOICE,
				Amount:      5000, // $50.00
				Vendor:      "City Water",
				AccountName: "Main Checking",
				BudgetName:  "Utilities",
			}).
			UpdateInboxItem(t, "water_invoice", driver.StageInboxItemOptions{
				LinkToLastTransaction: true,
			}).
			AssertInboxItemCount(t, financev1.InboxItem_PENDING, 1).
			ApproveInboxItem(t, "water_invoice").
			AssertInboxItemCount(t, financev1.InboxItem_PENDING, 0).
			AssertTransactionCount(t, 1).                   // Exactly 1 paid transaction exists (no double creation)
			AssertPendingScheduledTransactionsCount(t, 2).  // Remaining pending bills intact
			AssertAccountBalance(t, "Main Checking", 95000) // $1000 - $50 = $950 balance intact (no double deduction)
	})

	t.Run("Discard invoice deletes item from queue", func(t *testing.T) {
		d.Finance().
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "spam_invoice",
				DocType:     financev1.InboxItem_INVOICE,
				Amount:      99900,
				Vendor:      "Phishing Vendor",
				AccountName: "Main Checking",
			}).
			AssertInboxItemCount(t, financev1.InboxItem_PENDING, 1).
			DiscardInboxItem(t, "spam_invoice").
			AssertInboxItemCount(t, financev1.InboxItem_PENDING, 0)
	})
}

// TestInboxItem_ReceiptMatrix tests the complete 17-case matrix for RECEIPT inbox items defined in cases.md.
func TestInboxItem_ReceiptMatrix(t *testing.T) {
	setupReceiptTest := func(t *testing.T, spaceName string) (*driver.Driver, *driver.FinanceDriver) {
		t.Helper()
		d := driver.New(t, testEnv)
		d.Auth().CreateApprovedUser(t).Login(t)
		d.Space().Ensure(t, spaceName)
		d.Platform().EnsureIntegration(t, driver.IntegrationOptions{
			Kind:     "transaction_ingestion",
			Provider: "email",
		})
		fin := d.Finance().
			InitSettings(t, "USD").
			CreateAccount(t, driver.AccountOptions{
				Name:           "Main Checking",
				Type:           financev1.Account_BANK,
				Currency:       "USD",
				InitialBalance: 100000, // $1,000.00
			}).
			CreateBudget(t, driver.BudgetOptions{
				Name:        "General Expenses",
				LimitAmount: 50000,
				Currency:    "USD",
			})
		return d, fin
	}

	// --- Category 1: Standalone Purchases & Transaction Linking ---

	t.Run("1_UnlinkedReceipt_CreatesNewTransactionAndDeductsBalance", func(t *testing.T) {
		_, fin := setupReceiptTest(t, "Receipt Space 1")

		fin.StageInboxItem(t, driver.StageInboxItemOptions{
			Key:         "receipt_1",
			DocType:     financev1.InboxItem_RECEIPT,
			Amount:      4500, // $45.00
			Currency:    "USD",
			Vendor:      "Luigi's Italian",
			AccountName: "Main Checking",
			BudgetName:  "General Expenses",
		}).
			AssertInboxItemCount(t, financev1.InboxItem_PENDING, 1).
			ApproveInboxItem(t, "receipt_1").
			AssertInboxItemCount(t, financev1.InboxItem_PENDING, 0).
			AssertAccountBalance(t, "Main Checking", 95500). // 100000 - 4500 = 95500
			AssertTransactionCount(t, 1).
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 4500 {
					t.Errorf("Transaction amount = %d, want 4500", txn.GetAmount())
				}
				if txn.GetDescription() != "Luigi's Italian" {
					t.Errorf("Transaction description = %q, want Luigi's Italian", txn.GetDescription())
				}
				if txn.GetType() != financev1.Transaction_EXPENSE {
					t.Errorf("Transaction type = %s, want EXPENSE", txn.GetType())
				}
			})
	})

	t.Run("2_LinkedReceiptToTransaction_ExactAmount_AttachesAuditLink", func(t *testing.T) {
		_, fin := setupReceiptTest(t, "Receipt Space 2")

		fin.CreateExpense(t, driver.ExpenseOptions{
			Account:     "Main Checking",
			Budget:      "General Expenses",
			Amount:      4000,
			Currency:    "USD",
			Description: "Coffee Shop",
		}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:                   "receipt_2",
				DocType:               financev1.InboxItem_RECEIPT,
				Amount:                4000,
				Currency:              "USD",
				Vendor:                "Coffee Shop",
				AccountName:           "Main Checking",
				LinkToLastTransaction: true,
			}).
			UpdateInboxItem(t, "receipt_2", driver.StageInboxItemOptions{
				LinkToLastTransaction: true,
			}).
			ApproveInboxItem(t, "receipt_2").
			AssertTransactionCount(t, 1).                    // 0 duplicate transactions
			AssertAccountBalance(t, "Main Checking", 96000). // Balance unchanged (already posted)
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 4000 {
					t.Errorf("Transaction amount = %d, want 4000", txn.GetAmount())
				}
				if txn.GetDescription() != "Coffee Shop" {
					t.Errorf("Transaction description = %q, want Coffee Shop", txn.GetDescription())
				}
			})
	})

	t.Run("3_LinkedReceiptToTransaction_WithAmountOverwrite", func(t *testing.T) {
		_, fin := setupReceiptTest(t, "Receipt Space 3")

		fin.CreateExpense(t, driver.ExpenseOptions{
			Account:     "Main Checking",
			Budget:      "General Expenses",
			Amount:      4000, // $40.00
			Currency:    "USD",
			Description: "Restaurant",
		}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "receipt_3",
				DocType:     financev1.InboxItem_RECEIPT,
				Amount:      4500, // $45.00 (with tip)
				Currency:    "USD",
				Vendor:      "Restaurant",
				AccountName: "Main Checking",
			}).
			UpdateInboxItem(t, "receipt_3", driver.StageInboxItemOptions{
				LinkToLastTransaction:      true,
				OverwriteLinkedTransaction: true,
			}).
			ApproveInboxItem(t, "receipt_3").
			AssertTransactionCount(t, 1).                    // 1 transaction updated
			AssertAccountBalance(t, "Main Checking", 95500). // 100000 - 4500 = 95500
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 4500 {
					t.Errorf("Transaction amount = %d, want 4500", txn.GetAmount())
				}
				if txn.GetDescription() != "Restaurant" {
					t.Errorf("Transaction description = %q, want Restaurant", txn.GetDescription())
				}
			})
	})

	t.Run("4_LinkedReceiptToTransfer_Rejection", func(t *testing.T) {
		_, fin := setupReceiptTest(t, "Receipt Space 4")

		fin.CreateAccount(t, driver.AccountOptions{
			Name:           "Savings Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 50000,
		}).
			CreateTransfer(t, driver.TransferOptions{
				FromAccount:  "Main Checking",
				ToAccount:    "Savings Account",
				SourceAmount: 10000,
			}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "receipt_4",
				DocType:     financev1.InboxItem_RECEIPT,
				Amount:      10000,
				Currency:    "USD",
				AccountName: "Main Checking",
				BudgetName:  "General Expenses",
			}).
			UpdateInboxItem(t, "receipt_4", driver.StageInboxItemOptions{
				LinkToLastTransaction: true,
			}).
			ApproveInboxItem(t, "receipt_4", "cannot link receipt to transfer transaction")
	})

	// --- Category 2: Scheduled Payment Linking ---

	t.Run("5_LinkedReceiptToUnpaidScheduledPayment_ExactAmount", func(t *testing.T) {
		_, fin := setupReceiptTest(t, "Receipt Space 5")

		fin.CreateRecurringTransaction(t, "Internet Bill", "General Expenses", 8000, "USD").
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "receipt_5",
				DocType:     financev1.InboxItem_RECEIPT,
				Amount:      8000,
				Currency:    "USD",
				Vendor:      "ISP Co",
				AccountName: "Main Checking",
			}).
			UpdateInboxItem(t, "receipt_5", driver.StageInboxItemOptions{
				ScheduledTransactionName: "Internet Bill",
			}).
			ApproveInboxItem(t, "receipt_5").
			AssertTransactionCount(t, 1).
			AssertPendingScheduledTransactionsCount(t, 0).
			AssertAccountBalance(t, "Main Checking", 92000).
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 8000 {
					t.Errorf("Transaction amount = %d, want 8000", txn.GetAmount())
				}
				if txn.GetDescription() != "ISP Co" {
					t.Errorf("Transaction description = %q, want ISP Co", txn.GetDescription())
				}
				if txn.GetType() != financev1.Transaction_EXPENSE {
					t.Errorf("Transaction type = %s, want EXPENSE", txn.GetType())
				}
				if txn.GetMetadata()["scheduled_payment_id"] == "" {
					t.Error("Expected scheduled_payment_id link in transaction metadata, got empty")
				}
			})
	})

	t.Run("6_LinkedReceiptToUnpaidScheduledPayment_WithAmountOverwrite", func(t *testing.T) {
		_, fin := setupReceiptTest(t, "Receipt Space 6")

		fin.CreateRecurringTransaction(t, "Power Bill", "General Expenses", 8000, "USD").
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "receipt_6",
				DocType:     financev1.InboxItem_RECEIPT,
				Amount:      8500, // $85.00 actual
				Currency:    "USD",
				Vendor:      "Power Co",
				AccountName: "Main Checking",
			}).
			UpdateInboxItem(t, "receipt_6", driver.StageInboxItemOptions{
				ScheduledTransactionName: "Power Bill",
			}).
			ApproveInboxItem(t, "receipt_6").
			AssertTransactionCount(t, 1).
			AssertPendingScheduledTransactionsCount(t, 0).
			AssertAccountBalance(t, "Main Checking", 91500). // 100000 - 8500 = 91500
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 8500 {
					t.Errorf("Transaction amount = %d, want 8500", txn.GetAmount())
				}
				if txn.GetDescription() != "Power Co" {
					t.Errorf("Transaction description = %q, want Power Co", txn.GetDescription())
				}
				if txn.GetMetadata()["scheduled_payment_id"] == "" {
					t.Error("Expected scheduled_payment_id link in transaction metadata, got empty")
				}
			})
	})

	t.Run("7_LinkedReceiptToPaidScheduledPayment_Idempotent", func(t *testing.T) {
		_, fin := setupReceiptTest(t, "Receipt Space 7")

		fin.CreateRecurringTransaction(t, "Gym", "General Expenses", 5000, "USD").
			ConfirmScheduledTransaction(t, driver.ConfirmScheduledTransactionOptions{
				ScheduledTransactionName: "Gym",
				Account:                  "Main Checking",
			}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "receipt_7",
				DocType:     financev1.InboxItem_RECEIPT,
				Amount:      5000,
				Currency:    "USD",
				AccountName: "Main Checking",
			}).
			UpdateInboxItem(t, "receipt_7", driver.StageInboxItemOptions{
				ScheduledTransactionName: "Gym",
				LinkToLastTransaction:    true,
			}).
			ApproveInboxItem(t, "receipt_7").
			AssertTransactionCount(t, 1).                    // 0 duplicate transactions
			AssertAccountBalance(t, "Main Checking", 95000). // 0 double balance deduction
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 5000 {
					t.Errorf("Transaction amount = %d, want 5000", txn.GetAmount())
				}
				if txn.GetMetadata()["scheduled_payment_id"] == "" {
					t.Error("Expected scheduled_payment_id link in transaction metadata, got empty")
				}
			})
	})

	t.Run("8_RetroactiveScheduledPaymentLink_OnExistingTransaction", func(t *testing.T) {
		_, fin := setupReceiptTest(t, "Receipt Space 8")

		fin.CreateRecurringTransaction(t, "Phone Bill", "General Expenses", 8000, "USD").
			CreateExpense(t, driver.ExpenseOptions{
				Account:     "Main Checking",
				Budget:      "General Expenses",
				Amount:      8000,
				Currency:    "USD",
				Description: "Phone Co",
			}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "receipt_8",
				DocType:     financev1.InboxItem_RECEIPT,
				Amount:      8000,
				Currency:    "USD",
				AccountName: "Main Checking",
			}).
			UpdateInboxItem(t, "receipt_8", driver.StageInboxItemOptions{
				ScheduledTransactionName: "Phone Bill",
				LinkToLastTransaction:    true,
			}).
			ApproveInboxItem(t, "receipt_8").
			AssertTransactionCount(t, 1).
			AssertPendingScheduledTransactionsCount(t, 0).
			AssertAccountBalance(t, "Main Checking", 92000).
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 8000 {
					t.Errorf("Transaction amount = %d, want 8000", txn.GetAmount())
				}
				if txn.GetDescription() != "Phone Co" {
					t.Errorf("Transaction description = %q, want Phone Co", txn.GetDescription())
				}
				if txn.GetMetadata()["scheduled_payment_id"] == "" {
					t.Error("Expected scheduled_payment_id link in transaction metadata, got empty")
				}
			})
	})

	t.Run("9_RelinkToDifferentScheduledPayment_Rejection", func(t *testing.T) {
		_, fin := setupReceiptTest(t, "Receipt Space 9")

		fin.CreateRecurringTransaction(t, "Bill A", "General Expenses", 3000, "USD").
			CreateRecurringTransaction(t, "Bill B", "General Expenses", 4000, "USD").
			ConfirmScheduledTransaction(t, driver.ConfirmScheduledTransactionOptions{
				ScheduledTransactionName: "Bill A",
				Account:                  "Main Checking",
			}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "receipt_9",
				DocType:     financev1.InboxItem_RECEIPT,
				Amount:      3000,
				Currency:    "USD",
				AccountName: "Main Checking",
			}).
			UpdateInboxItem(t, "receipt_9", driver.StageInboxItemOptions{
				ScheduledTransactionName: "Bill B", // Try to link Bill A's transaction to Bill B
				LinkToLastTransaction:    true,
			}).
			ApproveInboxItem(t, "receipt_9", "cannot relink transaction to a different scheduled transaction")
	})

	// --- Category 3: Borrowing / Loan Linking ---

	t.Run("10_UnlinkedReceiptToBorrowing_InitialDisbursement", func(t *testing.T) {
		_, fin := setupReceiptTest(t, "Receipt Space 10")

		fin.CreateBorrowing(t, driver.BorrowingOptions{
			Name:         "Personal Loan",
			Counterparty: "Bank Co",
			Direction:    financev1.Borrowing_BORROWED,
			Currency:     "USD",
			TotalAmount:  100000, // $1,000.00
		}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "receipt_10",
				DocType:     financev1.InboxItem_RECEIPT,
				Amount:      100000,
				Currency:    "USD",
				AccountName: "Main Checking",
				BudgetName:  "General Expenses",
			}).
			UpdateInboxItem(t, "receipt_10", driver.StageInboxItemOptions{
				BorrowingID:       "Personal Loan",
				BorrowingLinkType: financev1.BorrowingLinkType_BORROWING_LINK_TYPE_INITIAL_RECEIPT,
			}).
			ApproveInboxItem(t, "receipt_10").
			AssertTransactionCount(t, 1).
			AssertBorrowingBalance(t, "Personal Loan", 100000).
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 100000 {
					t.Errorf("Transaction amount = %d, want 100000", txn.GetAmount())
				}
				if txn.GetType() != financev1.Transaction_EXPENSE {
					t.Errorf("Transaction type = %s, want EXPENSE", txn.GetType())
				}
				if txn.GetMetadata()["borrowing_id"] == "" {
					t.Error("Expected borrowing_id link in transaction metadata, got empty")
				}
			})
	})

	t.Run("11_UnlinkedReceiptToBorrowing_Repayment", func(t *testing.T) {
		_, fin := setupReceiptTest(t, "Receipt Space 11")

		fin.CreateBorrowing(t, driver.BorrowingOptions{
			Name:         "Car Loan",
			Counterparty: "Auto Bank",
			Direction:    financev1.Borrowing_BORROWED,
			Currency:     "USD",
			TotalAmount:  50000, // $500.00 initial
		}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "receipt_11",
				DocType:     financev1.InboxItem_RECEIPT,
				Amount:      10000, // $100.00 repayment
				Currency:    "USD",
				AccountName: "Main Checking",
				BudgetName:  "General Expenses",
			}).
			UpdateInboxItem(t, "receipt_11", driver.StageInboxItemOptions{
				BorrowingID:       "Car Loan",
				BorrowingLinkType: financev1.BorrowingLinkType_BORROWING_LINK_TYPE_REPAYMENT,
			}).
			ApproveInboxItem(t, "receipt_11").
			AssertTransactionCount(t, 1).
			AssertBorrowingBalance(t, "Car Loan", 40000). // 50000 - 10000 = 40000 remaining
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 10000 {
					t.Errorf("Transaction amount = %d, want 10000", txn.GetAmount())
				}
				if txn.GetMetadata()["borrowing_id"] == "" {
					t.Error("Expected borrowing_id link in transaction metadata, got empty")
				}
			})
	})

	t.Run("12_UnlinkedReceiptToBorrowing_AdditionalAdvance", func(t *testing.T) {
		_, fin := setupReceiptTest(t, "Receipt Space 12")

		fin.CreateBorrowing(t, driver.BorrowingOptions{
			Name:         "Line of Credit",
			Counterparty: "Credit Union",
			Direction:    financev1.Borrowing_BORROWED,
			Currency:     "USD",
			TotalAmount:  30000,
		}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "receipt_12",
				DocType:     financev1.InboxItem_RECEIPT,
				Amount:      20000, // $200.00 drawdown
				Currency:    "USD",
				AccountName: "Main Checking",
				BudgetName:  "General Expenses",
			}).
			UpdateInboxItem(t, "receipt_12", driver.StageInboxItemOptions{
				BorrowingID:       "Line of Credit",
				BorrowingLinkType: financev1.BorrowingLinkType_BORROWING_LINK_TYPE_ADDITIONAL_LOAN,
			}).
			ApproveInboxItem(t, "receipt_12").
			AssertTransactionCount(t, 1).
			AssertBorrowingBalance(t, "Line of Credit", 50000). // 30000 + 20000 = 50000
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 20000 {
					t.Errorf("Transaction amount = %d, want 20000", txn.GetAmount())
				}
				if txn.GetMetadata()["borrowing_id"] == "" {
					t.Error("Expected borrowing_id link in transaction metadata, got empty")
				}
			})
	})

	t.Run("13_LinkedReceiptToExistingBorrowingTransaction_Idempotent", func(t *testing.T) {
		_, fin := setupReceiptTest(t, "Receipt Space 13")

		fin.CreateBorrowing(t, driver.BorrowingOptions{
			Name:         "Student Loan",
			Counterparty: "Gov Financial",
			Direction:    financev1.Borrowing_BORROWED,
			Currency:     "USD",
			TotalAmount:  50000,
		}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "repayment_receipt",
				DocType:     financev1.InboxItem_RECEIPT,
				Amount:      10000,
				Currency:    "USD",
				AccountName: "Main Checking",
				BudgetName:  "General Expenses",
			}).
			UpdateInboxItem(t, "repayment_receipt", driver.StageInboxItemOptions{
				BorrowingID:       "Student Loan",
				BorrowingLinkType: financev1.BorrowingLinkType_BORROWING_LINK_TYPE_REPAYMENT,
			}).
			ApproveInboxItem(t, "repayment_receipt").
			AssertBorrowingBalance(t, "Student Loan", 40000).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "receipt_13",
				DocType:     financev1.InboxItem_RECEIPT,
				Amount:      10000,
				Currency:    "USD",
				AccountName: "Main Checking",
				BudgetName:  "General Expenses",
			}).
			UpdateInboxItem(t, "receipt_13", driver.StageInboxItemOptions{
				BorrowingID:           "Student Loan",
				BorrowingLinkType:     financev1.BorrowingLinkType_BORROWING_LINK_TYPE_REPAYMENT,
				LinkToLastTransaction: true,
			}).
			ApproveInboxItem(t, "receipt_13").
			AssertTransactionCount(t, 1).                     // 0 duplicate transactions
			AssertBorrowingBalance(t, "Student Loan", 40000). // 0 double loan balance reduction
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 10000 {
					t.Errorf("Transaction amount = %d, want 10000", txn.GetAmount())
				}
				if txn.GetMetadata()["borrowing_id"] == "" {
					t.Error("Expected borrowing_id link in transaction metadata, got empty")
				}
			})
	})

	t.Run("14_LinkedReceiptToExistingBorrowingTransaction_WithAmountOverwrite", func(t *testing.T) {
		_, fin := setupReceiptTest(t, "Receipt Space 14")

		fin.CreateBorrowing(t, driver.BorrowingOptions{
			Name:         "Mortgage Loan",
			Counterparty: "Home Bank",
			Direction:    financev1.Borrowing_BORROWED,
			Currency:     "USD",
			TotalAmount:  100000,
		}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "initial_pay",
				DocType:     financev1.InboxItem_RECEIPT,
				Amount:      10000, // $100.00
				Currency:    "USD",
				AccountName: "Main Checking",
				BudgetName:  "General Expenses",
			}).
			UpdateInboxItem(t, "initial_pay", driver.StageInboxItemOptions{
				BorrowingID:       "Mortgage Loan",
				BorrowingLinkType: financev1.BorrowingLinkType_BORROWING_LINK_TYPE_REPAYMENT,
			}).
			ApproveInboxItem(t, "initial_pay").
			AssertBorrowingBalance(t, "Mortgage Loan", 90000).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "receipt_14",
				DocType:     financev1.InboxItem_RECEIPT,
				Amount:      11000, // $110.00 updated actual
				Currency:    "USD",
				AccountName: "Main Checking",
				BudgetName:  "General Expenses",
			}).
			UpdateInboxItem(t, "receipt_14", driver.StageInboxItemOptions{
				BorrowingID:                "Mortgage Loan",
				BorrowingLinkType:          financev1.BorrowingLinkType_BORROWING_LINK_TYPE_REPAYMENT,
				LinkToLastTransaction:      true,
				OverwriteLinkedTransaction: true,
			}).
			ApproveInboxItem(t, "receipt_14").
			AssertTransactionCount(t, 1).
			AssertAccountBalance(t, "Main Checking", 89000). // 100000 - 11000 = 89000
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 11000 {
					t.Errorf("Transaction amount = %d, want 11000", txn.GetAmount())
				}
				if txn.GetMetadata()["borrowing_id"] == "" {
					t.Error("Expected borrowing_id link in transaction metadata, got empty")
				}
			})
	})

	t.Run("15_RetroactiveBorrowingLink_OnExistingTransaction", func(t *testing.T) {
		_, fin := setupReceiptTest(t, "Receipt Space 15")

		fin.CreateBorrowing(t, driver.BorrowingOptions{
			Name:         "Friend Loan",
			Counterparty: "Alice",
			Direction:    financev1.Borrowing_BORROWED,
			Currency:     "USD",
			TotalAmount:  50000,
		}).
			CreateExpense(t, driver.ExpenseOptions{
				Account:     "Main Checking",
				Budget:      "General Expenses",
				Amount:      10000,
				Currency:    "USD",
				Description: "Repay Alice",
			}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "receipt_15",
				DocType:     financev1.InboxItem_RECEIPT,
				Amount:      10000,
				Currency:    "USD",
				AccountName: "Main Checking",
				BudgetName:  "General Expenses",
			}).
			UpdateInboxItem(t, "receipt_15", driver.StageInboxItemOptions{
				BorrowingID:           "Friend Loan",
				BorrowingLinkType:     financev1.BorrowingLinkType_BORROWING_LINK_TYPE_REPAYMENT,
				LinkToLastTransaction: true,
			}).
			ApproveInboxItem(t, "receipt_15").
			AssertTransactionCount(t, 1).
			AssertBorrowingBalance(t, "Friend Loan", 40000).
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 10000 {
					t.Errorf("Transaction amount = %d, want 10000", txn.GetAmount())
				}
				if txn.GetDescription() != "Repay Alice" {
					t.Errorf("Transaction description = %q, want Repay Alice", txn.GetDescription())
				}
				if txn.GetMetadata()["borrowing_id"] == "" {
					t.Error("Expected borrowing_id link in transaction metadata, got empty")
				}
			})
	})

	t.Run("16_RelinkToDifferentBorrowing_Rejection", func(t *testing.T) {
		_, fin := setupReceiptTest(t, "Receipt Space 16")

		fin.CreateBorrowing(t, driver.BorrowingOptions{
			Name:         "Loan Alpha",
			Counterparty: "Alpha Bank",
			Direction:    financev1.Borrowing_BORROWED,
			Currency:     "USD",
			TotalAmount:  50000,
		}).
			CreateBorrowing(t, driver.BorrowingOptions{
				Name:         "Loan Beta",
				Counterparty: "Beta Bank",
				Direction:    financev1.Borrowing_BORROWED,
				Currency:     "USD",
				TotalAmount:  50000,
			}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "alpha_pay",
				DocType:     financev1.InboxItem_RECEIPT,
				Amount:      10000,
				Currency:    "USD",
				AccountName: "Main Checking",
				BudgetName:  "General Expenses",
			}).
			UpdateInboxItem(t, "alpha_pay", driver.StageInboxItemOptions{
				BorrowingID:       "Loan Alpha",
				BorrowingLinkType: financev1.BorrowingLinkType_BORROWING_LINK_TYPE_REPAYMENT,
			}).
			ApproveInboxItem(t, "alpha_pay").
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "receipt_16",
				DocType:     financev1.InboxItem_RECEIPT,
				Amount:      10000,
				Currency:    "USD",
				AccountName: "Main Checking",
				BudgetName:  "General Expenses",
			}).
			UpdateInboxItem(t, "receipt_16", driver.StageInboxItemOptions{
				BorrowingID:           "Loan Beta", // Try to relink Alpha's transaction to Beta
				BorrowingLinkType:     financev1.BorrowingLinkType_BORROWING_LINK_TYPE_REPAYMENT,
				LinkToLastTransaction: true,
			}).
			ApproveInboxItem(t, "receipt_16", "cannot relink transaction to a different borrowing agreement")
	})

	// --- Category 4: Discard Operation ---

	t.Run("17_DiscardReceipt", func(t *testing.T) {
		_, fin := setupReceiptTest(t, "Receipt Space 17")

		fin.StageInboxItem(t, driver.StageInboxItemOptions{
			Key:         "receipt_17",
			DocType:     financev1.InboxItem_RECEIPT,
			Amount:      9900,
			Currency:    "USD",
			Vendor:      "Junk Merchant",
			AccountName: "Main Checking",
		}).
			AssertInboxItemCount(t, financev1.InboxItem_PENDING, 1).
			DiscardInboxItem(t, "receipt_17").
			AssertInboxItemCount(t, financev1.InboxItem_PENDING, 0).
			AssertTransactionCount(t, 0).
			AssertAccountBalance(t, "Main Checking", 100000)
	})
}

func setupBankTest(t *testing.T, spaceName string) (*driver.Driver, *driver.FinanceDriver) {
	t.Helper()
	d := driver.New(t, testEnv)
	d.Auth().CreateApprovedUser(t).Login(t)
	d.Space().Ensure(t, spaceName)
	d.Platform().EnsureIntegration(t, driver.IntegrationOptions{
		Kind:     "transaction_ingestion",
		Provider: "bank_feed",
	})
	fin := d.Finance()
	fin.InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Main Checking",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 100000, // $1,000.00
		}).
		CreateBudget(t, driver.BudgetOptions{
			Name:        "General Expenses",
			LimitAmount: 50000,
			Currency:    "USD",
		})
	return d, fin
}

// TestInboxItem_BankNotificationMatrix tests all bank notification approval and transfer scenarios.
func TestInboxItem_BankNotificationMatrix(t *testing.T) {
	t.Run("1_Transfer_SourceLeg", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 1")

		fin.CreateAccount(t, driver.AccountOptions{
			Name:           "Savings Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 50000, // $500.00
		}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "bank_1",
				DocType:     financev1.InboxItem_BANK_NOTIFICATION,
				Amount:      20000, // $200.00 transfer
				Currency:    "USD",
				AccountName: "Main Checking",
			}).
			UpdateInboxItem(t, "bank_1", driver.StageInboxItemOptions{
				TransactionType:        "TRANSFER",
				DestinationAccountName: "Savings Account",
				TransferLeg:            "SOURCE",
			}).
			ApproveInboxItem(t, "bank_1").
			AssertAccountBalance(t, "Main Checking", 80000).   // 100000 - 20000 = 80000
			AssertAccountBalance(t, "Savings Account", 70000). // 50000 + 20000 = 70000
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 20000 {
					t.Errorf("Transaction amount = %d, want 20000", txn.GetAmount())
				}
				if txn.GetType() != financev1.Transaction_TRANSFER_OUT {
					t.Errorf("Transaction type = %s, want TRANSFER_OUT", txn.GetType())
				}
			})
	})

	t.Run("2_Transfer_DestinationLeg", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 2")

		fin.CreateAccount(t, driver.AccountOptions{
			Name:           "Savings Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 50000,
		}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "bank_2",
				DocType:     financev1.InboxItem_BANK_NOTIFICATION,
				Amount:      15000, // $150.00 received in Savings
				Currency:    "USD",
				AccountName: "Savings Account",
			}).
			UpdateInboxItem(t, "bank_2", driver.StageInboxItemOptions{
				TransactionType:        "TRANSFER",
				DestinationAccountName: "Main Checking",
				TransferLeg:            "DESTINATION",
			}).
			ApproveInboxItem(t, "bank_2").
			AssertAccountBalance(t, "Savings Account", 35000). // 50000 - 15000 = 35000
			AssertAccountBalance(t, "Main Checking", 115000).  // 100000 + 15000 = 115000
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 15000 {
					t.Errorf("Transaction amount = %d, want 15000", txn.GetAmount())
				}
				if txn.GetType() != financev1.Transaction_TRANSFER_IN {
					t.Errorf("Transaction type = %s, want TRANSFER_IN", txn.GetType())
				}
			})
	})

	t.Run("3_Transfer_MissingSourceAccount_Rejection", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 3")

		fin.CreateAccount(t, driver.AccountOptions{
			Name:           "Savings Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 50000,
		}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:      "bank_3",
				DocType:  financev1.InboxItem_BANK_NOTIFICATION,
				Amount:   10000,
				Currency: "USD",
			}).
			UpdateInboxItem(t, "bank_3", driver.StageInboxItemOptions{
				TransactionType:        "TRANSFER",
				DestinationAccountName: "Savings Account",
			}).
			ApproveInboxItem(t, "bank_3", "missing source account for transfer")
	})

	t.Run("4_Transfer_MissingDestinationAccount_Rejection", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 4")

		fin.StageInboxItem(t, driver.StageInboxItemOptions{
			Key:         "bank_4",
			DocType:     financev1.InboxItem_BANK_NOTIFICATION,
			Amount:      10000,
			Currency:    "USD",
			AccountName: "Main Checking",
		}).
			UpdateInboxItem(t, "bank_4", driver.StageInboxItemOptions{
				TransactionType: "TRANSFER",
			}).
			ApproveInboxItem(t, "bank_4", "missing destination account for transfer")
	})

	t.Run("5_StandaloneDebit_CreatesExpense", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 5")

		fin.StageInboxItem(t, driver.StageInboxItemOptions{
			Key:         "bank_5",
			DocType:     financev1.InboxItem_BANK_NOTIFICATION,
			Amount:      3500, // $35.00 debit
			Currency:    "USD",
			Vendor:      "Coffee Shop",
			AccountName: "Main Checking",
			BudgetName:  "General Expenses",
		}).
			UpdateInboxItem(t, "bank_5", driver.StageInboxItemOptions{
				TransactionType: "EXPENSE",
			}).
			ApproveInboxItem(t, "bank_5").
			AssertAccountBalance(t, "Main Checking", 96500). // 100000 - 3500
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 3500 {
					t.Errorf("Transaction amount = %d, want 3500", txn.GetAmount())
				}
				if txn.GetDescription() != "Coffee Shop" {
					t.Errorf("Transaction description = %q, want Coffee Shop", txn.GetDescription())
				}
				if txn.GetType() != financev1.Transaction_EXPENSE {
					t.Errorf("Transaction type = %s, want EXPENSE", txn.GetType())
				}
			})
	})

	t.Run("6_StandaloneCredit_CreatesIncome", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 6")

		fin.StageInboxItem(t, driver.StageInboxItemOptions{
			Key:         "bank_6",
			DocType:     financev1.InboxItem_BANK_NOTIFICATION,
			Amount:      250000, // $2,500.00 direct deposit
			Currency:    "USD",
			Vendor:      "Employer Payroll",
			AccountName: "Main Checking",
		}).
			UpdateInboxItem(t, "bank_6", driver.StageInboxItemOptions{
				TransactionType: "INCOME",
			}).
			ApproveInboxItem(t, "bank_6").
			AssertAccountBalance(t, "Main Checking", 350000). // 100000 + 250000
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 250000 {
					t.Errorf("Transaction amount = %d, want 250000", txn.GetAmount())
				}
				if txn.GetType() != financev1.Transaction_INCOME {
					t.Errorf("Transaction type = %s, want INCOME", txn.GetType())
				}
			})
	})

	t.Run("7_CardDebit_MatchedByLastFour", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 7")

		fin.CreateAccount(t, driver.AccountOptions{
			Name:           "Credit Card",
			Type:           financev1.Account_CREDIT_CARD,
			Currency:       "USD",
			InitialBalance: 0,
			LastFour:       "4321",
		}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:          "bank_7",
				DocType:      financev1.InboxItem_BANK_NOTIFICATION,
				Amount:       6000, // $60.00
				Currency:     "USD",
				Vendor:       "Grocery Store",
				CardLastFour: "4321",
				BudgetName:   "General Expenses",
			}).
			UpdateInboxItem(t, "bank_7", driver.StageInboxItemOptions{
				TransactionType: "EXPENSE",
			}).
			ApproveInboxItem(t, "bank_7").
			AssertAccountBalance(t, "Credit Card", 6000).
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 6000 {
					t.Errorf("Transaction amount = %d, want 6000", txn.GetAmount())
				}
			})
	})

	t.Run("8_LinkToExistingTransaction_ExactAmount", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 8")

		fin.CreateExpense(t, driver.ExpenseOptions{
			Account:     "Main Checking",
			Budget:      "General Expenses",
			Amount:      4000,
			Currency:    "USD",
			Description: "Dinner",
		}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "bank_8",
				DocType:     financev1.InboxItem_BANK_NOTIFICATION,
				Amount:      4000,
				Currency:    "USD",
				AccountName: "Main Checking",
			}).
			UpdateInboxItem(t, "bank_8", driver.StageInboxItemOptions{
				LinkToLastTransaction: true,
			}).
			ApproveInboxItem(t, "bank_8").
			AssertTransactionCount(t, 1).                    // 0 duplicate transactions
			AssertAccountBalance(t, "Main Checking", 96000). // 100000 - 4000
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 4000 {
					t.Errorf("Transaction amount = %d, want 4000", txn.GetAmount())
				}
			})
	})

	t.Run("9_LinkToExistingTransaction_WithAmountOverwrite", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 9")

		fin.CreateExpense(t, driver.ExpenseOptions{
			Account:     "Main Checking",
			Budget:      "General Expenses",
			Amount:      4000,
			Currency:    "USD",
			Description: "Bistro",
		}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "bank_9",
				DocType:     financev1.InboxItem_BANK_NOTIFICATION,
				Amount:      4500, // $45.00 final posted
				Currency:    "USD",
				AccountName: "Main Checking",
			}).
			UpdateInboxItem(t, "bank_9", driver.StageInboxItemOptions{
				LinkToLastTransaction:      true,
				OverwriteLinkedTransaction: true,
			}).
			ApproveInboxItem(t, "bank_9").
			AssertTransactionCount(t, 1).
			AssertAccountBalance(t, "Main Checking", 95500). // 100000 - 4500
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 4500 {
					t.Errorf("Transaction amount = %d, want 4500", txn.GetAmount())
				}
			})
	})

	t.Run("10_LinkToUnpaidScheduledPayment", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 10")

		fin.CreateRecurringTransaction(t, "Gym Membership", "General Expenses", 5000, "USD").
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "bank_10",
				DocType:     financev1.InboxItem_BANK_NOTIFICATION,
				Amount:      5000,
				Currency:    "USD",
				AccountName: "Main Checking",
			}).
			UpdateInboxItem(t, "bank_10", driver.StageInboxItemOptions{
				ScheduledTransactionName: "Gym Membership",
			}).
			ApproveInboxItem(t, "bank_10").
			AssertTransactionCount(t, 1).
			AssertPendingScheduledTransactionsCount(t, 0).
			AssertAccountBalance(t, "Main Checking", 95000).
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 5000 {
					t.Errorf("Transaction amount = %d, want 5000", txn.GetAmount())
				}
				if txn.GetMetadata()["scheduled_payment_id"] == "" {
					t.Error("Expected scheduled_payment_id in transaction metadata, got empty")
				}
			})
	})

	t.Run("11_LinkToBorrowing_InitialDisbursement", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 11")

		fin.CreateBorrowing(t, driver.BorrowingOptions{
			Name:         "Personal Loan",
			Counterparty: "Bank Co",
			Direction:    financev1.Borrowing_BORROWED,
			Currency:     "USD",
			TotalAmount:  100000,
		}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "bank_11",
				DocType:     financev1.InboxItem_BANK_NOTIFICATION,
				Amount:      100000,
				Currency:    "USD",
				AccountName: "Main Checking",
				BudgetName:  "General Expenses",
			}).
			UpdateInboxItem(t, "bank_11", driver.StageInboxItemOptions{
				BorrowingID:       "Personal Loan",
				BorrowingLinkType: financev1.BorrowingLinkType_BORROWING_LINK_TYPE_INITIAL_RECEIPT,
			}).
			ApproveInboxItem(t, "bank_11").
			AssertTransactionCount(t, 1).
			AssertBorrowingBalance(t, "Personal Loan", 100000).
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 100000 {
					t.Errorf("Transaction amount = %d, want 100000", txn.GetAmount())
				}
				if txn.GetMetadata()["borrowing_id"] == "" {
					t.Error("Expected borrowing_id in transaction metadata, got empty")
				}
			})
	})

	t.Run("12_LinkToBorrowing_Repayment", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 12")

		fin.CreateBorrowing(t, driver.BorrowingOptions{
			Name:         "Auto Loan",
			Counterparty: "Credit Union",
			Direction:    financev1.Borrowing_BORROWED,
			Currency:     "USD",
			TotalAmount:  50000,
		}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "bank_12",
				DocType:     financev1.InboxItem_BANK_NOTIFICATION,
				Amount:      10000,
				Currency:    "USD",
				AccountName: "Main Checking",
				BudgetName:  "General Expenses",
			}).
			UpdateInboxItem(t, "bank_12", driver.StageInboxItemOptions{
				BorrowingID:       "Auto Loan",
				BorrowingLinkType: financev1.BorrowingLinkType_BORROWING_LINK_TYPE_REPAYMENT,
			}).
			ApproveInboxItem(t, "bank_12").
			AssertTransactionCount(t, 1).
			AssertBorrowingBalance(t, "Auto Loan", 40000).
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 10000 {
					t.Errorf("Transaction amount = %d, want 10000", txn.GetAmount())
				}
				if txn.GetMetadata()["borrowing_id"] == "" {
					t.Error("Expected borrowing_id in transaction metadata, got empty")
				}
			})
	})

	t.Run("13_DiscardBankNotification", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 13")

		fin.StageInboxItem(t, driver.StageInboxItemOptions{
			Key:         "bank_13",
			DocType:     financev1.InboxItem_BANK_NOTIFICATION,
			Amount:      9900,
			Currency:    "USD",
			Vendor:      "Suspicious Activity",
			AccountName: "Main Checking",
		}).
			AssertInboxItemCount(t, financev1.InboxItem_PENDING, 1).
			DiscardInboxItem(t, "bank_13").
			AssertInboxItemCount(t, financev1.InboxItem_PENDING, 0).
			AssertTransactionCount(t, 0).
			AssertAccountBalance(t, "Main Checking", 100000)
	})

	t.Run("14_CrossCurrencyTransfer", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 14")

		fin.CreateAccount(t, driver.AccountOptions{
			Name:           "EUR Savings",
			Type:           financev1.Account_BANK,
			Currency:       "EUR",
			InitialBalance: 0,
		}).
			CreateExchangeRate(t, "USD", "EUR", 0.90).
			CreateExchangeRate(t, "EUR", "USD", 1.11).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "bank_14",
				DocType:     financev1.InboxItem_BANK_NOTIFICATION,
				Amount:      10000, // $100.00 transfer out
				Currency:    "USD",
				AccountName: "Main Checking",
			}).
			UpdateInboxItem(t, "bank_14", driver.StageInboxItemOptions{
				TransactionType:        "TRANSFER",
				DestinationAccountName: "EUR Savings",
				TransferLeg:            "SOURCE",
			}).
			ApproveInboxItem(t, "bank_14").
			AssertAccountBalance(t, "Main Checking", 90000).
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 10000 {
					t.Errorf("Transaction amount = %d, want 10000", txn.GetAmount())
				}
			})
	})

	t.Run("15_Transfer_InvalidAccountID_Rejection", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 15")

		fin.StageInboxItem(t, driver.StageInboxItemOptions{
			Key:         "bank_15",
			DocType:     financev1.InboxItem_BANK_NOTIFICATION,
			Amount:      10000,
			Currency:    "USD",
			AccountName: "Main Checking",
		}).
			UpdateInboxItem(t, "bank_15", driver.StageInboxItemOptions{
				TransactionType:        "TRANSFER",
				DestinationAccountName: "NonExistentAccount",
			}).
			ApproveInboxItem(t, "bank_15", "invalid destination account")
	})

	t.Run("16_CardRefund_CreatesIncome", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 16")

		fin.StageInboxItem(t, driver.StageInboxItemOptions{
			Key:         "bank_16",
			DocType:     financev1.InboxItem_BANK_NOTIFICATION,
			Amount:      4500, // $45.00 merchant refund
			Currency:    "USD",
			Vendor:      "Store Refund",
			AccountName: "Main Checking",
		}).
			UpdateInboxItem(t, "bank_16", driver.StageInboxItemOptions{
				TransactionType: "INCOME",
			}).
			ApproveInboxItem(t, "bank_16").
			AssertAccountBalance(t, "Main Checking", 104500).
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 4500 {
					t.Errorf("Transaction amount = %d, want 4500", txn.GetAmount())
				}
				if txn.GetType() != financev1.Transaction_INCOME {
					t.Errorf("Transaction type = %s, want INCOME", txn.GetType())
				}
			})
	})

	t.Run("17_ACH_AutoPayBill_WithAmountOverwrite", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 17")

		fin.CreateRecurringTransaction(t, "Electric Bill", "General Expenses", 8000, "USD").
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "bank_17",
				DocType:     financev1.InboxItem_BANK_NOTIFICATION,
				Amount:      8500, // $85.00 actual cleared vs $80.00 bill
				Currency:    "USD",
				AccountName: "Main Checking",
			}).
			UpdateInboxItem(t, "bank_17", driver.StageInboxItemOptions{
				ScheduledTransactionName: "Electric Bill",
			}).
			ApproveInboxItem(t, "bank_17").
			AssertPendingScheduledTransactionsCount(t, 0).
			AssertAccountBalance(t, "Main Checking", 91500). // 100000 - 8500 = 91500
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 8500 {
					t.Errorf("Transaction amount = %d, want 8500", txn.GetAmount())
				}
			})
	})

	t.Run("18_AdditionalLineOfCreditDrawdown", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 18")

		fin.CreateBorrowing(t, driver.BorrowingOptions{
			Name:         "Line of Credit",
			Counterparty: "Credit Union",
			Direction:    financev1.Borrowing_BORROWED,
			Currency:     "USD",
			TotalAmount:  30000,
		}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "bank_18",
				DocType:     financev1.InboxItem_BANK_NOTIFICATION,
				Amount:      20000, // $200.00 drawdown
				Currency:    "USD",
				AccountName: "Main Checking",
				BudgetName:  "General Expenses",
			}).
			UpdateInboxItem(t, "bank_18", driver.StageInboxItemOptions{
				BorrowingID:       "Line of Credit",
				BorrowingLinkType: financev1.BorrowingLinkType_BORROWING_LINK_TYPE_ADDITIONAL_LOAN,
			}).
			ApproveInboxItem(t, "bank_18").
			AssertBorrowingBalance(t, "Line of Credit", 50000). // 30000 + 20000 = 50000
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 20000 {
					t.Errorf("Transaction amount = %d, want 20000", txn.GetAmount())
				}
			})
	})

	t.Run("19_BorrowingRelink_Rejection", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 19")

		fin.CreateBorrowing(t, driver.BorrowingOptions{
			Name:         "Loan Alpha",
			Counterparty: "Bank A",
			Direction:    financev1.Borrowing_BORROWED,
			Currency:     "USD",
			TotalAmount:  50000,
		}).
			CreateBorrowing(t, driver.BorrowingOptions{
				Name:         "Loan Beta",
				Counterparty: "Bank B",
				Direction:    financev1.Borrowing_BORROWED,
				Currency:     "USD",
				TotalAmount:  50000,
			}).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "init_loan_a",
				DocType:     financev1.InboxItem_BANK_NOTIFICATION,
				Amount:      10000,
				Currency:    "USD",
				AccountName: "Main Checking",
				BudgetName:  "General Expenses",
			}).
			UpdateInboxItem(t, "init_loan_a", driver.StageInboxItemOptions{
				BorrowingID:       "Loan Alpha",
				BorrowingLinkType: financev1.BorrowingLinkType_BORROWING_LINK_TYPE_REPAYMENT,
			}).
			ApproveInboxItem(t, "init_loan_a").
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "bank_19",
				DocType:     financev1.InboxItem_BANK_NOTIFICATION,
				Amount:      10000,
				Currency:    "USD",
				AccountName: "Main Checking",
				BudgetName:  "General Expenses",
			}).
			UpdateInboxItem(t, "bank_19", driver.StageInboxItemOptions{
				BorrowingID:           "Loan Beta", // Try to relink Alpha's transaction to Beta
				BorrowingLinkType:     financev1.BorrowingLinkType_BORROWING_LINK_TYPE_REPAYMENT,
				LinkToLastTransaction: true,
			}).
			ApproveInboxItem(t, "bank_19", "cannot relink transaction to a different borrowing agreement")
	})

	t.Run("20_ForeignCurrencyBankNotification", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 20")

		fin.CreateExchangeRate(t, "EUR", "USD", 1.10).
			StageInboxItem(t, driver.StageInboxItemOptions{
				Key:         "bank_20",
				DocType:     financev1.InboxItem_BANK_NOTIFICATION,
				Amount:      10000, // EUR 100.00
				Currency:    "EUR",
				Vendor:      "Euro Coffee",
				AccountName: "Main Checking",
				BudgetName:  "General Expenses",
			}).
			UpdateInboxItem(t, "bank_20", driver.StageInboxItemOptions{
				TransactionType: "EXPENSE",
			}).
			ApproveInboxItem(t, "bank_20").
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 10000 {
					t.Errorf("Transaction amount = %d, want 10000", txn.GetAmount())
				}
				if txn.GetAmountInBase() != 11000 { // 10000 * 1.10 = 11000 USD cents
					t.Errorf("Transaction AmountInBase = %d, want 11000", txn.GetAmountInBase())
				}
			})
	})

	t.Run("21_BankFeeNotification", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 21")

		fin.StageInboxItem(t, driver.StageInboxItemOptions{
			Key:         "bank_21",
			DocType:     financev1.InboxItem_BANK_NOTIFICATION,
			Amount:      1500, // $15.00 wire fee
			Currency:    "USD",
			Vendor:      "Bank Wire Transfer Fee",
			AccountName: "Main Checking",
			BudgetName:  "General Expenses",
		}).
			UpdateInboxItem(t, "bank_21", driver.StageInboxItemOptions{
				TransactionType: "EXPENSE",
			}).
			ApproveInboxItem(t, "bank_21").
			AssertAccountBalance(t, "Main Checking", 98500). // 100000 - 1500
			AssertLastTransaction(t, func(txn *financev1.Transaction) {
				if txn.GetAmount() != 1500 {
					t.Errorf("Transaction amount = %d, want 1500", txn.GetAmount())
				}
				if txn.GetDescription() != "Bank Wire Transfer Fee" {
					t.Errorf("Transaction description = %q, want Bank Wire Transfer Fee", txn.GetDescription())
				}
			})
	})

	t.Run("22_IdempotentDuplicateApproval", func(t *testing.T) {
		_, fin := setupBankTest(t, "Bank Space 22")

		fin.StageInboxItem(t, driver.StageInboxItemOptions{
			Key:         "bank_22",
			DocType:     financev1.InboxItem_BANK_NOTIFICATION,
			Amount:      5000,
			Currency:    "USD",
			Vendor:      "Utility Co",
			AccountName: "Main Checking",
			BudgetName:  "General Expenses",
		}).
			UpdateInboxItem(t, "bank_22", driver.StageInboxItemOptions{
				TransactionType: "EXPENSE",
			}).
			ApproveInboxItem(t, "bank_22").
			AssertTransactionCount(t, 1).
			AssertAccountBalance(t, "Main Checking", 95000).
			ApproveInboxItem(t, "bank_22", "inbox item is already processed").
			AssertTransactionCount(t, 1).                   // 0 extra transactions created
			AssertAccountBalance(t, "Main Checking", 95000) // balance intact
	})
}
