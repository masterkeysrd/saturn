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

func TestSettings_Validate(t *testing.T) {
	t.Run("valid timezone", func(t *testing.T) {
		s := &space.Settings{Timezone: "America/Santo_Domingo"}
		require.NoError(t, s.Validate())
	})

	t.Run("empty timezone is valid (defaults to UTC)", func(t *testing.T) {
		s := &space.Settings{Timezone: ""}
		require.NoError(t, s.Validate())
	})

	t.Run("invalid timezone", func(t *testing.T) {
		s := &space.Settings{Timezone: "Invalid/Timezone_Name"}
		err := s.Validate()
		require.Error(t, err)
		assert.True(t, errors.Is(err, errors.Invalid))
	})

	t.Run("nil settings", func(t *testing.T) {
		var s *space.Settings
		require.Error(t, s.Validate())
	})
}

func TestSettings_ApplyPatch(t *testing.T) {
	s := &space.Settings{Timezone: "UTC"}
	incoming := &space.Settings{Timezone: "America/New_York"}

	err := s.ApplyPatch(incoming, []string{"timezone"})
	require.NoError(t, err)
	assert.Equal(t, "America/New_York", s.Timezone)

	// Unsupported field
	err = s.ApplyPatch(incoming, []string{"unknown_field"})
	require.Error(t, err)
}

func TestService_Settings(t *testing.T) {
	ctx := context.Background()
	spaceID := space.SpaceID("spc_01H7B6K5Z8A3QW9J4C2N6P0Y1R")
	ownerID := space.SpaceID("usr_01H7B6K5Z8A3QW9J4C2N6P0Y1R")
	memberID := space.SpaceID("usr_01H7B6K5Z8A3QW9J4C2N6P0Y2M")
	nonMemberID := space.SpaceID("usr_01H7B6K5Z8A3QW9J4C2N6P0Y3N")

	var currentSettings *settings.Entry[space.Settings]

	members := map[string]*space.Member{
		string(ownerID): {
			SpaceID: spaceID,
			UserID:  ownerID,
			Role:    space.RoleOwner,
		},
		string(memberID): {
			SpaceID: spaceID,
			UserID:  memberID,
			Role:    space.RoleMember,
		},
	}

	memberMock := &space.MemberStoreMock{
		GetByIDFunc: func(ctx context.Context, sID space.SpaceID, uID space.SpaceID) (*space.Member, error) {
			if m, ok := members[string(uID)]; ok && sID == spaceID {
				return m, nil
			}
			return nil, errors.E(errors.NotExist, "not found")
		},
	}

	settingsMock := &space.SettingsClientMock{
		GetOrDefaultFunc: func(ctx context.Context, scopeID string, fallback space.Settings) (*settings.Entry[space.Settings], error) {
			if currentSettings != nil {
				return currentSettings, nil
			}
			return &settings.Entry[space.Settings]{
				Target:  space.SettingsKey.For(scopeID),
				Value:   fallback,
				Version: 0,
			}, nil
		},
		SaveFunc: func(ctx context.Context, entry *settings.Entry[space.Settings]) error {
			if entry.Version == 0 && currentSettings != nil {
				return errors.E(errors.Conflict, "already exists")
			}
			if entry.Version > 0 && (currentSettings == nil || currentSettings.Version != entry.Version) {
				return errors.E(errors.Conflict, "version mismatch")
			}
			entry.Version++
			entryCopy := *entry
			currentSettings = &entryCopy
			return nil
		},
	}

	svc := space.NewService(space.Dependencies{
		SpaceStore:  &space.SpaceStoreMock{},
		MemberStore: memberMock,
		Settings:    settingsMock,
	})

	t.Run("GetSettings default for member", func(t *testing.T) {
		session := space.Session{SpaceID: spaceID, UserID: memberID}
		entry, err := svc.GetSettings(ctx, session)
		require.NoError(t, err)
		assert.Equal(t, "UTC", entry.Value.Timezone)
		assert.Equal(t, int64(0), entry.Version)
	})

	t.Run("GetSettings fails for non-member", func(t *testing.T) {
		session := space.Session{SpaceID: spaceID, UserID: nonMemberID}
		_, err := svc.GetSettings(ctx, session)
		require.Error(t, err)
		assert.True(t, errors.Is(err, errors.Permission))
	})

	t.Run("UpdateSettings fails for regular member", func(t *testing.T) {
		session := space.Session{SpaceID: spaceID, UserID: memberID}
		incoming := &space.Settings{Timezone: "America/Santo_Domingo"}
		_, err := svc.UpdateSettings(ctx, session, incoming, []string{"timezone"}, nil)
		require.Error(t, err)
		assert.True(t, errors.Is(err, errors.Permission))
	})

	t.Run("UpdateSettings succeeds for owner", func(t *testing.T) {
		session := space.Session{SpaceID: spaceID, UserID: ownerID}
		incoming := &space.Settings{Timezone: "America/Santo_Domingo"}
		entry, err := svc.UpdateSettings(ctx, session, incoming, []string{"timezone"}, nil)
		require.NoError(t, err)
		assert.Equal(t, "America/Santo_Domingo", entry.Value.Timezone)
		assert.Equal(t, int64(1), entry.Version)

		// Verify GetSettings returns newly saved settings
		memberSession := space.Session{SpaceID: spaceID, UserID: memberID}
		refetched, err := svc.GetSettings(ctx, memberSession)
		require.NoError(t, err)
		assert.Equal(t, "America/Santo_Domingo", refetched.Value.Timezone)
		assert.Equal(t, int64(1), refetched.Version)
	})

	t.Run("UpdateSettings OCC conflict", func(t *testing.T) {
		session := space.Session{SpaceID: spaceID, UserID: ownerID}
		incoming := &space.Settings{Timezone: "UTC"}
		staleVersion := int64(99)
		_, err := svc.UpdateSettings(ctx, session, incoming, []string{"timezone"}, &staleVersion)
		require.Error(t, err)
		assert.True(t, errors.Is(err, errors.Conflict))
	})

	t.Run("UpdateSettings invalid timezone fails", func(t *testing.T) {
		session := space.Session{SpaceID: spaceID, UserID: ownerID}
		incoming := &space.Settings{Timezone: "Invalid_TZ"}
		_, err := svc.UpdateSettings(ctx, session, incoming, []string{"timezone"}, nil)
		require.Error(t, err)
		assert.True(t, errors.Is(err, errors.Invalid))
	})
}
