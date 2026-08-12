package finance_test

import (
	"testing"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestAccountOptimisticLockingAndFieldMasking(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	// 1. Create Account using fluent driver method
	d.Finance().
		CreateAccount(t, driver.AccountOptions{
			Name:           "Wells Savings",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 50000,
			Assert: func(tb testing.TB, acc *financev1.Account) {
				if acc.GetVersion() != 1 {
					tb.Errorf("created account version = %d, want 1", acc.GetVersion())
				}
			},
		})

	// 2. Update Account with FieldMask
	ver := int64(1)
	d.Finance().
		UpdateAccount(t, driver.AccountUpdateOptions{
			Account:    "Wells Savings",
			Notes:      "Primary savings account",
			Color:      "#00FF00",
			UpdateMask: []string{"notes", "color"},
			Version:    &ver,
			Assert: func(tb testing.TB, acc *financev1.Account) {
				if acc.GetVersion() != 2 {
					tb.Errorf("updated account version = %d, want 2", acc.GetVersion())
				}
				if acc.GetNotes() != "Primary savings account" || acc.GetColor() != "#00FF00" {
					tb.Errorf("Account field mask patch failed: notes=%s, color=%s", acc.GetNotes(), acc.GetColor())
				}
			},
		})

	// 3. Update Account with outdated Version (expect error)
	outdatedVer := int64(1)
	d.Finance().
		UpdateAccount(t, driver.AccountUpdateOptions{
			Account:    "Wells Savings",
			Color:      "#0000FF",
			UpdateMask: []string{"color"},
			Version:    &outdatedVer,
			ExpectErr:  "version mismatch",
		})

	// 4. Create secondary account and set it as default before deleting "Wells Savings"
	d.Finance().
		CreateAccount(t, driver.AccountOptions{
			Name:           "Secondary Account",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 10000,
		})

	secVer := int64(1)
	d.Finance().
		UpdateAccount(t, driver.AccountUpdateOptions{
			Account:    "Secondary Account",
			IsDefault:  true,
			UpdateMask: []string{"is_default"},
			Version:    &secVer,
		})

	// 5. Delete Account with correct version
	finalVer := int64(2)
	d.Finance().
		DeleteAccount(t, "Wells Savings", &finalVer, "")
}
