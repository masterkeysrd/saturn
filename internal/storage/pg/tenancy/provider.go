package tenancypg

import (
	"github.com/masterkeysrd/saturn/internal/domain/tenancy"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

func Provide(inj deps.Injector) error {
	if err := inj.Provide(NewSpaceStore, deps.As(new(tenancy.SpaceStore))); err != nil {
		return err
	}

	if err := inj.Provide(NewMembershipStore, deps.As(new(tenancy.MembershipStore))); err != nil {
		return err
	}

	return nil
}
