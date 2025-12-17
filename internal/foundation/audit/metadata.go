package audit

import (
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/auth"
)

// Metadata holds auditing information for entities.
type Metadata struct {
	CreateBy   auth.UserID
	CreateTime time.Time
	UpdateBy   auth.UserID
	UpdateTime time.Time
	DeleteBy   *auth.UserID
	DeleteTime *time.Time
}

// NewMetadata creates a new Metadata instance with the given actor as
// creator and updater.
func NewMetadata(actor auth.UserID) Metadata {
	now := time.Now().UTC()
	return Metadata{
		CreateBy:   actor,
		CreateTime: now,
		UpdateBy:   actor,
		UpdateTime: now,
	}
}

// Touch updates the UpdatedBy and UpdatedAt fields to reflect a modification
// by the given actor.
func (m *Metadata) Touch(actor auth.UserID) {
	if m == nil {
		return
	}
	m.UpdateBy = actor
	m.UpdateTime = time.Now().UTC()
}
