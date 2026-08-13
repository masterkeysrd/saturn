package finance_test

import (
	"testing"
	"time"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestManualIncomeFlows_CreateUpdateDelete_AdjustsBalances(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	// Initialize Finance settings for the space
	d.Finance().
		InitSettings(t, "USD")

	// 1. Create a Target Bank Account with Initial Balance $500.00
	d.Finance().
		CreateAccount(t, driver.AccountOptions{
			Name:           "Primary Checking",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 50000, // $500.00
		})

	// Verify initial balance
	d.Finance().
		AssertAccount(t, "Primary Checking", func(acc *financev1.Account) {
			if acc.GetCurrentBalance() != 50000 {
				t.Errorf("expected initial balance 50000, got %d", acc.GetCurrentBalance())
			}
		})

	// 2. Create manual income transaction of $200.00
	d.Finance().
		CreateIncome(t, driver.IncomeOptions{
			Account:         "Primary Checking",
			Amount:          20000, // $200.00
			Currency:        "USD",
			Description:     "Freelance Work Payout",
			TransactionDate: time.Now().UTC(),
			Assert: func(tb testing.TB, txn *financev1.Transaction) {
				if txn.GetType() != financev1.Transaction_INCOME {
					tb.Errorf("expected transaction type INCOME, got %v", txn.GetType())
				}
				if txn.GetBudgetId() != "" {
					tb.Errorf("expected income transaction to have no budget ID, got %s", txn.GetBudgetId())
				}
			},
		})

	// 3. Verify Account Balance increased to $700.00
	d.Finance().
		AssertAccount(t, "Primary Checking", func(acc *financev1.Account) {
			if acc.GetCurrentBalance() != 70000 {
				t.Errorf("expected balance 70000 after income log, got %d", acc.GetCurrentBalance())
			}
		})

	// 4. Update the income transaction amount to $350.00
	d.Finance().
		UpdateIncome(t, driver.IncomeOptions{
			Account:         "Primary Checking",
			Amount:          35000, // $350.00
			Currency:        "USD",
			Description:     "Freelance Work Payout (Bonus included)",
			TransactionDate: time.Now().UTC(),
		})

	// 5. Verify Account Balance updated to $850.00 ($500.00 + $350.00)
	d.Finance().
		AssertAccount(t, "Primary Checking", func(acc *financev1.Account) {
			if acc.GetCurrentBalance() != 85000 {
				t.Errorf("expected balance 85000 after income update, got %d", acc.GetCurrentBalance())
			}
		})

	// 6. Delete the income transaction
	d.Finance().
		DeleteLastTransaction(t)

	// 7. Verify Account Balance reverted back to $500.00
	d.Finance().
		AssertAccount(t, "Primary Checking", func(acc *financev1.Account) {
			if acc.GetCurrentBalance() != 50000 {
				t.Errorf("expected balance 50000 after income deletion, got %d", acc.GetCurrentBalance())
			}
		})
}
