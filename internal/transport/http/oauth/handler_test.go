package oauth

import (
	"context"
	"encoding/base64"
	"encoding/json/v2"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/application/iam"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestHandler_WellKnownMetadata(t *testing.T) {
	mux := http.NewServeMux()
	h := NewHandler(Config{
		Coordinator:              &CoordinatorMock{},
		AllowDynamicRegistration: true,
	})
	h.RegisterRoutes(mux)

	t.Run("Protected Resource Metadata for /mcp and /spaces/{space_id}/mcp", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "https://saturn.example.com/.well-known/oauth-protected-resource/spaces/spc_123/mcp", nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", rec.Code)
		}
		var body protectedResourceMetadata
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if body.Resource != "https://saturn.example.com/spaces/spc_123/mcp" {
			t.Errorf("resource = %q", body.Resource)
		}
		if len(body.AuthorizationServers) != 1 || body.AuthorizationServers[0] != "https://saturn.example.com/spaces/spc_123" {
			t.Errorf("authorization_servers = %v", body.AuthorizationServers)
		}
	})

	t.Run("Authorization Server Metadata advertises space-scoped registration endpoint and OIDC alias", func(t *testing.T) {
		for _, path := range []string{
			"/.well-known/oauth-authorization-server/spaces/spc_123",
			"/.well-known/openid-configuration/spaces/spc_123",
		} {
			req := httptest.NewRequest(http.MethodGet, "https://saturn.example.com"+path, nil)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("%s status = %d, want 200", path, rec.Code)
			}
			var body authorizationServerMetadata
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if body.Issuer != "https://saturn.example.com/spaces/spc_123" {
				t.Errorf("issuer = %q", body.Issuer)
			}
			if body.RegistrationEndpoint != "https://saturn.example.com/spaces/spc_123/oauth/register" {
				t.Errorf("registration_endpoint = %q", body.RegistrationEndpoint)
			}
			if !body.ClientIDMetadataDocumentSupported {
				t.Error("expected client_id_metadata_document_supported = true")
			}
		}
	})

	t.Run("Authorization Server Metadata omits registration_endpoint when DCR is disabled", func(t *testing.T) {
		disabledMux := http.NewServeMux()
		NewHandler(Config{
			Coordinator:              &CoordinatorMock{},
			IssuerURL:                "https://saturn.example.com",
			AllowDynamicRegistration: false,
		}).RegisterRoutes(disabledMux)

		req := httptest.NewRequest(http.MethodGet, "https://saturn.example.com/.well-known/oauth-authorization-server", nil)
		rec := httptest.NewRecorder()
		disabledMux.ServeHTTP(rec, req)

		var body authorizationServerMetadata
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if body.RegistrationEndpoint != "" || body.ClientIDMetadataDocumentSupported {
			t.Errorf("expected DCR/CIMD disabled in metadata: %+v", body)
		}
	})
}

func TestHandler_RegisterTokenCallbackRevoke(t *testing.T) {
	coord := &CoordinatorMock{}
	mux := http.NewServeMux()
	NewHandler(Config{
		Coordinator:              coord,
		AllowDynamicRegistration: true,
	}).RegisterRoutes(mux)

	t.Run("POST /spaces/{space_id}/oauth/register returns 201 Created", func(t *testing.T) {
		coord.RegisterDynamicOAuthClientFunc = func(_ context.Context, req *iam.RegisterDynamicOAuthClientRequest) (*identity.OAuthClient, error) {
			if req.SpaceID == nil || *req.SpaceID != "spc_123" {
				t.Fatalf("expected space_id spc_123, got %v", req.SpaceID)
			}
			return &identity.OAuthClient{
				ID:                      "oac_dcr_1",
				SpaceID:                 req.SpaceID,
				Name:                    req.Name,
				RawSecret:               "sat_ocs_secret",
				RedirectURIs:            req.RedirectURIs,
				AllowedScopes:           []string{"finance:read"},
				TokenEndpointAuthMethod: identity.TokenAuthMethodClientSecretBasic,
				CreateTime:              time.Unix(1700000000, 0),
			}, nil
		}

		req := httptest.NewRequest(http.MethodPost, "/spaces/spc_123/oauth/register", strings.NewReader(`{"client_name":"Test App","redirect_uris":["https://app.example.com/cb"]}`))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
		}
		var resp dcrResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatal(err)
		}
		if resp.ClientID != "oac_dcr_1" || resp.ClientSecret != "sat_ocs_secret" {
			t.Errorf("unexpected DCR response: %+v", resp)
		}
	})

	t.Run("GET /oauth/authorize/callback issues explicit 302 Found", func(t *testing.T) {
		coord.ConsumeOAuthRedirectHandoffFunc = func(_ context.Context, req *iam.ConsumeOAuthRedirectHandoffRequest) (*iam.ConsumeOAuthRedirectHandoffResponse, error) {
			if req.HandoffToken != "h_123" {
				t.Fatalf("unexpected handoff %q", req.HandoffToken)
			}
			return &iam.ConsumeOAuthRedirectHandoffResponse{
				RedirectURL: "https://app.example.com/cb?code=c_1&state=s_1",
			}, nil
		}

		req := httptest.NewRequest(http.MethodGet, "/oauth/authorize/callback?handoff=h_123", nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusFound {
			t.Fatalf("status = %d, want 302", rec.Code)
		}
		if loc := rec.Header().Get("Location"); loc != "https://app.example.com/cb?code=c_1&state=s_1" {
			t.Errorf("Location = %q", loc)
		}
	})

	t.Run("POST /oauth/token supports Basic Auth and maps invalid_client to 401", func(t *testing.T) {
		coord.ExchangeOAuthTokenFunc = func(_ context.Context, req *iam.ExchangeOAuthTokenRequest) (*iam.ExchangeOAuthTokenResponse, error) {
			if req.ClientID != "oac_1" || req.ClientSecret != "sat_ocs_abc" || req.AuthMethodUsed != "client_secret_basic" {
				return nil, errors.E(errors.Unauthenticated, identity.OAuthInvalidClient, "invalid credentials")
			}
			return &iam.ExchangeOAuthTokenResponse{
				AccessToken:  "sat_oat_tok1",
				TokenType:    "Bearer",
				ExpiresIn:    3600,
				RefreshToken: "sat_ort_tok1",
				Scope:        "finance:read",
			}, nil
		}

		form := url.Values{
			"grant_type":    {"authorization_code"},
			"code":          {"c_1"},
			"redirect_uri":  {"https://app.example.com/cb"},
			"code_verifier": {"verifier"},
		}
		req := httptest.NewRequest(http.MethodPost, "/oauth/token", strings.NewReader(form.Encode()))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte("oac_1:sat_ocs_abc")))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
		}
		var tok tokenResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &tok); err != nil {
			t.Fatal(err)
		}
		if tok.AccessToken != "sat_oat_tok1" || tok.RefreshToken != "sat_ort_tok1" {
			t.Errorf("unexpected token response: %+v", tok)
		}

		badReq := httptest.NewRequest(http.MethodPost, "/oauth/token", strings.NewReader(form.Encode()))
		badReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		badReq.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte("oac_1:wrong")))
		badRec := httptest.NewRecorder()
		mux.ServeHTTP(badRec, badReq)
		if badRec.Code != http.StatusUnauthorized {
			t.Errorf("expected 401 on bad Basic auth, got %d", badRec.Code)
		}
	})

	t.Run("POST /oauth/revoke returns 200 OK", func(t *testing.T) {
		coord.RevokeOAuthTokenFunc = func(_ context.Context, req *iam.RevokeOAuthTokenRequest) error {
			if req.Token != "sat_oat_tok1" {
				t.Fatalf("unexpected token %q", req.Token)
			}
			return nil
		}

		form := url.Values{"token": {"sat_oat_tok1"}}
		req := httptest.NewRequest(http.MethodPost, "/oauth/revoke", strings.NewReader(form.Encode()))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", rec.Code)
		}
	})
}
