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
	Get(context.Context, space.ID) (*Setting, error)
	Store(context.Context, *Setting) error
}

var SettingUpdateSchema = fieldmask.NewSchema("Settings").
	Field("state",
		fieldmask.WithDescription("State of the settings."),
	).
	Field("base_currency_code",
		fieldmask.WithDescription("Base currency code for the space."),
	).
	Build()

type Setting struct {
	SpaceID          space.ID
	Status           SettingsStatus
	BaseCurrencyCode CurrencyCode
	CreateTime       time.Time
	CreateBy         access.UserID
	UpdateTime       time.Time
	UpdateBy         access.UserID
}

func (s *Setting) Initialize() {
	if s == nil {
		return
	}

	// All new settings start as incomplete, requiring configuration,
	// such as setting the base currency, before they can be activated.
	s.Status = SettingStatusIncomplete
}

func (s *Setting) Sanitize() {
	if s == nil {
		return
	}
	s.BaseCurrencyCode = CurrencyCode(s.BaseCurrencyCode.String())
}

func (s *Setting) Touch(actor access.Principal) {
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

func (s *Setting) Validate() error {
	if s == nil {
		return nil
	}

	if err := id.Validate(s.SpaceID); err != nil {
		return err
	}

	if !s.Status.IsValid() {
		return fmt.Errorf("invalid settings state: %s", s.Status)
	}

	if err := s.BaseCurrencyCode.Validate(); err != nil {
		return fmt.Errorf("invalid base currency: %w", err)
	}

	return nil
}

func (s *Setting) Update(update *Setting, mask *fieldmask.FieldMask) error {
	if s == nil {
		return errors.New("settings is nil")
	}

	if update == nil {
		return errors.New("update settings is nil")
	}

	if mask == nil {
		return errors.New("field mask is nil")
	}

	if err := SettingUpdateSchema.Validate(mask); err != nil {
		return fmt.Errorf("validating field mask: %w", err)
	}

	if mask.Contains("state") {
		if s.Status == SettingStatusIncomplete && update.Status != SettingStatusIncomplete {
			// Incomplete can only be remove calling the activation process
			return fmt.Errorf("cannot change state from incomplete to %s", update.Status)
		}

		if update.Status == SettingStatusIncomplete {
			return fmt.Errorf("cannot set state to incomplete")
		}

		s.Status = update.Status
	}

	if mask.Contains("base_currency_code") {
		if s.Status != SettingStatusIncomplete {
			return fmt.Errorf("cannot change base currency when settings are active or inactive")
		}

		s.BaseCurrencyCode = update.BaseCurrencyCode
	}

	return nil
}

type SettingsStatus string

const (
	SettingStatusActive     SettingsStatus = "active"     // Used when settings are fully configured and operational.
	SettingStatusDisabled   SettingsStatus = "disabled"   // Used when settings are intentionally turned off.
	SettingStatusIncomplete SettingsStatus = "incomplete" // Used when settings are partially configured and cannot be used yet.
)

func (s SettingsStatus) IsValid() bool {
	switch s {
	case SettingStatusActive, SettingStatusDisabled, SettingStatusIncomplete:
		return true
	default:
		return false
	}
}

func (s *SettingsStatus) String() string {
	return string(*s)
}

type UpdateSettingInput struct {
	Setting    *Setting
	UpdateMask *fieldmask.FieldMask
}

func (i *UpdateSettingInput) Validate() error {
	if i.Setting == nil {
		return errors.New("settings is required")
	}

	if i.UpdateMask == nil {
		return errors.New("field mask is required")
	}

	return SettingUpdateSchema.Validate(i.UpdateMask)
}
