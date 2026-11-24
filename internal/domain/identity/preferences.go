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

// Supported calendar view identifiers for Web and Mobile.
const (
	CalendarWebViewDay    = "day"
	CalendarWebViewWeek   = "week"
	CalendarWebViewMonth  = "month"
	CalendarWebViewAgenda = "agenda"

	CalendarMobileViewAgenda   = "agenda"
	CalendarMobileViewDay      = "day"
	CalendarMobileViewThreeDay = "three_day"
	CalendarMobileViewWeek     = "week"
	CalendarMobileViewMonth    = "month"
)

// RegionalUserPreferences stores user-scoped UI language and regional formatting preferences.
type RegionalUserPreferences struct {
	Locale       string `json:"locale"`
	HourCycle    string `json:"hour_cycle"`
	WeekStartsOn int    `json:"week_starts_on"`
}

// MailUserPreferences stores user-scoped mail reading and display preferences.
type MailUserPreferences struct {
	AutoLoadRemoteContent bool `json:"auto_load_remote_content"`
}

// CalendarUserPreferences stores user-scoped calendar view preferences per device form factor.
type CalendarUserPreferences struct {
	WebView    string `json:"web_view"`
	MobileView string `json:"mobile_view"`
}

// UserPreferences stores user-scoped UI language, regional formatting, mail, and calendar preferences.
type UserPreferences struct {
	Regional RegionalUserPreferences `json:"regional"`
	Mail     MailUserPreferences     `json:"mail"`
	Calendar CalendarUserPreferences `json:"calendar"`
}

// UserPreferencesKey is the typed descriptor for user-scoped regional and language preferences.
var UserPreferencesKey = settings.NewKey[UserPreferences](settings.ScopeUser, "preferences")

// DefaultUserPreferences returns the default regional, UI language, mail, and calendar preferences.
func DefaultUserPreferences() UserPreferences {
	return UserPreferences{
		Regional: RegionalUserPreferences{
			Locale:       "en-US",
			HourCycle:    HourCycle12,
			WeekStartsOn: 0,
		},
		Mail: MailUserPreferences{
			AutoLoadRemoteContent: false,
		},
		Calendar: CalendarUserPreferences{
			WebView:    CalendarWebViewWeek,
			MobileView: CalendarMobileViewAgenda,
		},
	}
}

// ApplyDefaults fills missing zero-valued sub-group fields from DefaultUserPreferences
// when an existing stored settings entry predates newly introduced preference groups.
func (p *UserPreferences) ApplyDefaults() {
	if p == nil {
		return
	}
	def := DefaultUserPreferences()
	if p.Regional.Locale == "" {
		p.Regional.Locale = def.Regional.Locale
	}
	if p.Regional.HourCycle == "" {
		p.Regional.HourCycle = def.Regional.HourCycle
	}
	if p.Calendar.WebView == "" {
		p.Calendar.WebView = def.Calendar.WebView
	}
	if p.Calendar.MobileView == "" {
		p.Calendar.MobileView = def.Calendar.MobileView
	}
}

// Validate checks the user preferences for valid BCP-47 locale, hour cycle, week start day, and calendar views.
func (p *UserPreferences) Validate() error {
	if p == nil {
		return errors.E(errors.Invalid, "user preferences payload is required")
	}
	if !isValidBCP47Tag(p.Regional.Locale) {
		return errors.E(errors.Invalid, "regional.locale must be a valid BCP-47 tag (e.g. en-US, es-ES)")
	}
	if p.Regional.HourCycle != HourCycle12 && p.Regional.HourCycle != HourCycle24 {
		return errors.E(errors.Invalid, "regional.hour_cycle must be 'h12' or 'h23'")
	}
	if p.Regional.WeekStartsOn != 0 && p.Regional.WeekStartsOn != 1 {
		return errors.E(errors.Invalid, "regional.week_starts_on must be 0 or 1")
	}
	switch p.Calendar.WebView {
	case CalendarWebViewDay, CalendarWebViewWeek, CalendarWebViewMonth, CalendarWebViewAgenda:
	default:
		return errors.E(errors.Invalid, "calendar.web_view must be 'day', 'week', 'month', or 'agenda'")
	}
	switch p.Calendar.MobileView {
	case CalendarMobileViewAgenda, CalendarMobileViewDay, CalendarMobileViewThreeDay, CalendarMobileViewWeek, CalendarMobileViewMonth:
	default:
		return errors.E(errors.Invalid, "calendar.mobile_view must be 'agenda', 'day', 'three_day', 'week', or 'month'")
	}
	return nil
}

var userPreferencesPatchSchema = patch.NewSchema[UserPreferences]().
	Field("regional", func(p *UserPreferences) *RegionalUserPreferences { return &p.Regional }).
	Field("regional.locale", func(p *UserPreferences) *string { return &p.Regional.Locale }).
	Field("regional.hour_cycle", func(p *UserPreferences) *string { return &p.Regional.HourCycle }).
	Field("regional.week_starts_on", func(p *UserPreferences) *int { return &p.Regional.WeekStartsOn }).
	Field("mail", func(p *UserPreferences) *MailUserPreferences { return &p.Mail }).
	Field("mail.auto_load_remote_content", func(p *UserPreferences) *bool { return &p.Mail.AutoLoadRemoteContent }).
	Field("calendar", func(p *UserPreferences) *CalendarUserPreferences { return &p.Calendar }).
	Field("calendar.web_view", func(p *UserPreferences) *string { return &p.Calendar.WebView }).
	Field("calendar.mobile_view", func(p *UserPreferences) *string { return &p.Calendar.MobileView })

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
