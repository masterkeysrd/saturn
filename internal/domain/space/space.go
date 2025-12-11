package space

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/masterkeysrd/saturn/internal/foundation/audit"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/foundation/fieldmask"
	"github.com/masterkeysrd/saturn/internal/foundation/id"
	base "github.com/masterkeysrd/saturn/internal/foundation/space"
)

type (
	// SpaceID aliases [base.SpaceID] for consistency across the codebase.
	SpaceID = base.ID

	// UserID aliases [auth.UserID] for consistency across the codebase.
	UserID = auth.UserID
)

type SpaceStore interface {
	Get(context.Context, SpaceID) (*Space, error)
	Store(context.Context, *Space) error
	Delete(context.Context, SpaceID) error

	ListBy(context.Context, ListSpacesCriteria) ([]*Space, error)
}

type ListSpacesCriteria interface {
	isListSpacesCriteria()
}

var SpaceUpdateSchema = fieldmask.NewSchema("space").
	Field("name",
		fieldmask.WithDescription("The name of the space"),
		fieldmask.WithRequired(),
	).
	Field("alias",
		fieldmask.WithDescription("An optional short alias for the space"),
	).
	Build()

// Space represents a individual space (tenant or workspace) where users
// can collaborate and manage resources.
type Space struct {
	ID      SpaceID
	OwnerID UserID
	Name    string
	Alias   *string // Optional short alias for the space

	audit.Metadata
}

func (s *Space) Initialize(ownerID UserID) error {
	if s == nil {
		return nil
	}

	sid, err := id.New[SpaceID]()
	if err != nil {
		return fmt.Errorf("failed to generate space ID: %w", err)
	}

	s.ID = sid
	s.Metadata = audit.NewMetadata(ownerID)
	return nil
}

func (s *Space) Sanitize() {
	if s == nil {
		return
	}

	s.Name = strings.TrimSpace(s.Name)
	if s.Alias != nil {
		alias := strings.TrimSpace(*s.Alias)
		s.Alias = &alias
	}
}

func (s *Space) Validate() error {
	if s == nil {
		return nil
	}

	if err := id.Validate(s.ID); err != nil {
		return fmt.Errorf("invalid space ID: %w", err)
	}

	if id.Validate(s.OwnerID) != nil {
		return errors.New("invalid space: missing OwnerID")
	}

	if s.Name == "" {
		return errors.New("invalid space: missing Name")
	}

	if len(s.Name) < 3 || len(s.Name) > 100 {
		return errors.New("invalid space: Name must be between 3 and 100 characters")
	}

	if alias := s.Alias; alias != nil {
		if len(*alias) < 2 || len(*alias) > 50 {
			return errors.New("invalid space: Alias must be between 2 and 50 characters")
		}
	}

	return nil
}

func (s *Space) Update(updates *Space, mask *fieldmask.FieldMask) error {
	if s == nil {
		return fmt.Errorf("space is nil")
	}

	if updates == nil {
		return fmt.Errorf("updates are nil")
	}

	if err := SpaceUpdateSchema.Validate(mask); err != nil {
		return fmt.Errorf("invalid field mask: %w", err)
	}

	if mask.Contains("name") {
		s.Name = updates.Name
	}

	if mask.Contains("alias") {
		s.Alias = updates.Alias
	}

	return nil
}
