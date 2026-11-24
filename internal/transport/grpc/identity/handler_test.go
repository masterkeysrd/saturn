package identity

import (
	"context"
	"testing"

	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
	"github.com/masterkeysrd/saturn/internal/application/iam"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
)

type preferencesMockCoordinator struct {
	iam.Coordinator
	getPrefsFunc    func(ctx context.Context, userID identity.UserID) (*identity.UserPreferences, error)
	updatePrefsFunc func(ctx context.Context, req *iam.UpdateUserPreferencesRequest) (*identity.UserPreferences, error)
}

func (m *preferencesMockCoordinator) GetUserPreferences(ctx context.Context, userID identity.UserID) (*identity.UserPreferences, error) {
	return m.getPrefsFunc(ctx, userID)
}

func (m *preferencesMockCoordinator) UpdateUserPreferences(ctx context.Context, req *iam.UpdateUserPreferencesRequest) (*identity.UserPreferences, error) {
	return m.updatePrefsFunc(ctx, req)
}

func TestHandler_UserPreferences(t *testing.T) {
	authedCtx := auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1"})

	t.Run("GetUserPreferences", func(t *testing.T) {
		tests := []struct {
			name     string
			ctx      context.Context
			setup    func(*preferencesMockCoordinator)
			want     *identityv1.UserPreferences
			wantErr  bool
			wantKind errors.Kind
		}{
			{
				name:     "unauthenticated returns Unauthenticated",
				ctx:      context.Background(),
				wantErr:  true,
				wantKind: errors.Unauthenticated,
			},
			{
				name: "coordinator error propagated",
				ctx:  authedCtx,
				setup: func(m *preferencesMockCoordinator) {
					m.getPrefsFunc = func(_ context.Context, _ identity.UserID) (*identity.UserPreferences, error) {
						return nil, errors.E(errors.Internal, "failed")
					}
				},
				wantErr:  true,
				wantKind: errors.Internal,
			},
			{
				name: "success",
				ctx:  authedCtx,
				setup: func(m *preferencesMockCoordinator) {
					m.getPrefsFunc = func(_ context.Context, userID identity.UserID) (*identity.UserPreferences, error) {
						if userID != "usr_1" {
							t.Fatalf("unexpected userID %q", userID)
						}
						return &identity.UserPreferences{
							Regional: identity.RegionalUserPreferences{
								Locale:       "es-ES",
								HourCycle:    identity.HourCycle24,
								WeekStartsOn: 1,
							},
							Mail: identity.MailUserPreferences{AutoLoadRemoteContent: true},
							Calendar: identity.CalendarUserPreferences{
								WebView:    identity.CalendarWebViewMonth,
								MobileView: identity.CalendarMobileViewThreeDay,
							},
						}, nil
					}
				},
				want: &identityv1.UserPreferences{
					Regional: &identityv1.UserPreferences_Regional{
						Locale:       "es-ES",
						HourCycle:    "h23",
						WeekStartsOn: 1,
					},
					Mail: &identityv1.UserPreferences_Mail{AutoLoadRemoteContent: true},
					Calendar: &identityv1.UserPreferences_Calendar{
						WebView:    "month",
						MobileView: "three_day",
					},
				},
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				coord := &preferencesMockCoordinator{}
				if tc.setup != nil {
					tc.setup(coord)
				}
				h := NewHandler(NewIAMApplication(coord))
				got, err := h.GetUserPreferences(tc.ctx, &identityv1.GetUserPreferencesRequest{})
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
				if !proto.Equal(got, tc.want) {
					t.Fatalf("got %+v, want %+v", got, tc.want)
				}
			})
		}
	})

	t.Run("UpdateUserPreferences", func(t *testing.T) {
		tests := []struct {
			name     string
			ctx      context.Context
			req      *identityv1.UpdateUserPreferencesRequest
			setup    func(*preferencesMockCoordinator)
			want     *identityv1.UserPreferences
			wantErr  bool
			wantKind errors.Kind
		}{
			{
				name:     "unauthenticated returns Unauthenticated",
				ctx:      context.Background(),
				req:      &identityv1.UpdateUserPreferencesRequest{},
				wantErr:  true,
				wantKind: errors.Unauthenticated,
			},
			{
				name:     "nil user_preferences returns Invalid",
				ctx:      authedCtx,
				req:      &identityv1.UpdateUserPreferencesRequest{},
				wantErr:  true,
				wantKind: errors.Invalid,
			},
			{
				name: "coordinator error propagated",
				ctx:  authedCtx,
				req: &identityv1.UpdateUserPreferencesRequest{
					UserPreferences: &identityv1.UserPreferences{
						Regional: &identityv1.UserPreferences_Regional{Locale: "invalid"},
					},
					UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"regional.locale"}},
				},
				setup: func(m *preferencesMockCoordinator) {
					m.updatePrefsFunc = func(_ context.Context, _ *iam.UpdateUserPreferencesRequest) (*identity.UserPreferences, error) {
						return nil, errors.E(errors.Invalid, "bad locale")
					}
				},
				wantErr:  true,
				wantKind: errors.Invalid,
			},
			{
				name: "success round-trips all 3 groups",
				ctx:  authedCtx,
				req: &identityv1.UpdateUserPreferencesRequest{
					UserPreferences: &identityv1.UserPreferences{
						Regional: &identityv1.UserPreferences_Regional{
							Locale:       "es-419",
							HourCycle:    "h23",
							WeekStartsOn: 1,
						},
						Mail: &identityv1.UserPreferences_Mail{AutoLoadRemoteContent: true},
						Calendar: &identityv1.UserPreferences_Calendar{
							WebView:    "agenda",
							MobileView: "three_day",
						},
					},
					UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{
						"regional.locale",
						"regional.hour_cycle",
						"regional.week_starts_on",
						"mail.auto_load_remote_content",
						"calendar.web_view",
						"calendar.mobile_view",
					}},
				},
				setup: func(m *preferencesMockCoordinator) {
					m.updatePrefsFunc = func(_ context.Context, req *iam.UpdateUserPreferencesRequest) (*identity.UserPreferences, error) {
						if req.UserID != "usr_1" || len(req.UpdateMask) != 6 {
							t.Fatalf("unexpected request: %+v", req)
						}
						wantDomain := identity.UserPreferences{
							Regional: identity.RegionalUserPreferences{
								Locale:       "es-419",
								HourCycle:    identity.HourCycle24,
								WeekStartsOn: 1,
							},
							Mail: identity.MailUserPreferences{AutoLoadRemoteContent: true},
							Calendar: identity.CalendarUserPreferences{
								WebView:    identity.CalendarWebViewAgenda,
								MobileView: identity.CalendarMobileViewThreeDay,
							},
						}
						if req.Preferences != wantDomain {
							t.Fatalf("unexpected mapped preferences: got %+v, want %+v", req.Preferences, wantDomain)
						}
						return &req.Preferences, nil
					}
				},
				want: &identityv1.UserPreferences{
					Regional: &identityv1.UserPreferences_Regional{
						Locale:       "es-419",
						HourCycle:    "h23",
						WeekStartsOn: 1,
					},
					Mail: &identityv1.UserPreferences_Mail{AutoLoadRemoteContent: true},
					Calendar: &identityv1.UserPreferences_Calendar{
						WebView:    "agenda",
						MobileView: "three_day",
					},
				},
			},
			{
				name: "partial update with dotted paths for regional, mail, and calendar",
				ctx:  authedCtx,
				req: &identityv1.UpdateUserPreferencesRequest{
					UserPreferences: &identityv1.UserPreferences{
						Regional: &identityv1.UserPreferences_Regional{Locale: "es-DO"},
						Mail:     &identityv1.UserPreferences_Mail{AutoLoadRemoteContent: true},
						Calendar: &identityv1.UserPreferences_Calendar{
							WebView:    "day",
							MobileView: "month",
						},
					},
					UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{
						"regional.locale",
						"mail.auto_load_remote_content",
						"calendar.web_view",
						"calendar.mobile_view",
					}},
				},
				setup: func(m *preferencesMockCoordinator) {
					m.updatePrefsFunc = func(_ context.Context, req *iam.UpdateUserPreferencesRequest) (*identity.UserPreferences, error) {
						if req.UserID != "usr_1" || len(req.UpdateMask) != 4 {
							t.Fatalf("unexpected request: %+v", req)
						}
						return &identity.UserPreferences{
							Regional: identity.RegionalUserPreferences{
								Locale:       req.Preferences.Regional.Locale,
								HourCycle:    identity.HourCycle12,
								WeekStartsOn: 0,
							},
							Mail:     req.Preferences.Mail,
							Calendar: req.Preferences.Calendar,
						}, nil
					}
				},
				want: &identityv1.UserPreferences{
					Regional: &identityv1.UserPreferences_Regional{
						Locale:       "es-DO",
						HourCycle:    "h12",
						WeekStartsOn: 0,
					},
					Mail: &identityv1.UserPreferences_Mail{AutoLoadRemoteContent: true},
					Calendar: &identityv1.UserPreferences_Calendar{
						WebView:    "day",
						MobileView: "month",
					},
				},
			},
			{
				name: "group update for regional, mail, and calendar paths",
				ctx:  authedCtx,
				req: &identityv1.UpdateUserPreferencesRequest{
					UserPreferences: &identityv1.UserPreferences{
						Regional: &identityv1.UserPreferences_Regional{
							Locale:       "es-ES",
							HourCycle:    "h23",
							WeekStartsOn: 1,
						},
						Mail: &identityv1.UserPreferences_Mail{AutoLoadRemoteContent: true},
						Calendar: &identityv1.UserPreferences_Calendar{
							WebView:    "month",
							MobileView: "week",
						},
					},
					UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"regional", "mail", "calendar"}},
				},
				setup: func(m *preferencesMockCoordinator) {
					m.updatePrefsFunc = func(_ context.Context, req *iam.UpdateUserPreferencesRequest) (*identity.UserPreferences, error) {
						if req.UserID != "usr_1" || len(req.UpdateMask) != 3 {
							t.Fatalf("unexpected request: %+v", req)
						}
						return &req.Preferences, nil
					}
				},
				want: &identityv1.UserPreferences{
					Regional: &identityv1.UserPreferences_Regional{
						Locale:       "es-ES",
						HourCycle:    "h23",
						WeekStartsOn: 1,
					},
					Mail: &identityv1.UserPreferences_Mail{AutoLoadRemoteContent: true},
					Calendar: &identityv1.UserPreferences_Calendar{
						WebView:    "month",
						MobileView: "week",
					},
				},
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				coord := &preferencesMockCoordinator{}
				if tc.setup != nil {
					tc.setup(coord)
				}
				h := NewHandler(NewIAMApplication(coord))
				got, err := h.UpdateUserPreferences(tc.ctx, tc.req)
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
				if !proto.Equal(got, tc.want) {
					t.Fatalf("got %+v, want %+v", got, tc.want)
				}
			})
		}
	})
}
