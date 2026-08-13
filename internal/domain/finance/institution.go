package finance

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
)

// InstitutionID is a custom string type representing an institution's unique identifier.
type InstitutionID string

const institutionPrefix = "inst_"

// NewInstitutionID creates a new InstitutionID.
func NewInstitutionID() (InstitutionID, error) {
	raw, err := id.Generate(institutionPrefix)
	if err != nil {
		return "", err
	}
	return InstitutionID(raw), nil
}

// Validate checks if the InstitutionID is valid.
func (iid InstitutionID) Validate() error {
	return id.Validate(string(iid), institutionPrefix)
}

func (iid InstitutionID) String() string {
	return string(iid)
}

// Institution represents a financial bank, brokerage, or payment platform.
type Institution struct {
	ID         InstitutionID
	SpaceID    SpaceID
	Name       string
	Domain     string
	LogoURL    string
	Color      string
	Version    int64
	CreateTime time.Time
	UpdateTime time.Time
}

// Init prepares a new institution entity for creation by generating an ID (if missing), auto-resolving domain & logo URL, and populating creation timestamps.
func (i *Institution) Init() error {
	if string(i.ID) == "" {
		instID, err := NewInstitutionID()
		if err != nil {
			return fmt.Errorf("generate institution ID: %w", err)
		}
		i.ID = instID
	}
	if i.Domain == "" {
		i.Domain = AutoResolveInstitutionDomain(i.Name)
	}
	if i.LogoURL == "" && i.Domain != "" {
		i.LogoURL = BuildInstitutionFaviconURL(i.Domain)
	}
	now := time.Now().UTC()
	i.CreateTime = now
	i.UpdateTime = now
	return nil
}

// Validate checks the institution's business rules.
func (i *Institution) Validate() error {
	i.Name = strings.TrimSpace(i.Name)
	if i.Name == "" {
		return errors.New("institution name is required")
	}
	if len(i.Name) > 255 {
		return errors.New("institution name must not exceed 255 characters")
	}
	i.Domain = strings.ToLower(strings.TrimSpace(i.Domain))
	i.LogoURL = strings.TrimSpace(i.LogoURL)
	i.Color = strings.TrimSpace(i.Color)
	if i.Color == "" {
		i.Color = "indigo"
	}
	if err := i.ID.Validate(); err != nil {
		return fmt.Errorf("validate institution ID: %w", err)
	}
	if err := i.SpaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	return nil
}

// InstitutionPatchSchema defines patchable fields for an Institution entity.
var InstitutionPatchSchema = patch.NewSchema[Institution]().
	Register("name", patch.Field(func(i *Institution) *string { return &i.Name })).
	Register("domain", patch.Field(func(i *Institution) *string { return &i.Domain })).
	Register("logo_url", patch.Field(func(i *Institution) *string { return &i.LogoURL })).
	Register("color", patch.Field(func(i *Institution) *string { return &i.Color }))

// ApplyPatch applies partial updates.
func (i *Institution) ApplyPatch(incoming *Institution, mask []string) error {
	if err := InstitutionPatchSchema.Apply(i, incoming, mask); err != nil {
		return err
	}
	i.UpdateTime = time.Now().UTC()
	return i.Validate()
}
