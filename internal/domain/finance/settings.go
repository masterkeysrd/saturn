package finance

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/access"
	"github.com/masterkeysrd/saturn/internal/foundation/fieldmask"
	"github.com/masterkeysrd/saturn/internal/foundation/id"
	"github.com/masterkeysrd/saturn/internal/foundation/space"
)

type SettingsStore interface {
	Get(context.Context, space.ID) (*Settings, error)
	Store(context.Context, *Settings) error
}

var SettingsUpdateSchema = fieldmask.NewSchema("Settings").
	Field("state",
		fieldmask.WithDescription("State of the finance settings."),
	).
	Field("base_currency",
		fieldmask.WithDescription("Base currency code for the space."),
	).
	Build()

type Settings struct {
	SpaceID      space.ID
	State        SettingsState
	BaseCurrency CurrencyCode
	CreateTime   time.Time
	CreateBy     access.UserID
	UpdateTime   time.Time
	UpdateBy     access.UserID
}

func (s *Settings) Initialize() {
	if s == nil {
		return
	}

	// All new settings start as incomplete, requiring configuration,
	// such as setting the base currency, before they can be activated.
	s.State = SettingsStateIncomplete
}

func (s *Settings) Sanitize() {
	if s == nil {
		return
	}
	s.BaseCurrency = CurrencyCode(s.BaseCurrency.String())
}

func (s *Settings) Touch(actor access.Principal) {
	if s == nil {
		return
	}

	now := time.Now().UTC()
	if s.CreateTime.IsZero() {
		s.CreateBy = actor.ActorID()
		s.CreateTime = now
	}

	s.UpdateBy = actor.ActorID()
	s.UpdateTime = now
}

func (s *Settings) Validate() error {
	if s == nil {
		return nil
	}

	if err := id.Validate(s.SpaceID); err != nil {
		return err
	}

	if !s.State.IsValid() {
		return fmt.Errorf("invalid settings state: %s", s.State)
	}

	if err := s.BaseCurrency.Validate(); err != nil {
		return fmt.Errorf("invalid base currency: %w", err)
	}

	return nil
}

func (s *Settings) Update(update *Settings, mask *fieldmask.FieldMask) error {
	if s == nil {
		return errors.New("settings is nil")
	}

	if update == nil {
		return errors.New("update settings is nil")
	}

	if mask == nil {
		return errors.New("field mask is nil")
	}

	if err := SettingsUpdateSchema.Validate(mask); err != nil {
		return fmt.Errorf("validating field mask: %w", err)
	}

	if mask.Contains("state") {
		if s.State == SettingsStateIncomplete && update.State != SettingsStateIncomplete {
			// Incomplete can only be remove calling the activation process
			return fmt.Errorf("cannot change state from incomplete to %s", update.State)
		}

		if update.State == SettingsStateIncomplete {
			return fmt.Errorf("cannot set state to incomplete")
		}

		s.State = update.State
	}

	if mask.Contains("base_currency") {
		if s.State != SettingsStateIncomplete {
			return fmt.Errorf("cannot change base currency when settings are active or inactive")
		}

		s.BaseCurrency = update.BaseCurrency
	}

	return nil
}

type SettingsState string

const (
	SettingsStateActive     SettingsState = "active"     // Used when settings are fully configured and operational.
	SettingsStateInactive   SettingsState = "inactive"   // Used when settings are present but not currently active.
	SettingsStateIncomplete SettingsState = "incomplete" // Used when settings are partially configured and cannot be used yet.
)

func (s SettingsState) IsValid() bool {
	switch s {
	case SettingsStateActive, SettingsStateInactive, SettingsStateIncomplete:
		return true
	default:
		return false
	}
}

func (s *SettingsState) String() string {
	return string(*s)
}

type UpdateSettingsInput struct {
	Settings   *Settings
	UpdateMask *fieldmask.FieldMask
}

func (i *UpdateSettingsInput) Validate() error {
	if i.Settings == nil {
		return errors.New("settings is required")
	}

	if i.UpdateMask == nil {
		return errors.New("field mask is required")
	}

	return SettingsUpdateSchema.Validate(i.UpdateMask)
}
