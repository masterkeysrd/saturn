//go:build integration

package integration_test

import (
	"context"
	"testing"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
	aiv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/ai/v1"
	spacev1 "github.com/masterkeysrd/saturn/apis/saturn/space/v1"
	"github.com/masterkeysrd/saturn/tests/driver"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func TestAPIKeys_EndToEnd(t *testing.T) {
	d := driver.New(t, testEnv)

	// Setup User 1 (Owner) with Space A and Space B
	d.Auth().CreateApprovedUser(t).Login(t)
	user1Token := d.State().AccessToken

	d.Space().Ensure(t, "API Key Space A")
	spaceA := d.State().SpaceID

	spaceBObj, err := d.Space().CreateSpace(t, "API Key Space B", "Second space")
	require.NoError(t, err)
	spaceB := spaceBObj.GetId()

	// Setup User 2 (Admin of Space A) and User 3 (Unrelated user with Space C)
	d.Auth().CreateApprovedUser(t).Login(t)
	user2ID := d.State().UserID
	user2Token := d.State().AccessToken

	d.Auth().CreateApprovedUser(t).Login(t)
	user3Token := d.State().AccessToken
	d.Space().Ensure(t, "Unrelated Space C")
	spaceC := d.State().SpaceID

	// Add User 2 as admin of Space A
	_, err = d.Env().DB.ExecContext(context.Background(), `
		INSERT INTO space.member (space_id, user_id, role, create_time, update_time)
		VALUES ($1, $2, 'admin', NOW(), NOW())
		ON CONFLICT (space_id, user_id) DO UPDATE SET role = 'admin'
	`, spaceA, user2ID)
	require.NoError(t, err)

	// Connect over Unix socket to exercise full gRPC interceptor chain
	conn, err := grpc.NewClient("unix:"+d.Env().SocketPath,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(t, err)
	defer func() { _ = conn.Close() }()

	identClient := identityv1.NewIdentityClient(conn)
	spaceClient := spacev1.NewSpacesClient(conn)
	financeClient := financev1.NewFinanceClient(conn)
	aiClient := aiv1.NewAIServiceClient(conn)

	bearerCtx := func(tok string, spaceID string) context.Context {
		pairs := map[string]string{"authorization": "Bearer " + tok}
		if spaceID != "" {
			pairs["space-id"] = spaceID
		}
		return metadata.NewOutgoingContext(context.Background(), metadata.New(pairs))
	}

	t.Run("Single-space key auto-injects space-id and rejects wrong space-id", func(t *testing.T) {
		created, err := identClient.CreateAPIKey(bearerCtx(user1Token, ""), &identityv1.CreateAPIKeyRequest{
			ApiKey: &identityv1.APIKey{
				Name:     "Single Space Webhook Key",
				Scopes:   []string{"finance:read", "finance:write"},
				SpaceIds: []string{spaceA},
			},
		})
		require.NoError(t, err)
		require.NotEmpty(t, created.GetRawKey())
		rawKey := created.GetRawKey()

		// Calling Finance without space-id header auto-injects spaceA
		_, err = financeClient.ListBudgets(bearerCtx(rawKey, ""), &financev1.ListBudgetsRequest{})
		require.NoError(t, err)

		// Calling Finance with wrong space-id header (spaceB) is denied
		_, err = financeClient.ListBudgets(bearerCtx(rawKey, spaceB), &financev1.ListBudgetsRequest{})
		require.Error(t, err)
		assert.Equal(t, codes.PermissionDenied, status.Code(err))

		// Verify GetAPIKey / ListAPIKeys never leak raw_key
		fetched, err := identClient.GetAPIKey(bearerCtx(user1Token, ""), &identityv1.GetAPIKeyRequest{Id: created.GetId()})
		require.NoError(t, err)
		assert.Empty(t, fetched.GetRawKey())

		// Cleanup
		_, err = identClient.DeleteAPIKey(bearerCtx(user1Token, ""), &identityv1.DeleteAPIKeyRequest{Id: created.GetId()})
		require.NoError(t, err)
	})

	t.Run("Multi-space key filters ListSpaces, requires space-id header, and enforces read vs write scopes", func(t *testing.T) {
		// Also create a 3rd space for User 1 that is NOT granted to the key
		ungrantedObj, err := d.Space().CreateSpace(t, "Ungranted Space", "")
		require.NoError(t, err)
		_ = ungrantedObj

		// Switch back to User 1 token via spaceClient
		created, err := identClient.CreateAPIKey(bearerCtx(user1Token, ""), &identityv1.CreateAPIKeyRequest{
			ApiKey: &identityv1.APIKey{
				Name:     "Multi Space Read Key",
				Scopes:   []string{"spaces:read", "finance:read"},
				SpaceIds: []string{spaceA, spaceB},
			},
		})
		require.NoError(t, err)
		rawKey := created.GetRawKey()

		// ListSpaces returns ONLY Space A and Space B
		spacesResp, err := spaceClient.ListSpaces(bearerCtx(rawKey, ""), &spacev1.ListSpacesRequest{})
		require.NoError(t, err)
		require.Len(t, spacesResp.GetSpaces(), 2)
		gotIDs := []string{spacesResp.GetSpaces()[0].GetId(), spacesResp.GetSpaces()[1].GetId()}
		assert.ElementsMatch(t, []string{spaceA, spaceB}, gotIDs)

		// Calling Finance without space-id fails with InvalidArgument
		_, err = financeClient.ListBudgets(bearerCtx(rawKey, ""), &financev1.ListBudgetsRequest{})
		require.Error(t, err)
		assert.Equal(t, codes.InvalidArgument, status.Code(err))

		// Calling Finance read with space-id=spaceB succeeds
		_, err = financeClient.ListBudgets(bearerCtx(rawKey, spaceB), &financev1.ListBudgetsRequest{})
		require.NoError(t, err)

		// Calling Finance write with read-only key fails with PermissionDenied
		_, err = financeClient.CreateBudget(bearerCtx(rawKey, spaceB), &financev1.CreateBudgetRequest{
			Budget: &financev1.Budget{Name: "Should Fail"},
		})
		require.Error(t, err)
		assert.Equal(t, codes.PermissionDenied, status.Code(err))

		_, err = identClient.DeleteAPIKey(bearerCtx(user1Token, ""), &identityv1.DeleteAPIKeyRequest{Id: created.GetId()})
		require.NoError(t, err)
	})

	t.Run("Default-deny rejects JWT-only Identity endpoints", func(t *testing.T) {
		created, err := identClient.CreateAPIKey(bearerCtx(user1Token, ""), &identityv1.CreateAPIKeyRequest{
			ApiKey: &identityv1.APIKey{
				Name:     "Scoped Key",
				Scopes:   []string{"spaces:read", "finance:read", "finance:write"},
				SpaceIds: []string{spaceA},
			},
		})
		require.NoError(t, err)
		rawKey := created.GetRawKey()

		_, err = identClient.CreateAPIKey(bearerCtx(rawKey, ""), &identityv1.CreateAPIKeyRequest{
			ApiKey: &identityv1.APIKey{
				Name:     "Escalation",
				Scopes:   []string{"finance:read"},
				SpaceIds: []string{spaceA},
			},
		})
		require.Error(t, err)
		assert.Equal(t, codes.PermissionDenied, status.Code(err))

		_, err = identClient.ChangePassword(bearerCtx(rawKey, ""), &identityv1.ChangePasswordRequest{
			CurrentPassword: "old",
			NewPassword:     "new",
		})
		require.Error(t, err)
		assert.Equal(t, codes.PermissionDenied, status.Code(err))

		_, err = identClient.DeleteAPIKey(bearerCtx(user1Token, ""), &identityv1.DeleteAPIKeyRequest{Id: created.GetId()})
		require.NoError(t, err)
	})

	t.Run("Space admin revokes grant on Space A while Space B continues working, and member removal cascades", func(t *testing.T) {
		// User 1 creates key granted to Space A and Space B
		created, err := identClient.CreateAPIKey(bearerCtx(user1Token, ""), &identityv1.CreateAPIKeyRequest{
			ApiKey: &identityv1.APIKey{
				Name:     "Shared Key",
				Scopes:   []string{"spaces:read", "finance:read"},
				SpaceIds: []string{spaceA, spaceB},
			},
		})
		require.NoError(t, err)
		rawKey := created.GetRawKey()

		// User 2 (Admin of Space A) lists grants on Space A and sees User 1's key (without seeing Space B)
		grantsResp, err := spaceClient.ListSpaceAPIKeyGrants(bearerCtx(user2Token, ""), &spacev1.ListSpaceAPIKeyGrantsRequest{
			SpaceId: spaceA,
		})
		require.NoError(t, err)
		require.Len(t, grantsResp.GetGrants(), 1)
		assert.Equal(t, created.GetId(), grantsResp.GetGrants()[0].GetApiKeyId())
		assert.Equal(t, spaceA, grantsResp.GetGrants()[0].GetSpaceId())

		// User 3 (not in Space A) cannot list Space A grants
		_, err = spaceClient.ListSpaceAPIKeyGrants(bearerCtx(user3Token, ""), &spacev1.ListSpaceAPIKeyGrantsRequest{
			SpaceId: spaceA,
		})
		require.Error(t, err)
		assert.Equal(t, codes.PermissionDenied, status.Code(err))
		_ = spaceC

		// User 2 revokes the grant for Space A
		_, err = spaceClient.RevokeSpaceAPIKeyGrant(bearerCtx(user2Token, ""), &spacev1.RevokeSpaceAPIKeyGrantRequest{
			SpaceId:  spaceA,
			ApiKeyId: created.GetId(),
		})
		require.NoError(t, err)

		// Key is immediately blocked on Space A
		_, err = financeClient.ListBudgets(bearerCtx(rawKey, spaceA), &financev1.ListBudgetsRequest{})
		require.Error(t, err)
		assert.Equal(t, codes.PermissionDenied, status.Code(err))

		// Key still works on Space B (and auto-injects Space B now that only 1 grant remains)
		_, err = financeClient.ListBudgets(bearerCtx(rawKey, ""), &financev1.ListBudgetsRequest{})
		require.NoError(t, err)

		// Removing User 1's membership on Space B cascades grant deletion
		var keyOwnerID string
		err = d.Env().DB.GetContext(context.Background(), &keyOwnerID, `SELECT user_id FROM identity.api_keys WHERE id = $1`, created.GetId())
		require.NoError(t, err)
		_, err = d.Env().DB.ExecContext(context.Background(), `
			DELETE FROM space.member WHERE space_id = $1 AND user_id = $2
		`, spaceB, keyOwnerID)
		require.NoError(t, err)

		// With 0 remaining grants, key is now Unauthenticated
		_, err = financeClient.ListBudgets(bearerCtx(rawKey, ""), &financev1.ListBudgetsRequest{})
		require.Error(t, err)
		assert.Equal(t, codes.Unauthenticated, status.Code(err))
	})

	t.Run("AI scopes enforce ai:read vs ai:execute vs ai:write", func(t *testing.T) {
		readKey, err := identClient.CreateAPIKey(bearerCtx(user1Token, ""), &identityv1.CreateAPIKeyRequest{
			ApiKey: &identityv1.APIKey{
				Name:     "AI Read Only Key",
				Scopes:   []string{"ai:read"},
				SpaceIds: []string{spaceA},
			},
		})
		require.NoError(t, err)

		// ai:read allows listing agents and reading settings
		_, err = aiClient.ListAgents(bearerCtx(readKey.GetRawKey(), ""), &aiv1.ListAgentsRequest{})
		require.NoError(t, err)
		_, err = aiClient.GetSettings(bearerCtx(readKey.GetRawKey(), ""), &aiv1.GetSettingsRequest{})
		require.NoError(t, err)

		// ai:read rejects ai:execute (CreateThread) and ai:write (CreateProvider)
		_, err = aiClient.CreateThread(bearerCtx(readKey.GetRawKey(), ""), &aiv1.CreateThreadRequest{
			Thread: &aiv1.Thread{Title: "Denied"},
		})
		require.Error(t, err)
		assert.Equal(t, codes.PermissionDenied, status.Code(err))

		_, err = aiClient.CreateProvider(bearerCtx(readKey.GetRawKey(), ""), &aiv1.CreateProviderRequest{
			Provider: &aiv1.Provider{Name: "Denied", Driver: "openai"},
		})
		require.Error(t, err)
		assert.Equal(t, codes.PermissionDenied, status.Code(err))

		execKey, err := identClient.CreateAPIKey(bearerCtx(user1Token, ""), &identityv1.CreateAPIKeyRequest{
			ApiKey: &identityv1.APIKey{
				Name:     "AI Execute Key",
				Scopes:   []string{"ai:execute"},
				SpaceIds: []string{spaceA},
			},
		})
		require.NoError(t, err)

		// ai:execute allows CreateThread and rejects ai:write (CreateProvider)
		th, err := aiClient.CreateThread(bearerCtx(execKey.GetRawKey(), ""), &aiv1.CreateThreadRequest{
			Thread: &aiv1.Thread{Title: "Allowed By Execute"},
		})
		require.NoError(t, err)
		assert.NotEmpty(t, th.GetId())

		_, err = aiClient.CreateProvider(bearerCtx(execKey.GetRawKey(), ""), &aiv1.CreateProviderRequest{
			Provider: &aiv1.Provider{Name: "Denied", Driver: "openai"},
		})
		require.Error(t, err)
		assert.Equal(t, codes.PermissionDenied, status.Code(err))

		_, err = identClient.DeleteAPIKey(bearerCtx(user1Token, ""), &identityv1.DeleteAPIKeyRequest{Id: readKey.GetId()})
		require.NoError(t, err)
		_, err = identClient.DeleteAPIKey(bearerCtx(user1Token, ""), &identityv1.DeleteAPIKeyRequest{Id: execKey.GetId()})
		require.NoError(t, err)
	})
}
