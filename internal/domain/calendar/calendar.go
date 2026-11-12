package calendar

import (
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
)

// CalendarPrefix is the unique prefix for calendar IDs.
const CalendarPrefix = "cal_"

// CalendarIDGenerator generates and validates Calendar IDs.
var CalendarIDGenerator = id.NewPrefixGenerator(CalendarPrefix)

// GenerateCalendarID generates a new Calendar ID with the cal_ prefix.
func GenerateCalendarID() (string, error) {
	return CalendarIDGenerator.Generate()
}

// ValidateCalendarID checks that idStr is a valid Calendar ID.
func ValidateCalendarID(idStr string) error {
	return CalendarIDGenerator.Validate(idStr)
}

// CalendarSource describes whether a calendar is created natively or synced externally.
type CalendarSource string

const (
	// SourceNative indicates the calendar was created natively within the workspace.
	SourceNative CalendarSource = "native"

	// SourceExternal indicates the calendar is synchronized from an external OAuth provider (Google, Microsoft).
	SourceExternal CalendarSource = "external"
)

// IsValid checks if the calendar source is supported.
func (s CalendarSource) IsValid() bool {
	return s == SourceNative || s == SourceExternal
}

// AccessRole defines the caller's or space's permission level for this calendar.
type AccessRole string

const (
	// AccessRoleOwner grants full control including deleting the calendar and managing access.
	AccessRoleOwner AccessRole = "owner"

	// AccessRoleWriter grants full read and write permissions to events.
	AccessRoleWriter AccessRole = "writer"

	// AccessRoleReader grants read-only access to event details.
	AccessRoleReader AccessRole = "reader"

	// AccessRoleFreeBusy grants read access only to busy/free time blocks without event details.
	AccessRoleFreeBusy AccessRole = "free_busy"
)

// IsValid checks if the access role is valid.
func (r AccessRole) IsValid() bool {
	switch r {
	case AccessRoleOwner, AccessRoleWriter, AccessRoleReader, AccessRoleFreeBusy:
		return true
	default:
		return false
	}
}

// Calendar represents a native or external calendar belonging to a workspace.
type Calendar struct {
	ID                 string         `db:"id" json:"id"`
	SpaceID            string         `db:"space_id" json:"space_id"`
	ConnectedAccountID *string        `db:"connected_account_id" json:"connected_account_id,omitempty"`
	Source             CalendarSource `db:"source" json:"source"`
	ProviderCalendarID *string        `db:"provider_calendar_id" json:"provider_calendar_id,omitempty"`
	Name               string         `db:"name" json:"name"`
	Description        *string        `db:"description" json:"description,omitempty"`
	Color              *string        `db:"color" json:"color,omitempty"`
	Timezone           string         `db:"timezone" json:"timezone"`
	AccessRole         AccessRole     `db:"access_role" json:"access_role"`
	IsPrimary          bool           `db:"is_primary" json:"is_primary"`
	IsEnabled          bool           `db:"is_enabled" json:"is_enabled"`
	IsDefaultNative    bool           `db:"is_default_native" json:"is_default_native"`
	SyncCursor         *string        `db:"sync_cursor" json:"sync_cursor,omitempty"`
	LastSyncedAt       *time.Time     `db:"last_synced_at" json:"last_synced_at,omitempty"`
	ETag               *string        `db:"etag" json:"etag,omitempty"`
	Version            int64          `db:"version" json:"version"`
	CreateTime         time.Time      `db:"create_time" json:"create_time"`
	UpdateTime         time.Time      `db:"update_time" json:"update_time"`
}

// CanWrite returns true if the calendar allows creating, editing, and deleting events.
func (c *Calendar) CanWrite() bool {
	return c.AccessRole == AccessRoleOwner || c.AccessRole == AccessRoleWriter
}

// CanManage returns true if the calendar allows administrative updates.
func (c *Calendar) CanManage() bool {
	return c.AccessRole == AccessRoleOwner
}

// Validate validates calendar invariants and constraints.
func (c *Calendar) Validate() error {
	if c == nil {
		return errors.E(errors.Invalid, "calendar is required")
	}

	if c.ID != "" {
		if err := ValidateCalendarID(c.ID); err != nil {
			return errors.E(errors.Invalid, "invalid calendar ID: %v", err)
		}
	}

	if strings.TrimSpace(c.SpaceID) == "" {
		return errors.E(errors.Invalid, "space_id is required")
	}

	c.Name = strings.TrimSpace(c.Name)
	if c.Name == "" {
		return errors.E(errors.Invalid, "calendar name is required")
	}
	if len(c.Name) > 255 {
		return errors.E(errors.Invalid, "calendar name cannot exceed 255 characters")
	}

	if !c.Source.IsValid() {
		return errors.E(errors.Invalid, "invalid calendar source: %s", c.Source)
	}

	switch c.Source {
	case SourceNative:
		if c.ConnectedAccountID != nil {
			return errors.E(errors.Invalid, "native calendar cannot have connected_account_id")
		}
	case SourceExternal:
		if c.ConnectedAccountID == nil || strings.TrimSpace(*c.ConnectedAccountID) == "" {
			return errors.E(errors.Invalid, "external calendar requires connected_account_id")
		}
	}

	if c.AccessRole == "" {
		c.AccessRole = AccessRoleOwner
	}
	if !c.AccessRole.IsValid() {
		return errors.E(errors.Invalid, "invalid access_role: %s", c.AccessRole)
	}

	c.Timezone = strings.TrimSpace(c.Timezone)
	if c.Timezone == "" {
		c.Timezone = "UTC"
	}
	if _, err := time.LoadLocation(c.Timezone); err != nil {
		return errors.E(errors.Invalid, "invalid timezone: %s", c.Timezone)
	}

	return nil
}

// CalendarPatchSchema defines fields permitted in partial calendar updates.
var CalendarPatchSchema = patch.NewSchema[Calendar]().
	Field("name", func(c *Calendar) *string { return &c.Name }).
	Field("description", func(c *Calendar) **string { return &c.Description }).
	Field("color", func(c *Calendar) **string { return &c.Color }).
	Field("timezone", func(c *Calendar) *string { return &c.Timezone }).
	Field("is_enabled", func(c *Calendar) *bool { return &c.IsEnabled })

// ApplyPatch applies field-masked updates to the Calendar.
func (c *Calendar) ApplyPatch(incoming *Calendar, mask []string) error {
	if incoming == nil {
		return errors.E(errors.Invalid, "incoming calendar is required")
	}

	if err := CalendarPatchSchema.Apply(c, incoming, mask); err != nil {
		return errors.E(errors.Invalid, err)
	}

	c.UpdateTime = time.Now().UTC()
	return c.Validate()
}
