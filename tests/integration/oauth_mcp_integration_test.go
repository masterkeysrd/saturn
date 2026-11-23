//go:build integration

package integration_test

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json/v2"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"

	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
	spacev1 "github.com/masterkeysrd/saturn/apis/saturn/space/v1"
	"github.com/masterkeysrd/saturn/tests/driver"
	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

type oauthBearerRoundTripper struct {
	token string
	next  http.RoundTripper
}

func (rt oauthBearerRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	clone.Header.Set("Authorization", "Bearer "+rt.token)
	return rt.next.RoundTrip(clone)
}

func testPKCEPair() (verifier, challenge string) {
	verifier = "integration_test_pkce_verifier_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	sum := sha256.Sum256([]byte(verifier))
	challenge = base64.RawURLEncoding.EncodeToString(sum[:])
	return verifier, challenge
}

func TestOAuthMCP_EndToEnd(t *testing.T) {
	d := driver.New(t, testEnv)
	d.Auth().CreateApprovedUser(t).Login(t)
	userToken := d.State().AccessToken

	d.Space().Ensure(t, "OAuth Integration Space")
	spaceA := d.State().SpaceID

	conn, err := grpc.NewClient("unix:"+d.Env().SocketPath,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(t, err)
	defer func() { _ = conn.Close() }()

	identClient := identityv1.NewIdentityClient(conn)
	spaceClient := spacev1.NewSpacesClient(conn)

	jwtCtx := metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+userToken))
	noRedirectClient := &http.Client{
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	t.Run("Workspace OAuth Client with persistent refresh and /spaces/{space_id}/mcp", func(t *testing.T) {
		// 1. Unauthenticated MCP probe returns 401 + RFC 9728 WWW-Authenticate header
		probeResp, err := http.Post(d.Env().ServerURL+"/spaces/"+spaceA+"/mcp", "application/json", strings.NewReader(`{}`))
		require.NoError(t, err)
		_ = probeResp.Body.Close()
		require.Equal(t, http.StatusUnauthorized, probeResp.StatusCode)
		wwwAuth := probeResp.Header.Get("WWW-Authenticate")
		assert.Contains(t, wwwAuth, "/.well-known/oauth-protected-resource/spaces/"+spaceA+"/mcp")

		// 2. Discover Protected Resource Metadata & Authorization Server Metadata
		prmResp, err := http.Get(d.Env().ServerURL + "/.well-known/oauth-protected-resource/spaces/" + spaceA + "/mcp")
		require.NoError(t, err)
		defer func() { _ = prmResp.Body.Close() }()
		require.Equal(t, http.StatusOK, prmResp.StatusCode)
		var prm struct {
			Resource             string   `json:"resource"`
			AuthorizationServers []string `json:"authorization_servers"`
		}
		require.NoError(t, json.UnmarshalRead(prmResp.Body, &prm))
		require.Len(t, prm.AuthorizationServers, 1)
		assert.True(t, strings.HasSuffix(prm.AuthorizationServers[0], "/spaces/"+spaceA))

		asmResp, err := http.Get(d.Env().ServerURL + "/.well-known/oauth-authorization-server/spaces/" + spaceA)
		require.NoError(t, err)
		defer func() { _ = asmResp.Body.Close() }()
		require.Equal(t, http.StatusOK, asmResp.StatusCode)
		var asm struct {
			AuthorizationEndpoint string `json:"authorization_endpoint"`
			TokenEndpoint         string `json:"token_endpoint"`
			RevocationEndpoint    string `json:"revocation_endpoint"`
			RegistrationEndpoint  string `json:"registration_endpoint"`
		}
		require.NoError(t, json.UnmarshalRead(asmResp.Body, &asm))
		assert.True(t, strings.HasSuffix(asm.RegistrationEndpoint, "/spaces/"+spaceA+"/oauth/register"))

		// 3. Register Workspace OAuth Client with persistent refresh policy & subpath redirect rule
		createdClient, err := spaceClient.CreateSpaceOAuthClient(jwtCtx, &spacev1.CreateSpaceOAuthClientRequest{
			SpaceId: spaceA,
			OauthClient: &spacev1.SpaceOAuthClient{
				Name:                    "Workspace Broker Connector",
				RedirectUris:            []string{"https://broker.example.com/oauth/cb/*"},
				AllowedScopes:           []string{"spaces:read", "finance:read"},
				TokenEndpointAuthMethod: "client_secret_basic",
				RefreshTokenPolicy:      "persistent",
			},
		})
		require.NoError(t, err)
		require.NotEmpty(t, createdClient.GetRawSecret())

		// 4. Consent Inspect & Decide
		verifier, challenge := testPKCEPair()
		redirectURI := "https://broker.example.com/oauth/cb/session-42"

		inspected, err := identClient.InspectOAuthConsent(jwtCtx, &identityv1.InspectOAuthConsentRequest{
			ClientId:            createdClient.GetId(),
			RedirectUri:         redirectURI,
			ResponseType:        "code",
			Scope:               "openid profile finance:read",
			State:               "ws_state_1",
			CodeChallenge:       challenge,
			CodeChallengeMethod: "S256",
		})
		require.NoError(t, err)
		assert.True(t, inspected.GetIsWorkspaceClient())
		assert.Equal(t, spaceA, inspected.GetLockedSpaceId())

		decided, err := identClient.DecideOAuthConsent(jwtCtx, &identityv1.DecideOAuthConsentRequest{
			ClientId:            createdClient.GetId(),
			RedirectUri:         redirectURI,
			ResponseType:        "code",
			Scope:               "openid profile finance:read",
			ApprovedScopes:      []string{"finance:read"},
			SpaceId:             spaceA,
			State:               "ws_state_1",
			CodeChallenge:       challenge,
			CodeChallengeMethod: "S256",
			Approved:            true,
		})
		require.NoError(t, err)
		require.NotEmpty(t, decided.GetHandoffToken())

		// 5. Consume handoff -> 302 Found
		cbResp, err := noRedirectClient.Get(d.Env().ServerURL + "/oauth/authorize/callback?handoff=" + url.QueryEscape(decided.GetHandoffToken()))
		require.NoError(t, err)
		_ = cbResp.Body.Close()
		require.Equal(t, http.StatusFound, cbResp.StatusCode)
		locURL, err := url.Parse(cbResp.Header.Get("Location"))
		require.NoError(t, err)
		assert.Equal(t, "ws_state_1", locURL.Query().Get("state"))
		authCode := locURL.Query().Get("code")
		require.NotEmpty(t, authCode)

		// 6. Exchange code for sat_oat_ + sat_ort_ via Basic Auth
		tokReq, err := http.NewRequest(http.MethodPost, asm.TokenEndpoint, strings.NewReader(url.Values{
			"grant_type":    {"authorization_code"},
			"code":          {authCode},
			"redirect_uri":  {redirectURI},
			"code_verifier": {verifier},
		}.Encode()))
		require.NoError(t, err)
		tokReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		tokReq.SetBasicAuth(createdClient.GetId(), createdClient.GetRawSecret())
		tokResp, err := http.DefaultClient.Do(tokReq)
		require.NoError(t, err)
		defer func() { _ = tokResp.Body.Close() }()
		require.Equal(t, http.StatusOK, tokResp.StatusCode)

		var tokPayload struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
			Scope        string `json:"scope"`
		}
		require.NoError(t, json.UnmarshalRead(tokResp.Body, &tokPayload))
		assert.True(t, strings.HasPrefix(tokPayload.AccessToken, "sat_oat_"))
		assert.True(t, strings.HasPrefix(tokPayload.RefreshToken, "sat_ort_"))
		assert.Equal(t, "finance:read", tokPayload.Scope)

		// 7. Connect Streamable HTTP MCP client to /spaces/{spaceA}/mcp
		mcpHTTP := &http.Client{
			Transport: oauthBearerRoundTripper{token: tokPayload.AccessToken, next: http.DefaultTransport},
		}
		mcpClient := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "oauth-test-mcp", Version: "1.0.0"}, nil)
		session, err := mcpClient.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
			Endpoint:   d.Env().ServerURL + "/spaces/" + spaceA + "/mcp",
			HTTPClient: mcpHTTP,
		}, nil)
		require.NoError(t, err)
		assert.NotEmpty(t, session.InitializeResult().Instructions)

		tools, err := session.ListTools(context.Background(), &sdkmcp.ListToolsParams{})
		require.NoError(t, err)
		toolNames := make([]string, 0, len(tools.Tools))
		for _, tl := range tools.Tools {
			toolNames = append(toolNames, tl.Name)
		}
		assert.Contains(t, toolNames, "finance_list_accounts")
		assert.NotContains(t, toolNames, "finance_create_budget")

		callRes, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name:      "finance_list_accounts",
			Arguments: map[string]any{},
		})
		require.NoError(t, err)
		assert.False(t, callRes.IsError)
		_ = session.Close()

		// 8. Refresh with persistent policy keeps exact same refresh_token
		refReq, err := http.NewRequest(http.MethodPost, asm.TokenEndpoint, strings.NewReader(url.Values{
			"grant_type":    {"refresh_token"},
			"refresh_token": {tokPayload.RefreshToken},
		}.Encode()))
		require.NoError(t, err)
		refReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		refReq.SetBasicAuth(createdClient.GetId(), createdClient.GetRawSecret())
		refResp, err := http.DefaultClient.Do(refReq)
		require.NoError(t, err)
		defer func() { _ = refResp.Body.Close() }()
		require.Equal(t, http.StatusOK, refResp.StatusCode)

		var refPayload struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
		}
		require.NoError(t, json.UnmarshalRead(refResp.Body, &refPayload))
		assert.Equal(t, tokPayload.RefreshToken, refPayload.RefreshToken)
		assert.NotEqual(t, tokPayload.AccessToken, refPayload.AccessToken)

		// 9. Revoke access token via /oauth/revoke and verify immediate invalidation
		revReq, err := http.NewRequest(http.MethodPost, asm.RevocationEndpoint, strings.NewReader(url.Values{
			"token": {refPayload.AccessToken},
		}.Encode()))
		require.NoError(t, err)
		revReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		revReq.SetBasicAuth(createdClient.GetId(), createdClient.GetRawSecret())
		revResp, err := http.DefaultClient.Do(revReq)
		require.NoError(t, err)
		_ = revResp.Body.Close()
		require.Equal(t, http.StatusOK, revResp.StatusCode)

		postRevokeReq, err := http.NewRequest(http.MethodPost, d.Env().ServerURL+"/spaces/"+spaceA+"/mcp", strings.NewReader(`{}`))
		require.NoError(t, err)
		postRevokeReq.Header.Set("Authorization", "Bearer "+refPayload.AccessToken)
		postRevokeResp, err := http.DefaultClient.Do(postRevokeReq)
		require.NoError(t, err)
		_ = postRevokeResp.Body.Close()
		assert.Equal(t, http.StatusUnauthorized, postRevokeResp.StatusCode)
	})

	t.Run("Instance OAuth Client via DCR, RFC 8252 loopback, rotate refresh, and /mcp", func(t *testing.T) {
		// 1. Unauthenticated /mcp probe
		probeResp, err := http.Post(d.Env().ServerURL+"/mcp", "application/json", strings.NewReader(`{}`))
		require.NoError(t, err)
		_ = probeResp.Body.Close()
		require.Equal(t, http.StatusUnauthorized, probeResp.StatusCode)
		assert.Contains(t, probeResp.Header.Get("WWW-Authenticate"), "/.well-known/oauth-protected-resource/mcp")

		// 2. Dynamic Client Registration at /oauth/register
		dcrBody := `{"client_name":"DCR Public CLI","redirect_uris":["http://127.0.0.1/oauth/cb"],"token_endpoint_auth_method":"none"}`
		dcrResp, err := http.Post(d.Env().ServerURL+"/oauth/register", "application/json", strings.NewReader(dcrBody))
		require.NoError(t, err)
		defer func() { _ = dcrResp.Body.Close() }()
		rawDCR, err := io.ReadAll(dcrResp.Body)
		require.NoError(t, err)
		require.Equal(t, http.StatusCreated, dcrResp.StatusCode, string(rawDCR))

		var dcrOut struct {
			ClientID string `json:"client_id"`
		}
		require.NoError(t, json.Unmarshal(rawDCR, &dcrOut))
		require.NotEmpty(t, dcrOut.ClientID)

		// 3. Consent with RFC 8252 ephemeral port on loopback redirect URI
		verifier, challenge := testPKCEPair()
		loopbackRedirect := "http://127.0.0.1:54321/oauth/cb"

		decided, err := identClient.DecideOAuthConsent(jwtCtx, &identityv1.DecideOAuthConsentRequest{
			ClientId:            dcrOut.ClientID,
			RedirectUri:         loopbackRedirect,
			ResponseType:        "code",
			Scope:               "spaces:read",
			ApprovedScopes:      []string{"spaces:read"},
			SpaceId:             spaceA,
			State:               "dcr_state",
			CodeChallenge:       challenge,
			CodeChallengeMethod: "S256",
			Approved:            true,
		})
		require.NoError(t, err)

		cbResp, err := noRedirectClient.Get(d.Env().ServerURL + "/oauth/authorize/callback?handoff=" + url.QueryEscape(decided.GetHandoffToken()))
		require.NoError(t, err)
		_ = cbResp.Body.Close()
		require.Equal(t, http.StatusFound, cbResp.StatusCode)
		locURL, err := url.Parse(cbResp.Header.Get("Location"))
		require.NoError(t, err)
		authCode := locURL.Query().Get("code")
		require.NotEmpty(t, authCode)

		// 4. Token exchange (public PKCE client)
		tokResp, err := http.PostForm(d.Env().ServerURL+"/oauth/token", url.Values{
			"grant_type":    {"authorization_code"},
			"client_id":     {dcrOut.ClientID},
			"code":          {authCode},
			"redirect_uri":  {loopbackRedirect},
			"code_verifier": {verifier},
		})
		require.NoError(t, err)
		defer func() { _ = tokResp.Body.Close() }()
		require.Equal(t, http.StatusOK, tokResp.StatusCode)

		var tokOut struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
		}
		require.NoError(t, json.UnmarshalRead(tokResp.Body, &tokOut))

		// 5. Connect to /mcp without Space-Id header (auto-resolved from grant)
		mcpHTTP := &http.Client{
			Transport: oauthBearerRoundTripper{token: tokOut.AccessToken, next: http.DefaultTransport},
		}
		mcpClient := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "dcr-mcp-client", Version: "1.0.0"}, nil)
		session, err := mcpClient.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
			Endpoint:   d.Env().ServerURL + "/mcp",
			HTTPClient: mcpHTTP,
		}, nil)
		require.NoError(t, err)
		tools, err := session.ListTools(context.Background(), &sdkmcp.ListToolsParams{})
		require.NoError(t, err)
		assert.NotEmpty(t, tools.Tools)
		_ = session.Close()

		// 6. Rotate refresh token & verify new refresh token differs, then revoke grant via refresh token
		rotResp, err := http.PostForm(d.Env().ServerURL+"/oauth/token", url.Values{
			"grant_type":    {"refresh_token"},
			"client_id":     {dcrOut.ClientID},
			"refresh_token": {tokOut.RefreshToken},
		})
		require.NoError(t, err)
		defer func() { _ = rotResp.Body.Close() }()
		require.Equal(t, http.StatusOK, rotResp.StatusCode)

		var rotOut struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
		}
		require.NoError(t, json.UnmarshalRead(rotResp.Body, &rotOut))
		assert.NotEqual(t, tokOut.RefreshToken, rotOut.RefreshToken)

		revResp, err := http.PostForm(d.Env().ServerURL+"/oauth/revoke", url.Values{
			"client_id": {dcrOut.ClientID},
			"token":     {rotOut.RefreshToken},
		})
		require.NoError(t, err)
		_ = revResp.Body.Close()
		require.Equal(t, http.StatusOK, revResp.StatusCode)

		postRevokeReq, err := http.NewRequest(http.MethodPost, d.Env().ServerURL+"/mcp", strings.NewReader(`{}`))
		require.NoError(t, err)
		postRevokeReq.Header.Set("Authorization", "Bearer "+rotOut.AccessToken)
		postRevokeResp, err := http.DefaultClient.Do(postRevokeReq)
		require.NoError(t, err)
		_ = postRevokeResp.Body.Close()
		assert.Equal(t, http.StatusUnauthorized, postRevokeResp.StatusCode)

		// 7. Consent denial stores empty scopes cleanly and redirects with error=access_denied
		_, denyChallenge := testPKCEPair()
		denied, err := identClient.DecideOAuthConsent(jwtCtx, &identityv1.DecideOAuthConsentRequest{
			ClientId:            dcrOut.ClientID,
			RedirectUri:         loopbackRedirect,
			ResponseType:        "code",
			Scope:               "spaces:read",
			State:               "deny_state",
			CodeChallenge:       denyChallenge,
			CodeChallengeMethod: "S256",
			Approved:            false,
		})
		require.NoError(t, err)
		require.NotEmpty(t, denied.GetHandoffToken())

		denyCBResp, err := noRedirectClient.Get(d.Env().ServerURL + "/oauth/authorize/callback?handoff=" + url.QueryEscape(denied.GetHandoffToken()))
		require.NoError(t, err)
		_ = denyCBResp.Body.Close()
		require.Equal(t, http.StatusFound, denyCBResp.StatusCode)
		denyLoc, err := url.Parse(denyCBResp.Header.Get("Location"))
		require.NoError(t, err)
		assert.Equal(t, "access_denied", denyLoc.Query().Get("error"))
		assert.Equal(t, "deny_state", denyLoc.Query().Get("state"))
	})
}
