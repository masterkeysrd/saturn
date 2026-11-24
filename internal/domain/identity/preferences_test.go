package identity

import (
	"context"
	"strings"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
)

func TestUserPreferences_Defaults(t *testing.T) {
	want := UserPreferences{
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
	if got := DefaultUserPreferences(); got != want {
		t.Fatalf("DefaultUserPreferences() = %+v, want %+v", got, want)
	}
}

func TestUserPreferences_Validate(t *testing.T) {
	validRegional := RegionalUserPreferences{Locale: "en-US", HourCycle: HourCycle12, WeekStartsOn: 0}
	validCalendar := CalendarUserPreferences{WebView: CalendarWebViewWeek, MobileView: CalendarMobileViewAgenda}

	tests := []struct {
		name     string
		prefs    *UserPreferences
		wantErr  bool
		wantKind errors.Kind
	}{
		{
			name:    "default preferences are valid",
			prefs:   new(DefaultUserPreferences()),
			wantErr: false,
		},
		{
			name: "valid es-ES h23 monday",
			prefs: &UserPreferences{
				Regional: RegionalUserPreferences{Locale: "es-ES", HourCycle: HourCycle24, WeekStartsOn: 1},
				Calendar: validCalendar,
			},
			wantErr: false,
		},
		{
			name: "valid es-419",
			prefs: &UserPreferences{
				Regional: RegionalUserPreferences{Locale: "es-419", HourCycle: HourCycle12, WeekStartsOn: 0},
				Calendar: validCalendar,
			},
			wantErr: false,
		},
		{
			name: "valid two-letter language tag",
			prefs: &UserPreferences{
				Regional: RegionalUserPreferences{Locale: "es", HourCycle: HourCycle24, WeekStartsOn: 1},
				Calendar: validCalendar,
			},
			wantErr: false,
		},
		{
			name: "valid three-letter language with script and region",
			prefs: &UserPreferences{
				Regional: RegionalUserPreferences{Locale: "ast-Latn-ES", HourCycle: HourCycle24, WeekStartsOn: 1},
				Calendar: validCalendar,
			},
			wantErr: false,
		},
		{
			name: "valid calendar web day and mobile three_day with mail auto load",
			prefs: &UserPreferences{
				Regional: validRegional,
				Mail:     MailUserPreferences{AutoLoadRemoteContent: true},
				Calendar: CalendarUserPreferences{
					WebView:    CalendarWebViewDay,
					MobileView: CalendarMobileViewThreeDay,
				},
			},
			wantErr: false,
		},
		{
			name: "valid calendar web month and mobile week",
			prefs: &UserPreferences{
				Regional: validRegional,
				Calendar: CalendarUserPreferences{
					WebView:    CalendarWebViewMonth,
					MobileView: CalendarMobileViewWeek,
				},
			},
			wantErr: false,
		},
		{
			name: "valid calendar web agenda and mobile month",
			prefs: &UserPreferences{
				Regional: validRegional,
				Calendar: CalendarUserPreferences{
					WebView:    CalendarWebViewAgenda,
					MobileView: CalendarMobileViewMonth,
				},
			},
			wantErr: false,
		},
		{
			name: "valid calendar mobile day",
			prefs: &UserPreferences{
				Regional: validRegional,
				Calendar: CalendarUserPreferences{
					WebView:    CalendarWebViewWeek,
					MobileView: CalendarMobileViewDay,
				},
			},
			wantErr: false,
		},
		{
			name:     "nil preferences",
			prefs:    nil,
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name: "empty regional.locale",
			prefs: &UserPreferences{
				Regional: RegionalUserPreferences{Locale: "", HourCycle: HourCycle12, WeekStartsOn: 0},
				Calendar: validCalendar,
			},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name: "single char regional.locale",
			prefs: &UserPreferences{
				Regional: RegionalUserPreferences{Locale: "e", HourCycle: HourCycle12, WeekStartsOn: 0},
				Calendar: validCalendar,
			},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name: "underscore in regional.locale",
			prefs: &UserPreferences{
				Regional: RegionalUserPreferences{Locale: "en_US", HourCycle: HourCycle12, WeekStartsOn: 0},
				Calendar: validCalendar,
			},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name: "trailing hyphen in regional.locale",
			prefs: &UserPreferences{
				Regional: RegionalUserPreferences{Locale: "en-", HourCycle: HourCycle12, WeekStartsOn: 0},
				Calendar: validCalendar,
			},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name: "numeric primary subtag in regional.locale",
			prefs: &UserPreferences{
				Regional: RegionalUserPreferences{Locale: "12-US", HourCycle: HourCycle12, WeekStartsOn: 0},
				Calendar: validCalendar,
			},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name: "regional.locale exceeds max length",
			prefs: &UserPreferences{
				Regional: RegionalUserPreferences{Locale: "en-" + strings.Repeat("a", 33), HourCycle: HourCycle12, WeekStartsOn: 0},
				Calendar: validCalendar,
			},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name: "invalid regional.hour_cycle",
			prefs: &UserPreferences{
				Regional: RegionalUserPreferences{Locale: "en-US", HourCycle: "h24", WeekStartsOn: 0},
				Calendar: validCalendar,
			},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name: "empty regional.hour_cycle",
			prefs: &UserPreferences{
				Regional: RegionalUserPreferences{Locale: "en-US", HourCycle: "", WeekStartsOn: 0},
				Calendar: validCalendar,
			},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name: "negative regional.week_starts_on",
			prefs: &UserPreferences{
				Regional: RegionalUserPreferences{Locale: "en-US", HourCycle: HourCycle12, WeekStartsOn: -1},
				Calendar: validCalendar,
			},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name: "regional.week_starts_on out of range",
			prefs: &UserPreferences{
				Regional: RegionalUserPreferences{Locale: "en-US", HourCycle: HourCycle12, WeekStartsOn: 2},
				Calendar: validCalendar,
			},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name: "empty calendar.web_view rejected",
			prefs: &UserPreferences{
				Regional: validRegional,
				Calendar: CalendarUserPreferences{WebView: "", MobileView: CalendarMobileViewAgenda},
			},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name: "invalid calendar.web_view three_day",
			prefs: &UserPreferences{
				Regional: validRegional,
				Calendar: CalendarUserPreferences{WebView: "three_day", MobileView: CalendarMobileViewAgenda},
			},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name: "invalid calendar.web_view arbitrary",
			prefs: &UserPreferences{
				Regional: validRegional,
				Calendar: CalendarUserPreferences{WebView: "year", MobileView: CalendarMobileViewAgenda},
			},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name: "empty calendar.mobile_view rejected",
			prefs: &UserPreferences{
				Regional: validRegional,
				Calendar: CalendarUserPreferences{WebView: CalendarWebViewWeek, MobileView: ""},
			},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name: "invalid calendar.mobile_view arbitrary",
			prefs: &UserPreferences{
				Regional: validRegional,
				Calendar: CalendarUserPreferences{WebView: CalendarWebViewWeek, MobileView: "two_day"},
			},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.prefs.Validate()
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if errors.KindOf(err) != tc.wantKind {
					t.Fatalf("expected kind %v, got %v (%v)", tc.wantKind, errors.KindOf(err), err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestUserPreferences_ApplyPatch(t *testing.T) {
	tests := []struct {
		name     string
		initial  UserPreferences
		incoming *UserPreferences
		mask     []string
		want     UserPreferences
		wantErr  bool
	}{
		{
			name:     "patch regional.locale only",
			initial:  DefaultUserPreferences(),
			incoming: &UserPreferences{Regional: RegionalUserPreferences{Locale: "es-DO"}},
			mask:     []string{"regional.locale"},
			want: UserPreferences{
				Regional: RegionalUserPreferences{Locale: "es-DO", HourCycle: HourCycle12, WeekStartsOn: 0},
				Calendar: CalendarUserPreferences{WebView: CalendarWebViewWeek, MobileView: CalendarMobileViewAgenda},
			},
		},
		{
			name:     "patch regional.hour_cycle and regional.week_starts_on",
			initial:  DefaultUserPreferences(),
			incoming: &UserPreferences{Regional: RegionalUserPreferences{HourCycle: HourCycle24, WeekStartsOn: 1}},
			mask:     []string{"regional.hour_cycle", "regional.week_starts_on"},
			want: UserPreferences{
				Regional: RegionalUserPreferences{Locale: "en-US", HourCycle: HourCycle24, WeekStartsOn: 1},
				Calendar: CalendarUserPreferences{WebView: CalendarWebViewWeek, MobileView: CalendarMobileViewAgenda},
			},
		},
		{
			name:     "patch regional group",
			initial:  DefaultUserPreferences(),
			incoming: &UserPreferences{Regional: RegionalUserPreferences{Locale: "es-ES", HourCycle: HourCycle24, WeekStartsOn: 1}},
			mask:     []string{"regional"},
			want: UserPreferences{
				Regional: RegionalUserPreferences{Locale: "es-ES", HourCycle: HourCycle24, WeekStartsOn: 1},
				Calendar: CalendarUserPreferences{WebView: CalendarWebViewWeek, MobileView: CalendarMobileViewAgenda},
			},
		},
		{
			name:     "patch mail.auto_load_remote_content to true",
			initial:  DefaultUserPreferences(),
			incoming: &UserPreferences{Mail: MailUserPreferences{AutoLoadRemoteContent: true}},
			mask:     []string{"mail.auto_load_remote_content"},
			want: UserPreferences{
				Regional: RegionalUserPreferences{Locale: "en-US", HourCycle: HourCycle12, WeekStartsOn: 0},
				Mail:     MailUserPreferences{AutoLoadRemoteContent: true},
				Calendar: CalendarUserPreferences{WebView: CalendarWebViewWeek, MobileView: CalendarMobileViewAgenda},
			},
		},
		{
			name: "patch mail group toggles auto_load_remote_content back to false",
			initial: UserPreferences{
				Regional: RegionalUserPreferences{Locale: "en-US", HourCycle: HourCycle12, WeekStartsOn: 0},
				Mail:     MailUserPreferences{AutoLoadRemoteContent: true},
				Calendar: CalendarUserPreferences{WebView: CalendarWebViewMonth, MobileView: CalendarMobileViewThreeDay},
			},
			incoming: &UserPreferences{Mail: MailUserPreferences{AutoLoadRemoteContent: false}},
			mask:     []string{"mail"},
			want: UserPreferences{
				Regional: RegionalUserPreferences{Locale: "en-US", HourCycle: HourCycle12, WeekStartsOn: 0},
				Mail:     MailUserPreferences{AutoLoadRemoteContent: false},
				Calendar: CalendarUserPreferences{WebView: CalendarWebViewMonth, MobileView: CalendarMobileViewThreeDay},
			},
		},
		{
			name:     "patch calendar.web_view only",
			initial:  DefaultUserPreferences(),
			incoming: &UserPreferences{Calendar: CalendarUserPreferences{WebView: CalendarWebViewMonth}},
			mask:     []string{"calendar.web_view"},
			want: UserPreferences{
				Regional: RegionalUserPreferences{Locale: "en-US", HourCycle: HourCycle12, WeekStartsOn: 0},
				Calendar: CalendarUserPreferences{WebView: CalendarWebViewMonth, MobileView: CalendarMobileViewAgenda},
			},
		},
		{
			name:     "patch calendar.mobile_view only",
			initial:  DefaultUserPreferences(),
			incoming: &UserPreferences{Calendar: CalendarUserPreferences{MobileView: CalendarMobileViewThreeDay}},
			mask:     []string{"calendar.mobile_view"},
			want: UserPreferences{
				Regional: RegionalUserPreferences{Locale: "en-US", HourCycle: HourCycle12, WeekStartsOn: 0},
				Calendar: CalendarUserPreferences{WebView: CalendarWebViewWeek, MobileView: CalendarMobileViewThreeDay},
			},
		},
		{
			name:    "patch calendar group updates both web_view and mobile_view",
			initial: DefaultUserPreferences(),
			incoming: &UserPreferences{
				Calendar: CalendarUserPreferences{
					WebView:    CalendarWebViewAgenda,
					MobileView: CalendarMobileViewMonth,
				},
			},
			mask: []string{"calendar"},
			want: UserPreferences{
				Regional: RegionalUserPreferences{Locale: "en-US", HourCycle: HourCycle12, WeekStartsOn: 0},
				Calendar: CalendarUserPreferences{
					WebView:    CalendarWebViewAgenda,
					MobileView: CalendarMobileViewMonth,
				},
			},
		},
		{
			name:    "full replacement with empty mask",
			initial: DefaultUserPreferences(),
			incoming: &UserPreferences{
				Regional: RegionalUserPreferences{Locale: "es-ES", HourCycle: HourCycle24, WeekStartsOn: 1},
				Mail:     MailUserPreferences{AutoLoadRemoteContent: true},
				Calendar: CalendarUserPreferences{
					WebView:    CalendarWebViewAgenda,
					MobileView: CalendarMobileViewMonth,
				},
			},
			mask: nil,
			want: UserPreferences{
				Regional: RegionalUserPreferences{Locale: "es-ES", HourCycle: HourCycle24, WeekStartsOn: 1},
				Mail:     MailUserPreferences{AutoLoadRemoteContent: true},
				Calendar: CalendarUserPreferences{
					WebView:    CalendarWebViewAgenda,
					MobileView: CalendarMobileViewMonth,
				},
			},
		},
		{
			name:     "nil incoming",
			initial:  DefaultUserPreferences(),
			incoming: nil,
			mask:     []string{"regional.locale"},
			wantErr:  true,
		},
		{
			name:     "unsupported flat field mask path rejected",
			initial:  DefaultUserPreferences(),
			incoming: &UserPreferences{Regional: RegionalUserPreferences{Locale: "es-ES"}},
			mask:     []string{"locale"},
			wantErr:  true,
		},
		{
			name:     "unsupported unknown field mask path rejected",
			initial:  DefaultUserPreferences(),
			incoming: &UserPreferences{Regional: RegionalUserPreferences{Locale: "es-ES"}},
			mask:     []string{"unknown_field"},
			wantErr:  true,
		},
		{
			name:     "invalid regional.locale rejected",
			initial:  DefaultUserPreferences(),
			incoming: &UserPreferences{Regional: RegionalUserPreferences{Locale: "bad_locale"}},
			mask:     []string{"regional.locale"},
			wantErr:  true,
		},
		{
			name:     "invalid calendar.web_view rejected",
			initial:  DefaultUserPreferences(),
			incoming: &UserPreferences{Calendar: CalendarUserPreferences{WebView: "three_day"}},
			mask:     []string{"calendar.web_view"},
			wantErr:  true,
		},
		{
			name:     "calendar group with empty mobile_view rejected",
			initial:  DefaultUserPreferences(),
			incoming: &UserPreferences{Calendar: CalendarUserPreferences{WebView: CalendarWebViewDay}},
			mask:     []string{"calendar"},
			wantErr:  true,
		},
		{
			name:     "invalid calendar.mobile_view rejected via calendar group mask",
			initial:  DefaultUserPreferences(),
			incoming: &UserPreferences{Calendar: CalendarUserPreferences{WebView: CalendarWebViewWeek, MobileView: "year"}},
			mask:     []string{"calendar"},
			wantErr:  true,
		},
		{
			name:     "invalid calendar.mobile_view rejected",
			initial:  DefaultUserPreferences(),
			incoming: &UserPreferences{Calendar: CalendarUserPreferences{MobileView: "year"}},
			mask:     []string{"calendar.mobile_view"},
			wantErr:  true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			target := tc.initial
			err := target.ApplyPatch(tc.incoming, tc.mask)
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if target != tc.want {
				t.Fatalf("got %+v, want %+v", target, tc.want)
			}
		})
	}
}

func TestService_UserPreferences(t *testing.T) {
	ctx := context.Background()
	userID := UserID("usr_01H7B6K5Z8A3QW9J4C2N6P0Y1R")

	t.Run("GetUserPreferences", func(t *testing.T) {
		tests := []struct {
			name     string
			userID   UserID
			setup    func(*UserPreferencesClientMock)
			want     UserPreferences
			wantErr  bool
			wantKind errors.Kind
		}{
			{
				name:     "empty user id",
				userID:   "",
				wantErr:  true,
				wantKind: errors.Invalid,
			},
			{
				name:   "returns defaults when unset",
				userID: userID,
				setup: func(m *UserPreferencesClientMock) {
					m.GetOrDefaultFunc = func(_ context.Context, scopeID string, fallback UserPreferences) (*settings.Entry[UserPreferences], error) {
						return &settings.Entry[UserPreferences]{
							Target: UserPreferencesKey.For(scopeID),
							Value:  fallback,
						}, nil
					}
				},
				want: DefaultUserPreferences(),
			},
			{
				name:   "returns stored entry with grouped preferences preserved",
				userID: userID,
				setup: func(m *UserPreferencesClientMock) {
					m.GetOrDefaultFunc = func(_ context.Context, scopeID string, _ UserPreferences) (*settings.Entry[UserPreferences], error) {
						return &settings.Entry[UserPreferences]{
							Target: UserPreferencesKey.For(scopeID),
							Value: UserPreferences{
								Regional: RegionalUserPreferences{Locale: "es-419", HourCycle: HourCycle24, WeekStartsOn: 1},
								Mail:     MailUserPreferences{AutoLoadRemoteContent: true},
								Calendar: CalendarUserPreferences{
									WebView:    CalendarWebViewMonth,
									MobileView: CalendarMobileViewThreeDay,
								},
							},
							Version: 3,
						}, nil
					}
				},
				want: UserPreferences{
					Regional: RegionalUserPreferences{Locale: "es-419", HourCycle: HourCycle24, WeekStartsOn: 1},
					Mail:     MailUserPreferences{AutoLoadRemoteContent: true},
					Calendar: CalendarUserPreferences{
						WebView:    CalendarWebViewMonth,
						MobileView: CalendarMobileViewThreeDay,
					},
				},
			},
			{
				name:   "propagates client error",
				userID: userID,
				setup: func(m *UserPreferencesClientMock) {
					m.GetOrDefaultFunc = func(_ context.Context, _ string, _ UserPreferences) (*settings.Entry[UserPreferences], error) {
						return nil, errors.E(errors.Internal, "db unavailable")
					}
				},
				wantErr:  true,
				wantKind: errors.Internal,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				prefsMock := &UserPreferencesClientMock{}
				if tc.setup != nil {
					tc.setup(prefsMock)
				}
				svc := NewService(Dependencies{Preferences: prefsMock})
				got, err := svc.GetUserPreferences(ctx, tc.userID)
				if tc.wantErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if errors.KindOf(err) != tc.wantKind {
						t.Fatalf("expected kind %v, got %v", tc.wantKind, errors.KindOf(err))
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if *got != tc.want {
					t.Fatalf("got %+v, want %+v", *got, tc.want)
				}
			})
		}
	})

	t.Run("UpdateUserPreferences", func(t *testing.T) {
		tests := []struct {
			name     string
			userID   UserID
			req      UpdateUserPreferencesRequest
			setup    func(*UserPreferencesClientMock)
			want     UserPreferences
			wantErr  bool
			wantKind errors.Kind
		}{
			{
				name:     "empty user id",
				userID:   "",
				req:      UpdateUserPreferencesRequest{Preferences: DefaultUserPreferences()},
				wantErr:  true,
				wantKind: errors.Invalid,
			},
			{
				name:   "partial patch updates regional.locale while preserving existing fields",
				userID: userID,
				req: UpdateUserPreferencesRequest{
					Preferences: UserPreferences{Regional: RegionalUserPreferences{Locale: "es-419"}},
					Paths:       []string{"regional.locale"},
				},
				setup: func(m *UserPreferencesClientMock) {
					m.GetOrDefaultFunc = func(_ context.Context, scopeID string, _ UserPreferences) (*settings.Entry[UserPreferences], error) {
						return &settings.Entry[UserPreferences]{
							Target: UserPreferencesKey.For(scopeID),
							Value: UserPreferences{
								Regional: RegionalUserPreferences{Locale: "en-US", HourCycle: HourCycle24, WeekStartsOn: 1},
								Calendar: CalendarUserPreferences{WebView: CalendarWebViewWeek, MobileView: CalendarMobileViewAgenda},
							},
							Version: 1,
						}, nil
					}
					m.SaveFunc = func(_ context.Context, entry *settings.Entry[UserPreferences]) error {
						entry.Version++
						return nil
					}
				},
				want: UserPreferences{
					Regional: RegionalUserPreferences{Locale: "es-419", HourCycle: HourCycle24, WeekStartsOn: 1},
					Calendar: CalendarUserPreferences{WebView: CalendarWebViewWeek, MobileView: CalendarMobileViewAgenda},
				},
			},
			{
				name:   "group patch updates regional group",
				userID: userID,
				req: UpdateUserPreferencesRequest{
					Preferences: UserPreferences{Regional: RegionalUserPreferences{Locale: "es-ES", HourCycle: HourCycle24, WeekStartsOn: 1}},
					Paths:       []string{"regional"},
				},
				setup: func(m *UserPreferencesClientMock) {
					m.GetOrDefaultFunc = func(_ context.Context, scopeID string, fallback UserPreferences) (*settings.Entry[UserPreferences], error) {
						return &settings.Entry[UserPreferences]{
							Target: UserPreferencesKey.For(scopeID),
							Value:  fallback,
						}, nil
					}
					m.SaveFunc = func(_ context.Context, _ *settings.Entry[UserPreferences]) error {
						return nil
					}
				},
				want: UserPreferences{
					Regional: RegionalUserPreferences{Locale: "es-ES", HourCycle: HourCycle24, WeekStartsOn: 1},
					Calendar: CalendarUserPreferences{WebView: CalendarWebViewWeek, MobileView: CalendarMobileViewAgenda},
				},
			},
			{
				name:   "partial patch updates mail.auto_load_remote_content",
				userID: userID,
				req: UpdateUserPreferencesRequest{
					Preferences: UserPreferences{Mail: MailUserPreferences{AutoLoadRemoteContent: true}},
					Paths:       []string{"mail.auto_load_remote_content"},
				},
				setup: func(m *UserPreferencesClientMock) {
					m.GetOrDefaultFunc = func(_ context.Context, scopeID string, fallback UserPreferences) (*settings.Entry[UserPreferences], error) {
						return &settings.Entry[UserPreferences]{
							Target: UserPreferencesKey.For(scopeID),
							Value:  fallback,
						}, nil
					}
					m.SaveFunc = func(_ context.Context, entry *settings.Entry[UserPreferences]) error {
						entry.Version++
						return nil
					}
				},
				want: UserPreferences{
					Regional: RegionalUserPreferences{Locale: "en-US", HourCycle: HourCycle12, WeekStartsOn: 0},
					Mail:     MailUserPreferences{AutoLoadRemoteContent: true},
					Calendar: CalendarUserPreferences{WebView: CalendarWebViewWeek, MobileView: CalendarMobileViewAgenda},
				},
			},
			{
				name:   "group patch updates mail",
				userID: userID,
				req: UpdateUserPreferencesRequest{
					Preferences: UserPreferences{Mail: MailUserPreferences{AutoLoadRemoteContent: true}},
					Paths:       []string{"mail"},
				},
				setup: func(m *UserPreferencesClientMock) {
					m.GetOrDefaultFunc = func(_ context.Context, scopeID string, fallback UserPreferences) (*settings.Entry[UserPreferences], error) {
						return &settings.Entry[UserPreferences]{
							Target: UserPreferencesKey.For(scopeID),
							Value:  fallback,
						}, nil
					}
					m.SaveFunc = func(_ context.Context, _ *settings.Entry[UserPreferences]) error {
						return nil
					}
				},
				want: UserPreferences{
					Regional: RegionalUserPreferences{Locale: "en-US", HourCycle: HourCycle12, WeekStartsOn: 0},
					Mail:     MailUserPreferences{AutoLoadRemoteContent: true},
					Calendar: CalendarUserPreferences{WebView: CalendarWebViewWeek, MobileView: CalendarMobileViewAgenda},
				},
			},
			{
				name:   "partial patch updates calendar.web_view only",
				userID: userID,
				req: UpdateUserPreferencesRequest{
					Preferences: UserPreferences{Calendar: CalendarUserPreferences{WebView: CalendarWebViewAgenda}},
					Paths:       []string{"calendar.web_view"},
				},
				setup: func(m *UserPreferencesClientMock) {
					m.GetOrDefaultFunc = func(_ context.Context, scopeID string, fallback UserPreferences) (*settings.Entry[UserPreferences], error) {
						return &settings.Entry[UserPreferences]{
							Target: UserPreferencesKey.For(scopeID),
							Value:  fallback,
						}, nil
					}
					m.SaveFunc = func(_ context.Context, _ *settings.Entry[UserPreferences]) error {
						return nil
					}
				},
				want: UserPreferences{
					Regional: RegionalUserPreferences{Locale: "en-US", HourCycle: HourCycle12, WeekStartsOn: 0},
					Calendar: CalendarUserPreferences{WebView: CalendarWebViewAgenda, MobileView: CalendarMobileViewAgenda},
				},
			},
			{
				name:   "partial patch updates calendar.mobile_view only",
				userID: userID,
				req: UpdateUserPreferencesRequest{
					Preferences: UserPreferences{Calendar: CalendarUserPreferences{MobileView: CalendarMobileViewThreeDay}},
					Paths:       []string{"calendar.mobile_view"},
				},
				setup: func(m *UserPreferencesClientMock) {
					m.GetOrDefaultFunc = func(_ context.Context, scopeID string, fallback UserPreferences) (*settings.Entry[UserPreferences], error) {
						return &settings.Entry[UserPreferences]{
							Target: UserPreferencesKey.For(scopeID),
							Value:  fallback,
						}, nil
					}
					m.SaveFunc = func(_ context.Context, _ *settings.Entry[UserPreferences]) error {
						return nil
					}
				},
				want: UserPreferences{
					Regional: RegionalUserPreferences{Locale: "en-US", HourCycle: HourCycle12, WeekStartsOn: 0},
					Calendar: CalendarUserPreferences{WebView: CalendarWebViewWeek, MobileView: CalendarMobileViewThreeDay},
				},
			},
			{
				name:   "group patch updates calendar group",
				userID: userID,
				req: UpdateUserPreferencesRequest{
					Preferences: UserPreferences{Calendar: CalendarUserPreferences{WebView: CalendarWebViewDay, MobileView: CalendarMobileViewMonth}},
					Paths:       []string{"calendar"},
				},
				setup: func(m *UserPreferencesClientMock) {
					m.GetOrDefaultFunc = func(_ context.Context, scopeID string, fallback UserPreferences) (*settings.Entry[UserPreferences], error) {
						return &settings.Entry[UserPreferences]{
							Target: UserPreferencesKey.For(scopeID),
							Value:  fallback,
						}, nil
					}
					m.SaveFunc = func(_ context.Context, _ *settings.Entry[UserPreferences]) error {
						return nil
					}
				},
				want: UserPreferences{
					Regional: RegionalUserPreferences{Locale: "en-US", HourCycle: HourCycle12, WeekStartsOn: 0},
					Calendar: CalendarUserPreferences{WebView: CalendarWebViewDay, MobileView: CalendarMobileViewMonth},
				},
			},
			{
				name:   "full replacement when paths empty",
				userID: userID,
				req: UpdateUserPreferencesRequest{
					Preferences: UserPreferences{
						Regional: RegionalUserPreferences{Locale: "es-DO", HourCycle: HourCycle12, WeekStartsOn: 0},
						Mail:     MailUserPreferences{AutoLoadRemoteContent: true},
						Calendar: CalendarUserPreferences{WebView: CalendarWebViewMonth, MobileView: CalendarMobileViewDay},
					},
				},
				setup: func(m *UserPreferencesClientMock) {
					m.GetOrDefaultFunc = func(_ context.Context, scopeID string, fallback UserPreferences) (*settings.Entry[UserPreferences], error) {
						return &settings.Entry[UserPreferences]{
							Target: UserPreferencesKey.For(scopeID),
							Value:  fallback,
						}, nil
					}
					m.SaveFunc = func(_ context.Context, _ *settings.Entry[UserPreferences]) error {
						return nil
					}
				},
				want: UserPreferences{
					Regional: RegionalUserPreferences{Locale: "es-DO", HourCycle: HourCycle12, WeekStartsOn: 0},
					Mail:     MailUserPreferences{AutoLoadRemoteContent: true},
					Calendar: CalendarUserPreferences{WebView: CalendarWebViewMonth, MobileView: CalendarMobileViewDay},
				},
			},
			{
				name:   "invalid preferences rejected before save",
				userID: userID,
				req: UpdateUserPreferencesRequest{
					Preferences: UserPreferences{Regional: RegionalUserPreferences{HourCycle: "invalid"}},
					Paths:       []string{"regional.hour_cycle"},
				},
				setup: func(m *UserPreferencesClientMock) {
					m.GetOrDefaultFunc = func(_ context.Context, scopeID string, fallback UserPreferences) (*settings.Entry[UserPreferences], error) {
						return &settings.Entry[UserPreferences]{
							Target: UserPreferencesKey.For(scopeID),
							Value:  fallback,
						}, nil
					}
				},
				wantErr:  true,
				wantKind: errors.Invalid,
			},
			{
				name:   "invalid calendar.web_view rejected before save",
				userID: userID,
				req: UpdateUserPreferencesRequest{
					Preferences: UserPreferences{Calendar: CalendarUserPreferences{WebView: "three_day"}},
					Paths:       []string{"calendar.web_view"},
				},
				setup: func(m *UserPreferencesClientMock) {
					m.GetOrDefaultFunc = func(_ context.Context, scopeID string, fallback UserPreferences) (*settings.Entry[UserPreferences], error) {
						return &settings.Entry[UserPreferences]{
							Target: UserPreferencesKey.For(scopeID),
							Value:  fallback,
						}, nil
					}
				},
				wantErr:  true,
				wantKind: errors.Invalid,
			},
			{
				name:   "invalid calendar.mobile_view rejected before save",
				userID: userID,
				req: UpdateUserPreferencesRequest{
					Preferences: UserPreferences{Calendar: CalendarUserPreferences{MobileView: "invalid_view"}},
					Paths:       []string{"calendar.mobile_view"},
				},
				setup: func(m *UserPreferencesClientMock) {
					m.GetOrDefaultFunc = func(_ context.Context, scopeID string, fallback UserPreferences) (*settings.Entry[UserPreferences], error) {
						return &settings.Entry[UserPreferences]{
							Target: UserPreferencesKey.For(scopeID),
							Value:  fallback,
						}, nil
					}
				},
				wantErr:  true,
				wantKind: errors.Invalid,
			},
			{
				name:   "save error propagated",
				userID: userID,
				req: UpdateUserPreferencesRequest{
					Preferences: UserPreferences{Regional: RegionalUserPreferences{Locale: "es-ES"}},
					Paths:       []string{"regional.locale"},
				},
				setup: func(m *UserPreferencesClientMock) {
					m.GetOrDefaultFunc = func(_ context.Context, scopeID string, fallback UserPreferences) (*settings.Entry[UserPreferences], error) {
						return &settings.Entry[UserPreferences]{
							Target: UserPreferencesKey.For(scopeID),
							Value:  fallback,
						}, nil
					}
					m.SaveFunc = func(_ context.Context, _ *settings.Entry[UserPreferences]) error {
						return errors.E(errors.Conflict, "version mismatch")
					}
				},
				wantErr:  true,
				wantKind: errors.Conflict,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				prefsMock := &UserPreferencesClientMock{}
				if tc.setup != nil {
					tc.setup(prefsMock)
				}
				svc := NewService(Dependencies{Preferences: prefsMock})
				got, err := svc.UpdateUserPreferences(ctx, tc.userID, tc.req)
				if tc.wantErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if errors.KindOf(err) != tc.wantKind {
						t.Fatalf("expected kind %v, got %v", tc.wantKind, errors.KindOf(err))
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if *got != tc.want {
					t.Fatalf("got %+v, want %+v", *got, tc.want)
				}
			})
		}
	})
}
