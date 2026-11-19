package identity

import (
	"context"
	"strings"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
)

func TestUserPreferences_Validate(t *testing.T) {
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
			name:    "valid es-ES h23 monday",
			prefs:   &UserPreferences{Locale: "es-ES", HourCycle: HourCycle24, WeekStartsOn: 1},
			wantErr: false,
		},
		{
			name:    "valid es-419",
			prefs:   &UserPreferences{Locale: "es-419", HourCycle: HourCycle12, WeekStartsOn: 0},
			wantErr: false,
		},
		{
			name:    "valid two-letter language tag",
			prefs:   &UserPreferences{Locale: "es", HourCycle: HourCycle24, WeekStartsOn: 1},
			wantErr: false,
		},
		{
			name:    "valid three-letter language with script and region",
			prefs:   &UserPreferences{Locale: "ast-Latn-ES", HourCycle: HourCycle24, WeekStartsOn: 1},
			wantErr: false,
		},
		{
			name:     "nil preferences",
			prefs:    nil,
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name:     "empty locale",
			prefs:    &UserPreferences{Locale: "", HourCycle: HourCycle12, WeekStartsOn: 0},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name:     "single char locale",
			prefs:    &UserPreferences{Locale: "e", HourCycle: HourCycle12, WeekStartsOn: 0},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name:     "underscore in locale",
			prefs:    &UserPreferences{Locale: "en_US", HourCycle: HourCycle12, WeekStartsOn: 0},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name:     "trailing hyphen in locale",
			prefs:    &UserPreferences{Locale: "en-", HourCycle: HourCycle12, WeekStartsOn: 0},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name:     "numeric primary subtag",
			prefs:    &UserPreferences{Locale: "12-US", HourCycle: HourCycle12, WeekStartsOn: 0},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name:     "locale exceeds max length",
			prefs:    &UserPreferences{Locale: "en-" + strings.Repeat("a", 33), HourCycle: HourCycle12, WeekStartsOn: 0},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name:     "invalid hour_cycle",
			prefs:    &UserPreferences{Locale: "en-US", HourCycle: "h24", WeekStartsOn: 0},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name:     "empty hour_cycle",
			prefs:    &UserPreferences{Locale: "en-US", HourCycle: "", WeekStartsOn: 0},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name:     "negative week_starts_on",
			prefs:    &UserPreferences{Locale: "en-US", HourCycle: HourCycle12, WeekStartsOn: -1},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name:     "week_starts_on out of range",
			prefs:    &UserPreferences{Locale: "en-US", HourCycle: HourCycle12, WeekStartsOn: 2},
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
			name:     "patch locale only",
			initial:  DefaultUserPreferences(),
			incoming: &UserPreferences{Locale: "es-DO"},
			mask:     []string{"locale"},
			want:     UserPreferences{Locale: "es-DO", HourCycle: HourCycle12, WeekStartsOn: 0},
		},
		{
			name:     "patch hour_cycle and week_starts_on",
			initial:  DefaultUserPreferences(),
			incoming: &UserPreferences{HourCycle: HourCycle24, WeekStartsOn: 1},
			mask:     []string{"hour_cycle", "week_starts_on"},
			want:     UserPreferences{Locale: "en-US", HourCycle: HourCycle24, WeekStartsOn: 1},
		},
		{
			name:     "full replacement with empty mask",
			initial:  DefaultUserPreferences(),
			incoming: &UserPreferences{Locale: "es-ES", HourCycle: HourCycle24, WeekStartsOn: 1},
			mask:     nil,
			want:     UserPreferences{Locale: "es-ES", HourCycle: HourCycle24, WeekStartsOn: 1},
		},
		{
			name:     "nil incoming",
			initial:  DefaultUserPreferences(),
			incoming: nil,
			mask:     []string{"locale"},
			wantErr:  true,
		},
		{
			name:     "unsupported field mask path",
			initial:  DefaultUserPreferences(),
			incoming: &UserPreferences{Locale: "es-ES"},
			mask:     []string{"unknown_field"},
			wantErr:  true,
		},
		{
			name:     "invalid locale rejected",
			initial:  DefaultUserPreferences(),
			incoming: &UserPreferences{Locale: "bad_locale"},
			mask:     []string{"locale"},
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
				name:   "returns stored entry and fills empty defaults",
				userID: userID,
				setup: func(m *UserPreferencesClientMock) {
					m.GetOrDefaultFunc = func(_ context.Context, scopeID string, _ UserPreferences) (*settings.Entry[UserPreferences], error) {
						return &settings.Entry[UserPreferences]{
							Target:  UserPreferencesKey.For(scopeID),
							Value:   UserPreferences{Locale: "es-ES", WeekStartsOn: 1},
							Version: 2,
						}, nil
					}
				},
				want: UserPreferences{Locale: "es-ES", HourCycle: HourCycle12, WeekStartsOn: 1},
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
				name:   "partial patch updates locale while preserving existing fields",
				userID: userID,
				req: UpdateUserPreferencesRequest{
					Preferences: UserPreferences{Locale: "es-419"},
					Paths:       []string{"locale"},
				},
				setup: func(m *UserPreferencesClientMock) {
					m.GetOrDefaultFunc = func(_ context.Context, scopeID string, _ UserPreferences) (*settings.Entry[UserPreferences], error) {
						return &settings.Entry[UserPreferences]{
							Target:  UserPreferencesKey.For(scopeID),
							Value:   UserPreferences{Locale: "en-US", HourCycle: HourCycle24, WeekStartsOn: 1},
							Version: 1,
						}, nil
					}
					m.SaveFunc = func(_ context.Context, entry *settings.Entry[UserPreferences]) error {
						entry.Version++
						return nil
					}
				},
				want: UserPreferences{Locale: "es-419", HourCycle: HourCycle24, WeekStartsOn: 1},
			},
			{
				name:   "full replacement when paths empty",
				userID: userID,
				req: UpdateUserPreferencesRequest{
					Preferences: UserPreferences{Locale: "es-DO", HourCycle: HourCycle12, WeekStartsOn: 0},
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
				want: UserPreferences{Locale: "es-DO", HourCycle: HourCycle12, WeekStartsOn: 0},
			},
			{
				name:   "invalid preferences rejected before save",
				userID: userID,
				req: UpdateUserPreferencesRequest{
					Preferences: UserPreferences{HourCycle: "invalid"},
					Paths:       []string{"hour_cycle"},
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
					Preferences: UserPreferences{Locale: "es-ES"},
					Paths:       []string{"locale"},
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
