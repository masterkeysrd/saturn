//go:build integration

package integration_test

import (
	"context"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/crypto"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/migrations"
	"github.com/masterkeysrd/saturn/tests/driver"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConnectorMigrationUpDown(t *testing.T) {
	d := driver.New(t, testEnv)
	ctx := context.Background()

	// 1. Verify 051 tables exist currently
	var exists bool
	err := d.Env().DB.GetContext(ctx, &exists, `
		SELECT EXISTS (
			SELECT FROM information_schema.tables 
			WHERE table_schema = 'platform' AND table_name = 'connected_accounts'
		)
	`)
	require.NoError(t, err)
	assert.True(t, exists, "platform.connected_accounts must exist initially")

	// 2. Roll back migration 051
	err = migrations.DownTo(d.Env().DB.DB, 50)
	require.NoError(t, err, "migration down must succeed")

	// Verify table dropped
	err = d.Env().DB.GetContext(ctx, &exists, `
		SELECT EXISTS (
			SELECT FROM information_schema.tables 
			WHERE table_schema = 'platform' AND table_name = 'connected_accounts'
		)
	`)
	require.NoError(t, err)
	assert.False(t, exists, "platform.connected_accounts must be dropped after migration down")

	// 3. Migrate back up to 051
	err = migrations.Migrate(d.Env().DB.DB)
	require.NoError(t, err, "migration up must succeed")

	err = d.Env().DB.GetContext(ctx, &exists, `
		SELECT EXISTS (
			SELECT FROM information_schema.tables 
			WHERE table_schema = 'platform' AND table_name = 'connected_accounts'
		)
	`)
	require.NoError(t, err)
	assert.True(t, exists, "platform.connected_accounts must exist after migrating up")
}

func TestConnectorStore_UniqueSpaceProviderAccount(t *testing.T) {
	d := driver.New(t, testEnv)
	ctx := context.Background()

	d.Auth().CreateApprovedUser(t).Login(t)
	d.Space().Ensure(t, "Space Alpha")
	spaceA := d.State().SpaceID
	userID := d.State().UserID

	spaceBResp, err := d.Space().CreateSpace(t, "Space Beta", "")
	require.NoError(t, err)
	spaceB := spaceBResp.GetId()

	cipher, err := crypto.NewCipher("test-master-encryption-key-32b!!")
	require.NoError(t, err)

	encAccess, _ := cipher.Encrypt("access-token-1")
	encRefresh, _ := cipher.Encrypt("refresh-token-1")

	store := connector.NewStore(db.New(d.Env().DB))

	acc1 := &connector.ConnectedAccount{
		SpaceID:             spaceA,
		CreatedByUserID:     userID,
		Provider:            "google",
		ProviderAccountID:   "user_google_12345",
		Email:               "user@gmail.com",
		AccessTokenEnc:      encAccess,
		RefreshTokenEnc:     encRefresh,
		TokenExpiry:         time.Now().Add(1 * time.Hour),
		GrantedScopes:       []string{"openid", "email"},
		EnabledCapabilities: []string{"calendar"},
		Status:              connector.AccountStatusHealthy,
	}

	// 1. First insert in Space A succeeds
	err = store.CreateAccount(ctx, acc1)
	require.NoError(t, err)
	assert.NotEmpty(t, acc1.ID)

	// 2. Duplicate insert in Space A fails due to UNIQUE (space_id, provider, provider_account_id)
	accDuplicate := &connector.ConnectedAccount{
		SpaceID:             spaceA,
		CreatedByUserID:     userID,
		Provider:            "google",
		ProviderAccountID:   "user_google_12345",
		Email:               "user@gmail.com",
		AccessTokenEnc:      encAccess,
		RefreshTokenEnc:     encRefresh,
		TokenExpiry:         time.Now().Add(1 * time.Hour),
		GrantedScopes:       []string{"openid", "email"},
		EnabledCapabilities: []string{"calendar"},
		Status:              connector.AccountStatusHealthy,
	}
	err = store.CreateAccount(ctx, accDuplicate)
	require.Error(t, err, "expected unique constraint error for duplicate provider account in same space")

	// 3. Insert in Space B for the same provider identity succeeds independently
	accSpaceB := &connector.ConnectedAccount{
		SpaceID:             spaceB,
		CreatedByUserID:     userID,
		Provider:            "google",
		ProviderAccountID:   "user_google_12345",
		Email:               "user@gmail.com",
		AccessTokenEnc:      encAccess,
		RefreshTokenEnc:     encRefresh,
		TokenExpiry:         time.Now().Add(1 * time.Hour),
		GrantedScopes:       []string{"openid", "email"},
		EnabledCapabilities: []string{"calendar"},
		Status:              connector.AccountStatusHealthy,
	}
	err = store.CreateAccount(ctx, accSpaceB)
	require.NoError(t, err, "connecting same external provider identity in different space must succeed")
	assert.NotEqual(t, acc1.ID, accSpaceB.ID)
}

func TestConnectorStore_SpaceOnDeleteCascade(t *testing.T) {
	d := driver.New(t, testEnv)
	ctx := context.Background()

	d.Auth().CreateApprovedUser(t).Login(t)
	d.Space().Ensure(t, "Space Cascade Test")
	spaceID := d.State().SpaceID
	userID := d.State().UserID

	cipher, err := crypto.NewCipher("test-master-encryption-key-32b!!")
	require.NoError(t, err)

	encAccess, _ := cipher.Encrypt("access-token-casc")
	encRefresh, _ := cipher.Encrypt("refresh-token-casc")
	encVerifier, _ := cipher.Encrypt("pkce-verifier-casc")

	store := connector.NewStore(db.New(d.Env().DB))

	account := &connector.ConnectedAccount{
		SpaceID:             spaceID,
		CreatedByUserID:     userID,
		Provider:            "google",
		ProviderAccountID:   "google_casc_user",
		Email:               "casc@example.com",
		AccessTokenEnc:      encAccess,
		RefreshTokenEnc:     encRefresh,
		TokenExpiry:         time.Now().Add(1 * time.Hour),
		GrantedScopes:       []string{"openid"},
		EnabledCapabilities: []string{"contacts"},
		Status:              connector.AccountStatusHealthy,
	}
	err = store.CreateAccount(ctx, account)
	require.NoError(t, err)

	// Add contact
	email := "friend@example.com"
	name := "Friend Name"
	err = store.UpsertContacts(ctx, []*connector.AccountContact{
		{
			SpaceID:            spaceID,
			ConnectedAccountID: account.ID,
			ProviderContactID:  "contact_123",
			Email:              &email,
			DisplayName:        &name,
		},
	})
	require.NoError(t, err)

	// Add OAuth state
	oauthState := &connector.OAuthState{
		StateHash:          connector.HashState("raw_state_for_cascade_test"),
		SpaceID:            spaceID,
		UserID:             userID,
		Provider:           "google",
		Capabilities:       []string{"contacts"},
		ConnectedAccountID: &account.ID,
		CodeVerifierEnc:    encVerifier,
		ReturnURL:          "/settings",
		ExpiresAt:          time.Now().Add(10 * time.Minute),
	}
	err = store.CreateOAuthState(ctx, oauthState)
	require.NoError(t, err)

	// Delete space
	_, err = d.Env().DB.ExecContext(ctx, `DELETE FROM space.space WHERE id = $1`, spaceID)
	require.NoError(t, err)

	// Verify connected account cascaded
	fetchedAcc, err := store.GetAccount(ctx, spaceID, account.ID)
	require.NoError(t, err)
	assert.Nil(t, fetchedAcc, "account should be deleted on space cascade")

	// Verify contacts cascaded
	contacts, err := store.ListContacts(ctx, spaceID, account.ID)
	require.NoError(t, err)
	assert.Empty(t, contacts, "contacts should be deleted on space cascade")

	// Verify oauth state cascaded
	consumed, err := store.ConsumeOAuthState(ctx, oauthState.StateHash)
	require.NoError(t, err)
	assert.Nil(t, consumed, "oauth state should be deleted on space cascade")
}

func TestConnectorStore_ConsumeOAuthStateAtomic(t *testing.T) {
	d := driver.New(t, testEnv)
	ctx := context.Background()

	d.Auth().CreateApprovedUser(t).Login(t)
	d.Space().Ensure(t, "Space OAuth State")
	spaceID := d.State().SpaceID
	userID := d.State().UserID

	cipher, err := crypto.NewCipher("test-master-encryption-key-32b!!")
	require.NoError(t, err)

	encVerifier, _ := cipher.Encrypt("pkce-verifier-test")
	store := connector.NewStore(db.New(d.Env().DB))

	// 1. Active unexpired state
	stateHash := connector.HashState("raw_state_valid_token")
	err = store.CreateOAuthState(ctx, &connector.OAuthState{
		StateHash:       stateHash,
		SpaceID:         spaceID,
		UserID:          userID,
		Provider:        "google",
		Capabilities:    []string{"calendar"},
		CodeVerifierEnc: encVerifier,
		ReturnURL:       "/settings/calendar",
		ExpiresAt:       time.Now().Add(15 * time.Minute),
	})
	require.NoError(t, err)

	// First consume succeeds
	consumed1, err := store.ConsumeOAuthState(ctx, stateHash)
	require.NoError(t, err)
	require.NotNil(t, consumed1)
	assert.Equal(t, stateHash, consumed1.StateHash)
	assert.Equal(t, "/settings/calendar", consumed1.ReturnURL)

	// Second consume returns nil (atomic single-use verification)
	consumed2, err := store.ConsumeOAuthState(ctx, stateHash)
	require.NoError(t, err)
	assert.Nil(t, consumed2, "state must be consumed atomically and cannot be replayed")

	// 2. Expired state insertion
	expiredHash := connector.HashState("raw_state_expired_token")
	err = store.CreateOAuthState(ctx, &connector.OAuthState{
		StateHash:       expiredHash,
		SpaceID:         spaceID,
		UserID:          userID,
		Provider:        "google",
		Capabilities:    []string{"calendar"},
		CodeVerifierEnc: encVerifier,
		ReturnURL:       "/settings/calendar",
		ExpiresAt:       time.Now().Add(-5 * time.Minute), // already expired
	})
	require.NoError(t, err)

	// Consuming expired state returns nil
	consumedExpired, err := store.ConsumeOAuthState(ctx, expiredHash)
	require.NoError(t, err)
	assert.Nil(t, consumedExpired, "expired oauth state must not be consumable")
}

func TestConnectorStore_CountActiveByProviderIdentity(t *testing.T) {
	d := driver.New(t, testEnv)
	ctx := context.Background()

	d.Auth().CreateApprovedUser(t).Login(t)
	d.Space().Ensure(t, "Space One")
	space1 := d.State().SpaceID
	userID := d.State().UserID

	space2Resp, err := d.Space().CreateSpace(t, "Space Two", "")
	require.NoError(t, err)
	space2 := space2Resp.GetId()

	cipher, err := crypto.NewCipher("test-master-encryption-key-32b!!")
	require.NoError(t, err)

	encAccess, _ := cipher.Encrypt("access-token-shared")
	encRefresh, _ := cipher.Encrypt("refresh-token-shared")

	store := connector.NewStore(db.New(d.Env().DB))

	sharedProviderAccountID := "google_shared_user_identity_777"

	// Create account in Space 1
	acc1 := &connector.ConnectedAccount{
		SpaceID:             space1,
		CreatedByUserID:     userID,
		Provider:            "google",
		ProviderAccountID:   sharedProviderAccountID,
		Email:               "shared@example.com",
		AccessTokenEnc:      encAccess,
		RefreshTokenEnc:     encRefresh,
		TokenExpiry:         time.Now().Add(1 * time.Hour),
		GrantedScopes:       []string{"openid"},
		EnabledCapabilities: []string{"calendar"},
		Status:              connector.AccountStatusHealthy,
	}
	err = store.CreateAccount(ctx, acc1)
	require.NoError(t, err)

	// Create account in Space 2
	acc2 := &connector.ConnectedAccount{
		SpaceID:             space2,
		CreatedByUserID:     userID,
		Provider:            "google",
		ProviderAccountID:   sharedProviderAccountID,
		Email:               "shared@example.com",
		AccessTokenEnc:      encAccess,
		RefreshTokenEnc:     encRefresh,
		TokenExpiry:         time.Now().Add(1 * time.Hour),
		GrantedScopes:       []string{"openid"},
		EnabledCapabilities: []string{"calendar"},
		Status:              connector.AccountStatusHealthy,
	}
	err = store.CreateAccount(ctx, acc2)
	require.NoError(t, err)

	// 1. Both spaces active:
	// From Space 1's perspective, Space 2 is also active -> count is 1
	countExcluding1, err := store.CountActiveByProviderIdentity(ctx, "google", sharedProviderAccountID, space1)
	require.NoError(t, err)
	assert.Equal(t, 1, countExcluding1)

	// From Space 2's perspective, Space 1 is also active -> count is 1
	countExcluding2, err := store.CountActiveByProviderIdentity(ctx, "google", sharedProviderAccountID, space2)
	require.NoError(t, err)
	assert.Equal(t, 1, countExcluding2)

	// 2. Space 2 disconnects and is marked revoked
	reason := "user disconnected"
	err = store.UpdateAccountStatus(ctx, space2, acc2.ID, connector.AccountStatusRevoked, &reason, nil)
	require.NoError(t, err)

	// Now from Space 1's perspective: count excluding Space 1 is 0!
	countAfterRevoke, err := store.CountActiveByProviderIdentity(ctx, "google", sharedProviderAccountID, space1)
	require.NoError(t, err)
	assert.Equal(t, 0, countAfterRevoke, "excluding space1, remaining active spaces must be 0")
}
