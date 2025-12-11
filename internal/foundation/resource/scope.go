package resource

import (
	"github.com/masterkeysrd/saturn/internal/foundation/audit"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/foundation/space"
)

type Scope struct {
	SpaceID space.ID
	audit.Metadata
}

func NewScope(spaceID space.ID, actor auth.UserID) Scope {
	return Scope{
		SpaceID:  spaceID,
		Metadata: audit.NewMetadata(actor),
	}
}
