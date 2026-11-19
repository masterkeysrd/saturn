package identity

import (
	"context"
	"strings"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
)

// UserPreferencesClient defines settings operations for user-scoped preferences.
//
// @Mock
type UserPreferencesClient interface {
	Get(ctx context.Context, scopeID string) (*settings.Entry[UserPreferences], error)
	GetOrDefault(ctx context.Context, scopeID string, fallback UserPreferences) (*settings.Entry[UserPreferences], error)
	Save(ctx context.Context, entry *settings.Entry[UserPreferences]) error
}

// Supported clock hour cycle identifiers.
const (
	HourCycle12 = "h12"
	HourCycle24 = "h23"
)

// UserPreferences stores user-scoped UI language and regional formatting preferences.
type UserPreferences struct {
	Locale       string `json:"locale"`
	HourCycle    string `json:"hour_cycle"`
	WeekStartsOn int    `json:"week_starts_on"`
}

// UserPreferencesKey is the typed descriptor for user-scoped regional and language preferences.
var UserPreferencesKey = settings.NewKey[UserPreferences](settings.ScopeUser, "preferences")

// DefaultUserPreferences returns the default regional and UI language preferences.
func DefaultUserPreferences() UserPreferences {
	return UserPreferences{
		Locale:       "en-US",
		HourCycle:    HourCycle12,
		WeekStartsOn: 0,
	}
}

// Validate checks the user preferences for valid BCP-47 locale, hour cycle, and week start day.
func (p *UserPreferences) Validate() error {
	if p == nil {
		return errors.E(errors.Invalid, "user preferences payload is required")
	}
	if !isValidBCP47Tag(p.Locale) {
		return errors.E(errors.Invalid, "locale must be a valid BCP-47 tag (e.g. en-US, es-ES)")
	}
	if p.HourCycle != HourCycle12 && p.HourCycle != HourCycle24 {
		return errors.E(errors.Invalid, "hour_cycle must be 'h12' or 'h23'")
	}
	if p.WeekStartsOn != 0 && p.WeekStartsOn != 1 {
		return errors.E(errors.Invalid, "week_starts_on must be 0 or 1")
	}
	return nil
}

var userPreferencesPatchSchema = patch.NewSchema[UserPreferences]().
	Field("locale", func(p *UserPreferences) *string { return &p.Locale }).
	Field("hour_cycle", func(p *UserPreferences) *string { return &p.HourCycle }).
	Field("week_starts_on", func(p *UserPreferences) *int { return &p.WeekStartsOn })

// ApplyPatch applies partial updates from incoming preferences based on the field mask.
func (p *UserPreferences) ApplyPatch(incoming *UserPreferences, mask []string) error {
	if incoming == nil {
		return errors.E(errors.Invalid, "user preferences payload is required")
	}
	if err := userPreferencesPatchSchema.Apply(p, incoming, mask); err != nil {
		return errors.E(errors.Invalid, err)
	}
	return p.Validate()
}

// UpdateUserPreferencesRequest holds incoming preferences and optional field mask paths.
type UpdateUserPreferencesRequest struct {
	Preferences UserPreferences
	Paths       []string
}

func isValidBCP47Tag(tag string) bool {
	if len(tag) < 2 || len(tag) > 35 {
		return false
	}
	parts := strings.Split(tag, "-")
	lang := parts[0]
	if len(lang) < 2 || len(lang) > 3 {
		return false
	}
	for i := range len(lang) {
		if !isASCIIAlpha(lang[i]) {
			return false
		}
	}
	for _, subtag := range parts[1:] {
		if len(subtag) < 1 || len(subtag) > 8 {
			return false
		}
		for i := range len(subtag) {
			if !isASCIIAlphaNum(subtag[i]) {
				return false
			}
		}
	}
	return true
}

func isASCIIAlpha(b byte) bool {
	return (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z')
}

func isASCIIAlphaNum(b byte) bool {
	return isASCIIAlpha(b) || (b >= '0' && b <= '9')
}
