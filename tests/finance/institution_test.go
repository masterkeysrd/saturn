package finance_test

import (
	"testing"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestInstitutionLifecycle(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().
		Ensure(t, "Personal Space")

	// 1. Create institution using fluent driver method
	d.Finance().
		CreateInstitution(t, driver.InstitutionOptions{
			Name:   "Chase Bank",
			Domain: "chase.com",
			Color:  "#0000FF",
			Assert: func(tb testing.TB, inst *financev1.Institution) {
				if inst.GetId() == "" {
					tb.Fatalf("expected non-empty institution ID")
				}
				if inst.GetVersion() != 1 {
					tb.Errorf("version = %d, want 1", inst.GetVersion())
				}
			},
		})

	// 2. Update institution using fluent driver method with field mask
	d.Finance().
		UpdateInstitution(t, driver.InstitutionUpdateOptions{
			Institution: "Chase Bank",
			Color:       "#0000AA",
			UpdateMask:  []string{"color"},
			Assert: func(tb testing.TB, inst *financev1.Institution) {
				if inst.GetColor() != "#0000AA" {
					tb.Errorf("Color = %s, want #0000AA", inst.GetColor())
				}
				if inst.GetVersion() != 2 {
					tb.Errorf("updated version = %d, want 2", inst.GetVersion())
				}
			},
		})

	// 3. Update with outdated version (expects error)
	outdatedVer := int64(1)
	d.Finance().
		UpdateInstitution(t, driver.InstitutionUpdateOptions{
			Institution: "Chase Bank",
			Color:       "#FF0000",
			Version:     &outdatedVer,
			ExpectErr:   "version mismatch",
		})
}
