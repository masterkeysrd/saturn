package iam

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"slices"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	platformoauth "github.com/masterkeysrd/saturn/internal/platform/oauth"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

func makePKCEPair() (verifier, challenge string) {
	verifier = "test_pkce_verifier_value_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	sum := sha256.Sum256([]byte(verifier))
	challenge = base64.RawURLEncoding.EncodeToString(sum[:])
	return verifier, challenge
}

func TestCoordinator_InspectOAuthConsent(t *testing.T) {
	const (
		userID   = identity.UserID("usr_000000000000000000000000001")
		spaceA   = "spc_000000000000000000000000001"
		spaceB   = "spc_000000000000000000000000002"
		clientWS = identity.OAuthClientID("oac_000000000000000000000000001")
		clientGL = identity.OAuthClientID("oac_000000000000000000000000002")
		cimdURL  = identity.OAuthClientID("https://client.example.com/oauth.json")
	)
	_, challenge := makePKCEPair()

	tests := []struct {
		name              string
		allowDCR          bool
		req               *InspectOAuthConsentRequest
		setupMocks        func(idSvc *IdentityServiceMock, spSvc *SpaceServiceMock, cimd *CIMDResolverMock)
		wantLockedSpaceID string
		wantScopes        []string
		wantErrKind       errors.Kind
		wantErrCode       errors.Code
		wantErr           bool
	}{
		{
			name: "Workspace client locks consent to its bound space",
			req: &InspectOAuthConsentRequest{
				UserID:              userID,
				ClientID:            string(clientWS),
				RedirectURI:         "https://connector.example.com/cb",
				ResponseType:        "code",
				Scopes:              []string{"finance:read", "finance:write"},
				CodeChallenge:       challenge,
				CodeChallengeMethod: "S256",
			},
			setupMocks: func(idSvc *IdentityServiceMock, spSvc *SpaceServiceMock, _ *CIMDResolverMock) {
				idSvc.GetOAuthClientFunc = func(_ context.Context, _ identity.OAuthClientID) (*identity.OAuthClient, error) {
					return &identity.OAuthClient{
						ID:            clientWS,
						SpaceID:       new(spaceA),
						Name:          "Workspace App",
						RedirectURIs:  []string{"https://connector.example.com/cb"},
						AllowedScopes: []string{"finance:read", "finance:write"},
					}, nil
				}
				spSvc.GetSpaceMemberFunc = func(_ context.Context, s space.Session) (*space.Member, error) {
					return &space.Member{SpaceID: s.SpaceID, UserID: s.UserID, Role: space.RoleMember}, nil
				}
				spSvc.GetSpaceFunc = func(_ context.Context, s space.Session) (*space.Space, error) {
					return &space.Space{ID: s.SpaceID, Name: "Space A"}, nil
				}
			},
			wantLockedSpaceID: spaceA,
			wantScopes:        []string{"finance:read", "finance:write"},
		},
		{
			name: "Workspace client rejects RFC 8707 resource targeting a different workspace",
			req: &InspectOAuthConsentRequest{
				UserID:              userID,
				ClientID:            string(clientWS),
				RedirectURI:         "https://connector.example.com/cb",
				ResponseType:        "code",
				CodeChallenge:       challenge,
				CodeChallengeMethod: "S256",
				Resource:            "https://saturn.example.com/spaces/" + spaceB + "/mcp",
			},
			setupMocks: func(idSvc *IdentityServiceMock, _ *SpaceServiceMock, _ *CIMDResolverMock) {
				idSvc.GetOAuthClientFunc = func(_ context.Context, _ identity.OAuthClientID) (*identity.OAuthClient, error) {
					return &identity.OAuthClient{
						ID:            clientWS,
						SpaceID:       new(spaceA),
						Name:          "Workspace App",
						RedirectURIs:  []string{"https://connector.example.com/cb"},
						AllowedScopes: []string{"finance:read"},
					}, nil
				}
			},
			wantErrKind: errors.Invalid,
			wantErrCode: identity.OAuthInvalidTarget,
			wantErr:     true,
		},
		{
			name: "Instance client lists spaces and caps viewer role to read-only",
			req: &InspectOAuthConsentRequest{
				UserID:              userID,
				ClientID:            string(clientGL),
				RedirectURI:         "http://127.0.0.1:9191/cb",
				ResponseType:        "code",
				Scopes:              []string{"finance:read", "finance:write"},
				CodeChallenge:       challenge,
				CodeChallengeMethod: "S256",
				Resource:            "https://saturn.example.com/spaces/" + spaceB + "/mcp",
			},
			setupMocks: func(idSvc *IdentityServiceMock, spSvc *SpaceServiceMock, _ *CIMDResolverMock) {
				idSvc.GetOAuthClientFunc = func(_ context.Context, _ identity.OAuthClientID) (*identity.OAuthClient, error) {
					return &identity.OAuthClient{
						ID:            clientGL,
						Name:          "CLI App",
						RedirectURIs:  []string{"http://127.0.0.1/cb"},
						AllowedScopes: []string{"finance:read", "finance:write"},
					}, nil
				}
				spSvc.GetSpaceMemberFunc = func(_ context.Context, s space.Session) (*space.Member, error) {
					return &space.Member{SpaceID: s.SpaceID, UserID: s.UserID, Role: space.RoleViewer}, nil
				}
				spSvc.GetSpaceFunc = func(_ context.Context, s space.Session) (*space.Space, error) {
					return &space.Space{ID: s.SpaceID, Name: "Space B"}, nil
				}
			},
			wantLockedSpaceID: spaceB,
			wantScopes:        []string{"finance:read"},
		},
		{
			name:     "CIMD URL rejected when AllowDynamicRegistration is false",
			allowDCR: false,
			req: &InspectOAuthConsentRequest{
				UserID:              userID,
				ClientID:            string(cimdURL),
				RedirectURI:         "https://client.example.com/cb",
				ResponseType:        "code",
				CodeChallenge:       challenge,
				CodeChallengeMethod: "S256",
			},
			wantErrKind: errors.Permission,
			wantErrCode: identity.OAuthRegistrationDisabled,
			wantErr:     true,
		},
		{
			name:     "CIMD URL resolves metadata and upserts client when enabled",
			allowDCR: true,
			req: &InspectOAuthConsentRequest{
				UserID:              userID,
				ClientID:            string(cimdURL),
				RedirectURI:         "https://client.example.com/cb",
				ResponseType:        "code",
				CodeChallenge:       challenge,
				CodeChallengeMethod: "S256",
			},
			setupMocks: func(idSvc *IdentityServiceMock, spSvc *SpaceServiceMock, cimd *CIMDResolverMock) {
				idSvc.GetOAuthClientFunc = func(_ context.Context, _ identity.OAuthClientID) (*identity.OAuthClient, error) {
					return nil, errors.E(errors.NotExist, identity.OAuthClientNotFound, "not cached")
				}
				cimd.FetchMetadataFunc = func(_ context.Context, url string, _ string) (*platformoauth.CIMDFetchResult, error) {
					return &platformoauth.CIMDFetchResult{
						Metadata: &platformoauth.CIMDMetadata{
							ClientID:     url,
							ClientName:   "Standards CIMD App",
							RedirectURIs: []string{"https://client.example.com/cb"},
							Scope:        "spaces:read finance:read",
						},
					}, nil
				}
				idSvc.UpsertCIMDOAuthClientFunc = func(_ context.Context, cl *identity.OAuthClient) (*identity.OAuthClient, error) {
					return cl, nil
				}
				spSvc.ListSpacesFunc = func(_ context.Context, _ space.UserID, _ *space.ListSpacesFilter) (*paging.Page[*space.Space], error) {
					return &paging.Page[*space.Space]{
						Items: []*space.Space{{ID: space.SpaceID(spaceA), Name: "Space A"}},
					}, nil
				}
				spSvc.GetSpaceMemberFunc = func(_ context.Context, s space.Session) (*space.Member, error) {
					return &space.Member{SpaceID: s.SpaceID, UserID: s.UserID, Role: space.RoleOwner}, nil
				}
			},
			wantScopes: []string{"spaces:read", "finance:read"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			idSvc := &IdentityServiceMock{}
			spSvc := &SpaceServiceMock{}
			cimd := &CIMDResolverMock{}
			if tc.setupMocks != nil {
				tc.setupMocks(idSvc, spSvc, cimd)
			}

			coord := NewCoordinator(Dependencies{
				IdentityService: idSvc,
				SpaceService:    spSvc,
				CIMDResolver:    cimd,
				OAuthConfig: OAuthConfig{
					AllowDynamicRegistration: tc.allowDCR,
				},
			})

			res, err := coord.InspectOAuthConsent(context.Background(), tc.req)
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tc.wantErrKind != 0 && errors.KindOf(err) != tc.wantErrKind {
					t.Fatalf("expected error kind %v, got %v", tc.wantErrKind, errors.KindOf(err))
				}
				if tc.wantErrCode != "" && errors.CodeOf(err) != tc.wantErrCode {
					t.Fatalf("expected error code %v, got %v", tc.wantErrCode, errors.CodeOf(err))
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res.LockedSpaceID != tc.wantLockedSpaceID {
				t.Errorf("LockedSpaceID = %q, want %q", res.LockedSpaceID, tc.wantLockedSpaceID)
			}
			if !slices.Equal(res.EffectiveScopes, tc.wantScopes) {
				t.Errorf("EffectiveScopes = %v, want %v", res.EffectiveScopes, tc.wantScopes)
			}
		})
	}
}

func TestCoordinator_ExchangeOAuthToken_And_RefreshPolicies(t *testing.T) {
	const (
		userID   = identity.UserID("usr_000000000000000000000000001")
		spaceID  = "spc_000000000000000000000000001"
		clientID = identity.OAuthClientID("oac_000000000000000000000000001")
	)
	verifier, challenge := makePKCEPair()
	rawSecret, _, secretHash, err := identity.GenerateOAuthClientSecret()
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name        string
		req         *ExchangeOAuthTokenRequest
		setupMocks  func(idSvc *IdentityServiceMock, spSvc *SpaceServiceMock)
		wantAT      string
		wantRT      string
		wantScope   string
		wantErrCode errors.Code
		wantErr     bool
	}{
		{
			name: "Authorization code exchange succeeds with valid client secret and PKCE",
			req: &ExchangeOAuthTokenRequest{
				GrantType:      "authorization_code",
				ClientID:       string(clientID),
				ClientSecret:   rawSecret,
				AuthMethodUsed: string(identity.TokenAuthMethodClientSecretBasic),
				Code:           "raw_code_123",
				RedirectURI:    "https://app.example.com/cb",
				CodeVerifier:   verifier,
			},
			setupMocks: func(idSvc *IdentityServiceMock, spSvc *SpaceServiceMock) {
				idSvc.GetOAuthClientFunc = func(_ context.Context, _ identity.OAuthClientID) (*identity.OAuthClient, error) {
					return &identity.OAuthClient{
						ID:                      clientID,
						SecretHash:              secretHash,
						AllowedScopes:           []string{"spaces:read", "finance:read"},
						TokenEndpointAuthMethod: identity.TokenAuthMethodClientSecretBasic,
						RefreshTokenPolicy:      identity.RefreshTokenPolicyRotate,
					}, nil
				}
				idSvc.ConsumeOAuthAuthCodeFunc = func(_ context.Context, _ *identity.OAuthClient, _, _, _, _ string) (*identity.OAuthAuthCode, error) {
					return &identity.OAuthAuthCode{
						ID:                  "oaz_1",
						Approved:            true,
						ClientID:            clientID,
						UserID:              userID,
						SpaceID:             spaceID,
						Scopes:              []string{"finance:read"},
						CodeChallenge:       challenge,
						CodeChallengeMethod: "S256",
					}, nil
				}
				idSvc.GetUserByIDFunc = func(_ context.Context, _ identity.UserID) (*identity.User, error) {
					return &identity.User{ID: userID, Status: identity.UserStatusActive}, nil
				}
				spSvc.GetSpaceMemberFunc = func(_ context.Context, _ space.Session) (*space.Member, error) {
					return &space.Member{SpaceID: space.SpaceID(spaceID), UserID: space.UserID(userID), Role: space.RoleMember}, nil
				}
				idSvc.CreateOAuthGrantAndIssueTokensFunc = func(_ context.Context, _ *identity.OAuthClient, _ identity.UserID, _ string, scopes []string, _, _ time.Duration, _, _ string) (*identity.IssueOAuthTokenResult, error) {
					return &identity.IssueOAuthTokenResult{
						Grant:        &identity.OAuthGrant{ID: "oag_1", UserID: userID, SpaceID: spaceID, Scopes: scopes},
						AccessToken:  "sat_oat_issued1",
						RefreshToken: "sat_ort_issued1",
						ExpiresIn:    3600,
					}, nil
				}
			},
			wantAT:    "sat_oat_issued1",
			wantRT:    "sat_ort_issued1",
			wantScope: "finance:read",
		},
		{
			name: "Wrong client secret fails with OAuthInvalidClient",
			req: &ExchangeOAuthTokenRequest{
				GrantType:      "authorization_code",
				ClientID:       string(clientID),
				ClientSecret:   "sat_ocs_wrong",
				AuthMethodUsed: string(identity.TokenAuthMethodClientSecretBasic),
				Code:           "raw_code_123",
			},
			setupMocks: func(idSvc *IdentityServiceMock, _ *SpaceServiceMock) {
				idSvc.GetOAuthClientFunc = func(_ context.Context, _ identity.OAuthClientID) (*identity.OAuthClient, error) {
					return &identity.OAuthClient{
						ID:                      clientID,
						SecretHash:              secretHash,
						TokenEndpointAuthMethod: identity.TokenAuthMethodClientSecretBasic,
					}, nil
				}
			},
			wantErrCode: identity.OAuthInvalidClient,
			wantErr:     true,
		},
		{
			name: "Refresh token persistent policy preserves refresh token",
			req: &ExchangeOAuthTokenRequest{
				GrantType:      "refresh_token",
				ClientID:       string(clientID),
				AuthMethodUsed: string(identity.TokenAuthMethodNone),
				RefreshToken:   "sat_ort_persistent_1",
			},
			setupMocks: func(idSvc *IdentityServiceMock, spSvc *SpaceServiceMock) {
				idSvc.GetOAuthClientFunc = func(_ context.Context, _ identity.OAuthClientID) (*identity.OAuthClient, error) {
					return &identity.OAuthClient{
						ID:                      clientID,
						TokenEndpointAuthMethod: identity.TokenAuthMethodNone,
						RefreshTokenPolicy:      identity.RefreshTokenPolicyPersistent,
					}, nil
				}
				idSvc.RefreshOAuthGrantFunc = func(_ context.Context, _ *identity.OAuthClient, rawRT string, _, _ time.Duration) (*identity.IssueOAuthTokenResult, error) {
					return &identity.IssueOAuthTokenResult{
						Grant:        &identity.OAuthGrant{ID: "oag_1", UserID: userID, SpaceID: spaceID, Scopes: []string{"spaces:read"}},
						AccessToken:  "sat_oat_refreshed",
						RefreshToken: rawRT,
						ExpiresIn:    3600,
					}, nil
				}
				idSvc.GetUserByIDFunc = func(_ context.Context, _ identity.UserID) (*identity.User, error) {
					return &identity.User{ID: userID, Status: identity.UserStatusActive}, nil
				}
				spSvc.GetSpaceMemberFunc = func(_ context.Context, _ space.Session) (*space.Member, error) {
					return &space.Member{SpaceID: space.SpaceID(spaceID), UserID: space.UserID(userID), Role: space.RoleMember}, nil
				}
			},
			wantAT:    "sat_oat_refreshed",
			wantRT:    "sat_ort_persistent_1",
			wantScope: "spaces:read",
		},
		{
			name: "Refresh token reuse outside grace window propagates OAuthGrantRevoked",
			req: &ExchangeOAuthTokenRequest{
				GrantType:      "refresh_token",
				ClientID:       string(clientID),
				AuthMethodUsed: string(identity.TokenAuthMethodNone),
				RefreshToken:   "sat_ort_replayed",
			},
			setupMocks: func(idSvc *IdentityServiceMock, _ *SpaceServiceMock) {
				idSvc.GetOAuthClientFunc = func(_ context.Context, _ identity.OAuthClientID) (*identity.OAuthClient, error) {
					return &identity.OAuthClient{
						ID:                      clientID,
						TokenEndpointAuthMethod: identity.TokenAuthMethodNone,
						RefreshTokenPolicy:      identity.RefreshTokenPolicyRotate,
					}, nil
				}
				idSvc.RefreshOAuthGrantFunc = func(_ context.Context, _ *identity.OAuthClient, _ string, _, _ time.Duration) (*identity.IssueOAuthTokenResult, error) {
					return nil, errors.E(errors.Unauthenticated, identity.OAuthGrantRevoked, "refresh token reused; grant revoked")
				}
			},
			wantErrCode: identity.OAuthGrantRevoked,
			wantErr:     true,
		},
		{
			name: "Unsupported grant type fails",
			req: &ExchangeOAuthTokenRequest{
				GrantType:      "client_credentials",
				ClientID:       string(clientID),
				AuthMethodUsed: string(identity.TokenAuthMethodNone),
			},
			setupMocks: func(idSvc *IdentityServiceMock, _ *SpaceServiceMock) {
				idSvc.GetOAuthClientFunc = func(_ context.Context, _ identity.OAuthClientID) (*identity.OAuthClient, error) {
					return &identity.OAuthClient{
						ID:                      clientID,
						TokenEndpointAuthMethod: identity.TokenAuthMethodNone,
					}, nil
				}
			},
			wantErrCode: identity.OAuthUnsupportedGrantType,
			wantErr:     true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			idSvc := &IdentityServiceMock{}
			spSvc := &SpaceServiceMock{}
			if tc.setupMocks != nil {
				tc.setupMocks(idSvc, spSvc)
			}

			coord := NewCoordinator(Dependencies{
				IdentityService: idSvc,
				SpaceService:    spSvc,
			})

			res, err := coord.ExchangeOAuthToken(context.Background(), tc.req)
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tc.wantErrCode != "" && errors.CodeOf(err) != tc.wantErrCode {
					t.Fatalf("expected error code %q, got %q", tc.wantErrCode, errors.CodeOf(err))
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res.AccessToken != tc.wantAT || res.RefreshToken != tc.wantRT || res.Scope != tc.wantScope {
				t.Errorf("unexpected token response: %+v", res)
			}
		})
	}
}

func TestCoordinator_ConsumeOAuthRedirectHandoff_And_DCR(t *testing.T) {
	t.Run("ConsumeOAuthRedirectHandoff appends code and state on approval and error on denial", func(t *testing.T) {
		idSvc := &IdentityServiceMock{}
		coord := NewCoordinator(Dependencies{IdentityService: idSvc})

		idSvc.ConsumeOAuthRedirectHandoffFunc = func(_ context.Context, _ string) (*identity.OAuthAuthCode, string, error) {
			return &identity.OAuthAuthCode{
				Approved:    true,
				RedirectURI: "https://client.example.com/cb?foo=bar",
				State:       "xyz",
			}, "code_abc", nil
		}
		res, err := coord.ConsumeOAuthRedirectHandoff(context.Background(), &ConsumeOAuthRedirectHandoffRequest{HandoffToken: "h1"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.RedirectURL != "https://client.example.com/cb?code=code_abc&foo=bar&state=xyz" {
			t.Errorf("unexpected redirect URL: %s", res.RedirectURL)
		}

		idSvc.ConsumeOAuthRedirectHandoffFunc = func(_ context.Context, _ string) (*identity.OAuthAuthCode, string, error) {
			return &identity.OAuthAuthCode{
				Approved:    false,
				RedirectURI: "https://client.example.com/cb",
				State:       "xyz",
			}, "", nil
		}
		deniedRes, err := coord.ConsumeOAuthRedirectHandoff(context.Background(), &ConsumeOAuthRedirectHandoffRequest{HandoffToken: "h2"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if deniedRes.RedirectURL != "https://client.example.com/cb?error=access_denied&error_description=The+resource+owner+denied+the+authorization+request&state=xyz" {
			t.Errorf("unexpected denied redirect URL: %s", deniedRes.RedirectURL)
		}
	})

	t.Run("RegisterDynamicOAuthClient enforces config toggle and verifies workspace existence", func(t *testing.T) {
		disabledCoord := NewCoordinator(Dependencies{
			OAuthConfig: OAuthConfig{AllowDynamicRegistration: false},
		})
		_, err := disabledCoord.RegisterDynamicOAuthClient(context.Background(), &RegisterDynamicOAuthClientRequest{
			Name:         "Blocked DCR",
			RedirectURIs: []string{"https://app.example.com/cb"},
		})
		if errors.CodeOf(err) != identity.OAuthRegistrationDisabled {
			t.Fatalf("expected OAuthRegistrationDisabled, got %v", err)
		}

		idSvc := &IdentityServiceMock{}
		spSvc := &SpaceServiceMock{}
		spSvc.SpaceExistsFunc = func(_ context.Context, _ space.SpaceID) (bool, error) {
			return true, nil
		}
		idSvc.CreateOAuthClientFunc = func(_ context.Context, params identity.CreateOAuthClientParams) (*identity.OAuthClient, error) {
			return &identity.OAuthClient{
				ID:                 "oac_dcr1",
				SpaceID:            params.SpaceID,
				Name:               params.Name,
				RedirectURIs:       params.RedirectURIs,
				AllowedScopes:      params.AllowedScopes,
				RegistrationSource: params.RegistrationSource,
			}, nil
		}
		enabledCoord := NewCoordinator(Dependencies{
			IdentityService: idSvc,
			SpaceService:    spSvc,
			OAuthConfig:     OAuthConfig{AllowDynamicRegistration: true},
		})
		spaceID := "spc_000000000000000000000000001"
		cl, err := enabledCoord.RegisterDynamicOAuthClient(context.Background(), &RegisterDynamicOAuthClientRequest{
			SpaceID:                 new(spaceID),
			Name:                    "Workspace DCR",
			RedirectURIs:            []string{"https://app.example.com/cb"},
			TokenEndpointAuthMethod: "none",
		})
		if err != nil {
			t.Fatalf("unexpected DCR error: %v", err)
		}
		if cl.SpaceID == nil || *cl.SpaceID != spaceID || cl.RegistrationSource != identity.RegistrationSourceDCR {
			t.Errorf("unexpected DCR client: %+v", cl)
		}
	})
}
