package identitypg

import (
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

func Provide(inj deps.Injector) error {
	if err := inj.Provide(NewUserStore, deps.As(new(identity.UserStore))); err != nil {
		return err
	}

	return nil
}
