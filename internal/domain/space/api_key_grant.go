package space

import (
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// APIKeyGrant represents an explicit workspace access grant bound to a user's API key.
type APIKeyGrant struct {
	APIKeyID   string    `json:"api_key_id"`
	SpaceID    SpaceID   `json:"space_id"`
	UserID     UserID    `json:"user_id"`
	CreateTime time.Time `json:"create_time"`
}

// Validate ensures required grant fields are populated.
func (g *APIKeyGrant) Validate() error {
	if g == nil {
		return errors.E(errors.Invalid, "api key grant payload is required")
	}
	if g.APIKeyID == "" {
		return errors.E(errors.Invalid, "api_key_id is required")
	}
	if g.SpaceID == "" {
		return errors.E(errors.Invalid, "space_id is required")
	}
	if g.UserID == "" {
		return errors.E(errors.Invalid, "user_id is required")
	}
	return nil
}
