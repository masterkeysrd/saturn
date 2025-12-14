package audit

import (
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/auth"
)

// Metadata holds auditing information for entities.
type Metadata struct {
	CreatedBy  auth.UserID
	CreateTime time.Time
	UpdatedBy  auth.UserID
	UpdateTime time.Time
	DeletedBy  *auth.UserID
	DeleteTime *time.Time
}

// NewMetadata creates a new Metadata instance with the given actor as
// creator and updater.
func NewMetadata(actor auth.UserID) Metadata {
	now := time.Now().UTC()
	return Metadata{
		CreatedBy:  actor,
		CreateTime: now,
		UpdatedBy:  actor,
		UpdateTime: now,
	}
}

// Touch updates the UpdatedBy and UpdatedAt fields to reflect a modification
// by the given actor.
func (m *Metadata) Touch(actor auth.UserID) {
	if m == nil {
		return
	}
	m.UpdatedBy = actor
	m.UpdateTime = time.Now().UTC()
}
