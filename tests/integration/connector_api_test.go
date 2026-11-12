//go:build integration

package integration_test

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"testing"

	connectorv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/connector/v1"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/tests/driver"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
)

func TestConnectorAPI_GRPCInterceptorChainAndOAuthFlow(t *testing.T) {
	d := driver.New(t, testEnv)

	// 1. Create space owner user and initialize workspace
	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().Ensure(t, "Connector Test Workspace")

	ownerToken := d.State().AccessToken
	spaceID := d.State().SpaceID

	// 2. Connect to gRPC server via Unix socket to test full interceptor chain
	conn, err := grpc.NewClient("unix:"+d.Env().SocketPath,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(t, err)
	defer func() { _ = conn.Close() }()

	client := connectorv1.NewConnectorServiceClient(conn)

	// Helper to create gRPC context with metadata headers
	authCtx := func(token, sID string) context.Context {
		md := metadata.New(map[string]string{
			"authorization": "Bearer " + token,
			"space-id":      sID,
		})
		return metadata.NewOutgoingContext(context.Background(), md)
	}

	// 3. Verify SpaceInterceptor blocks non-members
	t.Run("SpaceInterceptor blocks non-members", func(t *testing.T) {
		otherSpaceID, sErr := space.NewSpaceID()
		require.NoError(t, sErr)
		nonMemberSpaceCtx := authCtx(ownerToken, string(otherSpaceID))
		_, err := client.ListConnectedAccounts(nonMemberSpaceCtx, &connectorv1.ListConnectedAccountsRequest{})
		require.Error(t, err)
		st, ok := status.FromError(err)
		require.True(t, ok)
		assert.Equal(t, codes.PermissionDenied, st.Code(), "expected PermissionDenied when user is not a space member")
	})

	// 4. Create a member user in the workspace
	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	memberToken := d.State().AccessToken
	memberUserID := d.State().UserID

	// Add member to workspace with role 'member'
	_, err = d.Env().DB.ExecContext(context.Background(), `
		INSERT INTO space.member (space_id, user_id, role, create_time, update_time)
		VALUES ($1, $2, 'member', NOW(), NOW())
		ON CONFLICT (space_id, user_id) DO UPDATE SET role = 'member'
	`, spaceID, memberUserID)
	require.NoError(t, err)

	// Create a viewer user in the workspace
	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	viewerToken := d.State().AccessToken
	viewerUserID := d.State().UserID

	// Add viewer to workspace with role 'viewer'
	_, err = d.Env().DB.ExecContext(context.Background(), `
		INSERT INTO space.member (space_id, user_id, role, create_time, update_time)
		VALUES ($1, $2, 'viewer', NOW(), NOW())
		ON CONFLICT (space_id, user_id) DO UPDATE SET role = 'viewer'
	`, spaceID, viewerUserID)
	require.NoError(t, err)

	// Verify member cannot call InitiateOAuth
	t.Run("member cannot call InitiateOAuth", func(t *testing.T) {
		memberCtx := authCtx(memberToken, spaceID)
		_, err := client.InitiateOAuth(memberCtx, &connectorv1.InitiateOAuthRequest{
			Provider:  "google",
			ReturnUrl: "https://app.saturn.local/connectors",
		})
		require.Error(t, err)
		st, ok := status.FromError(err)
		require.True(t, ok)
		assert.Equal(t, codes.PermissionDenied, st.Code(), "expected PermissionDenied for member calling InitiateOAuth")
	})

	// Verify member cannot call DeleteConnectedAccount
	t.Run("member cannot call DeleteConnectedAccount", func(t *testing.T) {
		memberCtx := authCtx(memberToken, spaceID)
		_, err := client.DeleteConnectedAccount(memberCtx, &connectorv1.DeleteConnectedAccountRequest{
			Id: "cac_dummy",
		})
		require.Error(t, err)
		st, ok := status.FromError(err)
		require.True(t, ok)
		assert.Equal(t, codes.PermissionDenied, st.Code(), "expected PermissionDenied for member calling DeleteConnectedAccount")
	})

	// Verify viewer cannot call InitiateOAuth
	t.Run("viewer cannot call InitiateOAuth", func(t *testing.T) {
		viewerCtx := authCtx(viewerToken, spaceID)
		_, err := client.InitiateOAuth(viewerCtx, &connectorv1.InitiateOAuthRequest{
			Provider:  "google",
			ReturnUrl: "https://app.saturn.local/connectors",
		})
		require.Error(t, err)
		st, ok := status.FromError(err)
		require.True(t, ok)
		assert.Equal(t, codes.PermissionDenied, st.Code(), "expected PermissionDenied for viewer calling InitiateOAuth")
	})

	// Verify viewer cannot call DeleteConnectedAccount
	t.Run("viewer cannot call DeleteConnectedAccount", func(t *testing.T) {
		viewerCtx := authCtx(viewerToken, spaceID)
		_, err := client.DeleteConnectedAccount(viewerCtx, &connectorv1.DeleteConnectedAccountRequest{
			Id: "cac_dummy",
		})
		require.Error(t, err)
		st, ok := status.FromError(err)
		require.True(t, ok)
		assert.Equal(t, codes.PermissionDenied, st.Code(), "expected PermissionDenied for viewer calling DeleteConnectedAccount")
	})

	// 5. Mock Google OAuth server and end-to-end InitiateOAuth -> HTTP callback -> ListConnectedAccounts
	t.Run("mock Google OAuth server completes full connection flow", func(t *testing.T) {
		ownerCtx := authCtx(ownerToken, spaceID)

		// 5a. InitiateOAuth as owner
		initResp, err := client.InitiateOAuth(ownerCtx, &connectorv1.InitiateOAuthRequest{
			Provider:     "google",
			ReturnUrl:    "https://app.saturn.local/connectors",
			Capabilities: []string{"calendar", "contacts"},
		})
		require.NoError(t, err)
		assert.NotEmpty(t, initResp.GetAuthUrl())
		assert.NotEmpty(t, initResp.GetState())

		state := initResp.GetState()

		// 5b. Simulate OAuth provider redirecting user to Saturn HTTP callback
		callbackURL := fmt.Sprintf("%s/v1/platform/connectors/oauth/google/callback?code=mock_auth_code_123&state=%s",
			d.Env().ServerURL, url.QueryEscape(state))

		noRedirectClient := &http.Client{
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}

		httpResp, err := noRedirectClient.Get(callbackURL)
		require.NoError(t, err)
		defer func() { _ = httpResp.Body.Close() }()

		assert.Equal(t, http.StatusFound, httpResp.StatusCode)
		location := httpResp.Header.Get("Location")
		require.NotEmpty(t, location)

		parsedLoc, err := url.Parse(location)
		require.NoError(t, err)
		assert.Equal(t, "app.saturn.local", parsedLoc.Host)
		assert.Equal(t, "/connectors", parsedLoc.Path)

		accountID := parsedLoc.Query().Get("connected_account_id")
		require.NotEmpty(t, accountID, "expected connected_account_id in callback redirect location")
		assert.Contains(t, accountID, "cac_")

		// 5c. ListConnectedAccounts returns the new account
		listResp, err := client.ListConnectedAccounts(ownerCtx, &connectorv1.ListConnectedAccountsRequest{})
		require.NoError(t, err)
		require.Len(t, listResp.GetAccounts(), 1)

		acc := listResp.GetAccounts()[0]
		assert.Equal(t, accountID, acc.GetId())
		assert.Equal(t, "google", acc.GetProvider())
		assert.Equal(t, "integration-test-user@gmail.com", acc.GetEmail())
		assert.Equal(t, "healthy", acc.GetStatus())
		assert.Contains(t, acc.GetEnabledCapabilities(), "contacts")

		// 5d. GetConnectedAccount retrieves resource directly per AIP-134
		getAcc, err := client.GetConnectedAccount(ownerCtx, &connectorv1.GetConnectedAccountRequest{
			Id: accountID,
		})
		require.NoError(t, err)
		assert.Equal(t, accountID, getAcc.GetId())
		assert.Equal(t, "google", getAcc.GetProvider())

		// 5e. UpdateConnectedAccount with FieldMask
		mask, err := fieldmaskpb.New(&connectorv1.ConnectedAccount{}, "display_name", "color")
		require.NoError(t, err)

		newName := "Personal Google Workspace"
		newColor := "#4285F4"
		updatedAcc, err := client.UpdateConnectedAccount(ownerCtx, &connectorv1.UpdateConnectedAccountRequest{
			Id: accountID,
			Account: &connectorv1.ConnectedAccount{
				DisplayName: &newName,
				Color:       &newColor,
			},
			UpdateMask: mask,
		})
		require.NoError(t, err)
		assert.Equal(t, newName, updatedAcc.GetDisplayName())
		assert.Equal(t, newColor, updatedAcc.GetColor())

		// 5f. DeleteConnectedAccount deletes the account
		_, err = client.DeleteConnectedAccount(ownerCtx, &connectorv1.DeleteConnectedAccountRequest{
			Id: accountID,
		})
		require.NoError(t, err)

		// 5g. Subsequent GetConnectedAccount returns NotFound
		_, err = client.GetConnectedAccount(ownerCtx, &connectorv1.GetConnectedAccountRequest{
			Id: accountID,
		})
		require.Error(t, err)
		stDel, okDel := status.FromError(err)
		require.True(t, okDel)
		assert.Equal(t, codes.NotFound, stDel.Code())
	})
}
