package space_test

import (
	"context"
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDashboardPreferences_Validate(t *testing.T) {
	tests := []struct {
		name     string
		prefs    *space.DashboardPreferences
		wantErr  bool
		wantKind errors.Kind
	}{
		{
			name:    "default preferences are valid",
			prefs:   new(space.DefaultDashboardPreferences()),
			wantErr: false,
		},
		{
			name: "all canonical widgets are valid",
			prefs: &space.DashboardPreferences{
				Widgets: []string{
					space.WidgetAIQuickAsk,
					space.WidgetNetWorth,
					space.WidgetBudgetPace,
					space.WidgetUpcomingBills,
					space.WidgetTodaySchedule,
					space.WidgetPriorityMail,
					space.WidgetWorkflowRuns,
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
			name:     "empty widgets slice",
			prefs:    &space.DashboardPreferences{Widgets: []string{}},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name:     "unsupported widget ID",
			prefs:    &space.DashboardPreferences{Widgets: []string{"net_worth", "unknown_widget"}},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name:     "legacy triage widget ID is rejected",
			prefs:    &space.DashboardPreferences{Widgets: []string{"triage", "net_worth"}},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
		{
			name:     "duplicate widget ID",
			prefs:    &space.DashboardPreferences{Widgets: []string{"budget_pace", "net_worth", "budget_pace"}},
			wantErr:  true,
			wantKind: errors.Invalid,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.prefs.Validate()
			if tc.wantErr {
				require.Error(t, err)
				assert.Equal(t, tc.wantKind, errors.KindOf(err))
				return
			}
			require.NoError(t, err)
		})
	}
}

func TestDashboardPreferences_ApplyPatch(t *testing.T) {
	tests := []struct {
		name     string
		initial  space.DashboardPreferences
		incoming *space.DashboardPreferences
		mask     []string
		want     []string
		wantErr  bool
	}{
		{
			name:     "patch widgets with explicit mask",
			initial:  space.DefaultDashboardPreferences(),
			incoming: &space.DashboardPreferences{Widgets: []string{"net_worth", "budget_pace"}},
			mask:     []string{"widgets"},
			want:     []string{"net_worth", "budget_pace"},
			wantErr:  false,
		},
		{
			name:     "patch widgets with empty mask (full update)",
			initial:  space.DefaultDashboardPreferences(),
			incoming: &space.DashboardPreferences{Widgets: []string{"workflow_runs"}},
			mask:     nil,
			want:     []string{"workflow_runs"},
			wantErr:  false,
		},
		{
			name:     "nil incoming payload",
			initial:  space.DefaultDashboardPreferences(),
			incoming: nil,
			mask:     []string{"widgets"},
			wantErr:  true,
		},
		{
			name:     "unsupported field in mask",
			initial:  space.DefaultDashboardPreferences(),
			incoming: &space.DashboardPreferences{Widgets: []string{"net_worth"}},
			mask:     []string{"unknown_field"},
			wantErr:  true,
		},
		{
			name:     "invalid widget in patch",
			initial:  space.DefaultDashboardPreferences(),
			incoming: &space.DashboardPreferences{Widgets: []string{"bogus"}},
			mask:     []string{"widgets"},
			wantErr:  true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			target := tc.initial
			err := target.ApplyPatch(tc.incoming, tc.mask)
			if tc.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.want, target.Widgets)
		})
	}
}

func TestService_DashboardPreferences(t *testing.T) {
	ctx := context.Background()
	spaceID := space.SpaceID("spc_01H7B6K5Z8A3QW9J4C2N6P0Y1R")
	otherSpaceID := space.SpaceID("spc_01H7B6K5Z8A3QW9J4C2N6P0Y9Z")
	ownerID := space.UserID("usr_01H7B6K5Z8A3QW9J4C2N6P0Y1R")
	adminID := space.UserID("usr_01H7B6K5Z8A3QW9J4C2N6P0Y2A")
	memberID := space.UserID("usr_01H7B6K5Z8A3QW9J4C2N6P0Y3M")
	viewerID := space.UserID("usr_01H7B6K5Z8A3QW9J4C2N6P0Y4V")
	nonMemberID := space.UserID("usr_01H7B6K5Z8A3QW9J4C2N6P0Y5N")

	members := map[string]*space.Member{
		string(spaceID) + ":" + string(ownerID):      {SpaceID: spaceID, UserID: ownerID, Role: space.RoleOwner},
		string(spaceID) + ":" + string(adminID):      {SpaceID: spaceID, UserID: adminID, Role: space.RoleAdmin},
		string(spaceID) + ":" + string(memberID):     {SpaceID: spaceID, UserID: memberID, Role: space.RoleMember},
		string(spaceID) + ":" + string(viewerID):     {SpaceID: spaceID, UserID: viewerID, Role: space.RoleViewer},
		string(otherSpaceID) + ":" + string(ownerID): {SpaceID: otherSpaceID, UserID: ownerID, Role: space.RoleOwner},
	}

	stored := make(map[string]*settings.Entry[space.DashboardPreferences])

	memberMock := &space.MemberStoreMock{
		GetByIDFunc: func(ctx context.Context, sID space.SpaceID, uID space.UserID) (*space.Member, error) {
			if m, ok := members[string(sID)+":"+string(uID)]; ok {
				return m, nil
			}
			return nil, errors.E(errors.NotExist, "not found")
		},
	}

	prefsMock := &space.DashboardPreferencesClientMock{
		GetOrDefaultFunc: func(ctx context.Context, scopeID string, fallback space.DashboardPreferences) (*settings.Entry[space.DashboardPreferences], error) {
			if existing, ok := stored[scopeID]; ok {
				cp := *existing
				cp.Value.Widgets = append([]string(nil), existing.Value.Widgets...)
				return &cp, nil
			}
			return &settings.Entry[space.DashboardPreferences]{
				Target:  space.DashboardPreferencesKey.For(scopeID),
				Value:   fallback,
				Version: 0,
			}, nil
		},
		SaveFunc: func(ctx context.Context, entry *settings.Entry[space.DashboardPreferences]) error {
			scopeID := entry.Target.ScopeID()
			existing := stored[scopeID]
			if entry.Version == 0 && existing != nil {
				return errors.E(errors.Conflict, "already exists")
			}
			if entry.Version > 0 && (existing == nil || existing.Version != entry.Version) {
				return errors.E(errors.Conflict, "version mismatch")
			}
			entry.Version++
			cp := *entry
			cp.Value.Widgets = append([]string(nil), entry.Value.Widgets...)
			stored[scopeID] = &cp
			return nil
		},
	}

	svc := space.NewService(space.Dependencies{
		SpaceStore:           &space.SpaceStoreMock{},
		MemberStore:          memberMock,
		Settings:             &space.SettingsClientMock{},
		DashboardPreferences: prefsMock,
	})

	t.Run("GetDashboardPreferences returns defaults for every role", func(t *testing.T) {
		roles := []struct {
			name   string
			userID space.UserID
		}{
			{name: "owner", userID: ownerID},
			{name: "admin", userID: adminID},
			{name: "member", userID: memberID},
			{name: "viewer", userID: viewerID},
		}

		for _, r := range roles {
			t.Run(r.name, func(t *testing.T) {
				entry, err := svc.GetDashboardPreferences(ctx, space.Session{SpaceID: spaceID, UserID: r.userID})
				require.NoError(t, err)
				assert.Equal(t, space.DefaultDashboardPreferences().Widgets, entry.Value.Widgets)
				assert.Equal(t, int64(0), entry.Version)
			})
		}
	})

	t.Run("GetDashboardPreferences validation and auth errors", func(t *testing.T) {
		tests := []struct {
			name     string
			session  space.Session
			wantKind errors.Kind
		}{
			{
				name:     "missing space_id",
				session:  space.Session{UserID: ownerID},
				wantKind: errors.Invalid,
			},
			{
				name:     "missing user_id",
				session:  space.Session{SpaceID: spaceID},
				wantKind: errors.Invalid,
			},
			{
				name:     "non-member denied",
				session:  space.Session{SpaceID: spaceID, UserID: nonMemberID},
				wantKind: errors.Permission,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				_, err := svc.GetDashboardPreferences(ctx, tc.session)
				require.Error(t, err)
				assert.Equal(t, tc.wantKind, errors.KindOf(err))
			})
		}
	})

	t.Run("UpdateDashboardPreferences succeeds for viewer and isolates per user and space", func(t *testing.T) {
		viewerSession := space.Session{SpaceID: spaceID, UserID: viewerID}
		updated, err := svc.UpdateDashboardPreferences(
			ctx,
			viewerSession,
			&space.DashboardPreferences{Widgets: []string{"budget_pace", "net_worth"}},
			[]string{"widgets"},
			nil,
		)
		require.NoError(t, err)
		assert.Equal(t, []string{"budget_pace", "net_worth"}, updated.Value.Widgets)
		assert.Equal(t, int64(1), updated.Version)

		// Viewer refetch returns persisted widgets
		refetched, err := svc.GetDashboardPreferences(ctx, viewerSession)
		require.NoError(t, err)
		assert.Equal(t, []string{"budget_pace", "net_worth"}, refetched.Value.Widgets)
		assert.Equal(t, int64(1), refetched.Version)

		// Owner in same space still gets defaults (per-user isolation)
		ownerEntry, err := svc.GetDashboardPreferences(ctx, space.Session{SpaceID: spaceID, UserID: ownerID})
		require.NoError(t, err)
		assert.Equal(t, space.DefaultDashboardPreferences().Widgets, ownerEntry.Value.Widgets)
		assert.Equal(t, int64(0), ownerEntry.Version)

		// Owner updates in spaceID, otherSpaceID remains untouched (per-space isolation)
		_, err = svc.UpdateDashboardPreferences(
			ctx,
			space.Session{SpaceID: spaceID, UserID: ownerID},
			&space.DashboardPreferences{Widgets: []string{"workflow_runs"}},
			[]string{"widgets"},
			nil,
		)
		require.NoError(t, err)

		otherSpaceEntry, err := svc.GetDashboardPreferences(ctx, space.Session{SpaceID: otherSpaceID, UserID: ownerID})
		require.NoError(t, err)
		assert.Equal(t, space.DefaultDashboardPreferences().Widgets, otherSpaceEntry.Value.Widgets)
	})

	t.Run("UpdateDashboardPreferences errors", func(t *testing.T) {
		tests := []struct {
			name            string
			session         space.Session
			incoming        *space.DashboardPreferences
			mask            []string
			expectedVersion *int64
			wantKind        errors.Kind
		}{
			{
				name:     "missing space_id",
				session:  space.Session{UserID: ownerID},
				incoming: &space.DashboardPreferences{Widgets: []string{"net_worth"}},
				mask:     []string{"widgets"},
				wantKind: errors.Invalid,
			},
			{
				name:     "missing user_id",
				session:  space.Session{SpaceID: spaceID},
				incoming: &space.DashboardPreferences{Widgets: []string{"net_worth"}},
				mask:     []string{"widgets"},
				wantKind: errors.Invalid,
			},
			{
				name:     "non-member denied",
				session:  space.Session{SpaceID: spaceID, UserID: nonMemberID},
				incoming: &space.DashboardPreferences{Widgets: []string{"net_worth"}},
				mask:     []string{"widgets"},
				wantKind: errors.Permission,
			},
			{
				name:            "OCC version conflict",
				session:         space.Session{SpaceID: spaceID, UserID: viewerID},
				incoming:        &space.DashboardPreferences{Widgets: []string{"net_worth"}},
				mask:            []string{"widgets"},
				expectedVersion: new(int64(99)),
				wantKind:        errors.Conflict,
			},
			{
				name:     "invalid widget rejected",
				session:  space.Session{SpaceID: spaceID, UserID: viewerID},
				incoming: &space.DashboardPreferences{Widgets: []string{"invalid_widget"}},
				mask:     []string{"widgets"},
				wantKind: errors.Invalid,
			},
			{
				name:     "empty widgets rejected",
				session:  space.Session{SpaceID: spaceID, UserID: viewerID},
				incoming: &space.DashboardPreferences{Widgets: []string{}},
				mask:     []string{"widgets"},
				wantKind: errors.Invalid,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				_, err := svc.UpdateDashboardPreferences(ctx, tc.session, tc.incoming, tc.mask, tc.expectedVersion)
				require.Error(t, err)
				assert.Equal(t, tc.wantKind, errors.KindOf(err))
			})
		}
	})
}
