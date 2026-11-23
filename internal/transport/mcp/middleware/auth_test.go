package middleware

import (
	"context"
	stderrors "errors"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	platformerrors "github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/token"
)

func TestAuthMiddleware(t *testing.T) {
	const (
		validSpace1 = "spc_000000000000000000000000001"
		validSpace2 = "spc_000000000000000000000000002"
		validUserID = "usr_000000000000000000000000001"
		validAPIKey = "sat_testkey1234567890"
	)

	now := time.Date(2026, 4, 15, 12, 0, 0, 0, time.UTC)
	origTimeNow := timeNow
	timeNow = func() time.Time { return now }
	t.Cleanup(func() { timeNow = origTimeNow })

	tests := []struct {
		name           string
		method         string
		target         string
		headers        map[string]string
		setupMocks     func(tv *TokenValidatorMock, us *UserStoreProviderMock, ak *APIKeyStoreProviderMock, gr *APIKeyGrantProviderMock, mb *MemberStoreProviderMock)
		wantStatus     int
		wantSpaceID    string
		wantSpaceRole  string
		wantPrincipal  string
		wantAPIKeyID   string
		wantTouchCount int
	}{
		{
			name:   "rejects query param api_key with 400",
			method: http.MethodPost,
			target: "/mcp?api_key=sat_secret",
			headers: map[string]string{
				"Authorization": "Bearer " + validAPIKey,
			},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:   "rejects query param token with 400",
			method: http.MethodPost,
			target: "/mcp?token=jwt_secret",
			headers: map[string]string{
				"Authorization": "Bearer some.jwt.token",
			},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "rejects missing authorization header with 401",
			method:     http.MethodPost,
			target:     "/mcp",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:   "rejects expired api key with 401",
			method: http.MethodPost,
			target: "/mcp",
			headers: map[string]string{
				"Authorization": "Bearer " + validAPIKey,
			},
			setupMocks: func(_ *TokenValidatorMock, _ *UserStoreProviderMock, ak *APIKeyStoreProviderMock, _ *APIKeyGrantProviderMock, _ *MemberStoreProviderMock) {
				ak.GetByHashFunc = func(_ context.Context, _ string) (*identity.APIKey, error) {
					return &identity.APIKey{
						ID:        "apk_1",
						UserID:    validUserID,
						Scopes:    []string{"finance:read"},
						ExpiresAt: new(now.Add(-time.Minute)),
					}, nil
				}
			},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:   "valid api key auto-resolves single granted space",
			method: http.MethodPost,
			target: "/mcp",
			headers: map[string]string{
				"Authorization": "Bearer " + validAPIKey,
			},
			setupMocks: func(_ *TokenValidatorMock, us *UserStoreProviderMock, ak *APIKeyStoreProviderMock, gr *APIKeyGrantProviderMock, mb *MemberStoreProviderMock) {
				ak.GetByHashFunc = func(_ context.Context, _ string) (*identity.APIKey, error) {
					return &identity.APIKey{
						ID:     "apk_1",
						UserID: validUserID,
						Scopes: []string{"finance:read", "spaces:read"},
					}, nil
				}
				ak.TouchLastUsedFunc = func(_ context.Context, _ identity.APIKeyID, _ time.Time) error {
					return nil
				}
				us.GetByIDFunc = func(_ context.Context, _ identity.UserID) (*identity.User, error) {
					return &identity.User{
						ID:          validUserID,
						Status:      identity.UserStatusActive,
						AccessLevel: identity.AccessLevelUser,
					}, nil
				}
				gr.ListSpaceIDsByAPIKeyIDFunc = func(_ context.Context, _ string) ([]space.SpaceID, error) {
					return []space.SpaceID{validSpace1}, nil
				}
				mb.GetByIDFunc = func(_ context.Context, sid space.SpaceID, uid space.UserID) (*space.Member, error) {
					if sid != validSpace1 || uid != validUserID {
						return nil, stderrors.New("unexpected lookup")
					}
					return &space.Member{
						SpaceID: sid,
						UserID:  uid,
						Role:    space.RoleMember,
					}, nil
				}
			},
			wantStatus:     http.StatusOK,
			wantSpaceID:    validSpace1,
			wantSpaceRole:  "member",
			wantPrincipal:  validUserID,
			wantAPIKeyID:   "apk_1",
			wantTouchCount: 1,
		},
		{
			name:   "api key with multiple grants without Space-Id returns 400",
			method: http.MethodPost,
			target: "/mcp",
			headers: map[string]string{
				"Authorization": "Bearer " + validAPIKey,
			},
			setupMocks: func(_ *TokenValidatorMock, us *UserStoreProviderMock, ak *APIKeyStoreProviderMock, gr *APIKeyGrantProviderMock, _ *MemberStoreProviderMock) {
				ak.GetByHashFunc = func(_ context.Context, _ string) (*identity.APIKey, error) {
					return &identity.APIKey{
						ID:         "apk_1",
						UserID:     validUserID,
						Scopes:     []string{"finance:read"},
						LastUsedAt: new(now),
					}, nil
				}
				us.GetByIDFunc = func(_ context.Context, _ identity.UserID) (*identity.User, error) {
					return &identity.User{ID: validUserID, Status: identity.UserStatusActive}, nil
				}
				gr.ListSpaceIDsByAPIKeyIDFunc = func(_ context.Context, _ string) ([]space.SpaceID, error) {
					return []space.SpaceID{validSpace1, validSpace2}, nil
				}
			},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:   "api key resolves space from /api/spaces/{space_id}/mcp path",
			method: http.MethodPost,
			target: "/api/spaces/" + validSpace2 + "/mcp",
			headers: map[string]string{
				"Authorization": "Bearer " + validAPIKey,
			},
			setupMocks: func(_ *TokenValidatorMock, us *UserStoreProviderMock, ak *APIKeyStoreProviderMock, gr *APIKeyGrantProviderMock, mb *MemberStoreProviderMock) {
				ak.GetByHashFunc = func(_ context.Context, _ string) (*identity.APIKey, error) {
					return &identity.APIKey{
						ID:         "apk_2",
						UserID:     validUserID,
						Scopes:     []string{"finance:read"},
						LastUsedAt: new(now),
					}, nil
				}
				us.GetByIDFunc = func(_ context.Context, _ identity.UserID) (*identity.User, error) {
					return &identity.User{ID: validUserID, Status: identity.UserStatusActive}, nil
				}
				gr.ListSpaceIDsByAPIKeyIDFunc = func(_ context.Context, _ string) ([]space.SpaceID, error) {
					return []space.SpaceID{validSpace1, validSpace2}, nil
				}
				mb.GetByIDFunc = func(_ context.Context, sid space.SpaceID, uid space.UserID) (*space.Member, error) {
					return &space.Member{SpaceID: sid, UserID: uid, Role: space.RoleOwner}, nil
				}
			},
			wantStatus:    http.StatusOK,
			wantSpaceID:   validSpace2,
			wantSpaceRole: "owner",
			wantPrincipal: validUserID,
			wantAPIKeyID:  "apk_2",
		},
		{
			name:   "api key targeting ungranted space returns 403",
			method: http.MethodPost,
			target: "/mcp",
			headers: map[string]string{
				"Authorization": "Bearer " + validAPIKey,
				"Space-Id":      validSpace2,
			},
			setupMocks: func(_ *TokenValidatorMock, us *UserStoreProviderMock, ak *APIKeyStoreProviderMock, gr *APIKeyGrantProviderMock, _ *MemberStoreProviderMock) {
				ak.GetByHashFunc = func(_ context.Context, _ string) (*identity.APIKey, error) {
					return &identity.APIKey{
						ID:         "apk_1",
						UserID:     validUserID,
						Scopes:     []string{"finance:read"},
						LastUsedAt: new(now),
					}, nil
				}
				us.GetByIDFunc = func(_ context.Context, _ identity.UserID) (*identity.User, error) {
					return &identity.User{ID: validUserID, Status: identity.UserStatusActive}, nil
				}
				gr.ListSpaceIDsByAPIKeyIDFunc = func(_ context.Context, _ string) ([]space.SpaceID, error) {
					return []space.SpaceID{validSpace1}, nil
				}
			},
			wantStatus: http.StatusForbidden,
		},
		{
			name:   "valid JWT with matching auth_version and Space-Id succeeds",
			method: http.MethodPost,
			target: "/mcp",
			headers: map[string]string{
				"Authorization": "Bearer jwt_valid",
				"Space-Id":      validSpace1,
			},
			setupMocks: func(tv *TokenValidatorMock, us *UserStoreProviderMock, _ *APIKeyStoreProviderMock, _ *APIKeyGrantProviderMock, mb *MemberStoreProviderMock) {
				tv.ValidateAccessTokenFunc = func(_ string, _ time.Time) (*token.Claims, error) {
					return &token.Claims{
						Subject:     validUserID,
						AccessLevel: "user",
						AuthVersion: 3,
						SessionID:   "ses_1",
					}, nil
				}
				us.GetAuthVersionFunc = func(_ context.Context, _ identity.UserID) (int64, error) {
					return 3, nil
				}
				mb.GetByIDFunc = func(_ context.Context, sid space.SpaceID, uid space.UserID) (*space.Member, error) {
					return &space.Member{SpaceID: sid, UserID: uid, Role: space.RoleViewer}, nil
				}
			},
			wantStatus:    http.StatusOK,
			wantSpaceID:   validSpace1,
			wantSpaceRole: "viewer",
			wantPrincipal: validUserID,
		},
		{
			name:   "JWT with stale auth_version returns 401",
			method: http.MethodPost,
			target: "/mcp",
			headers: map[string]string{
				"Authorization": "Bearer jwt_stale",
				"Space-Id":      validSpace1,
			},
			setupMocks: func(tv *TokenValidatorMock, us *UserStoreProviderMock, _ *APIKeyStoreProviderMock, _ *APIKeyGrantProviderMock, _ *MemberStoreProviderMock) {
				tv.ValidateAccessTokenFunc = func(_ string, _ time.Time) (*token.Claims, error) {
					return &token.Claims{
						Subject:     validUserID,
						AuthVersion: 1,
					}, nil
				}
				us.GetAuthVersionFunc = func(_ context.Context, _ identity.UserID) (int64, error) {
					return 2, nil
				}
			},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:   "JWT missing Space-Id returns 400",
			method: http.MethodPost,
			target: "/mcp",
			headers: map[string]string{
				"Authorization": "Bearer jwt_valid",
			},
			setupMocks: func(tv *TokenValidatorMock, us *UserStoreProviderMock, _ *APIKeyStoreProviderMock, _ *APIKeyGrantProviderMock, _ *MemberStoreProviderMock) {
				tv.ValidateAccessTokenFunc = func(_ string, _ time.Time) (*token.Claims, error) {
					return &token.Claims{
						Subject:     validUserID,
						AuthVersion: 1,
					}, nil
				}
				us.GetAuthVersionFunc = func(_ context.Context, _ identity.UserID) (int64, error) {
					return 1, nil
				}
			},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:   "non-member returns 403",
			method: http.MethodPost,
			target: "/mcp",
			headers: map[string]string{
				"Authorization": "Bearer jwt_valid",
				"Space-Id":      validSpace1,
			},
			setupMocks: func(tv *TokenValidatorMock, us *UserStoreProviderMock, _ *APIKeyStoreProviderMock, _ *APIKeyGrantProviderMock, mb *MemberStoreProviderMock) {
				tv.ValidateAccessTokenFunc = func(_ string, _ time.Time) (*token.Claims, error) {
					return &token.Claims{
						Subject:     validUserID,
						AuthVersion: 1,
					}, nil
				}
				us.GetAuthVersionFunc = func(_ context.Context, _ identity.UserID) (int64, error) {
					return 1, nil
				}
				mb.GetByIDFunc = func(_ context.Context, _ space.SpaceID, _ space.UserID) (*space.Member, error) {
					return nil, stderrors.New("not found")
				}
			},
			wantStatus: http.StatusForbidden,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tv := &TokenValidatorMock{}
			us := &UserStoreProviderMock{}
			ak := &APIKeyStoreProviderMock{}
			gr := &APIKeyGrantProviderMock{}
			mb := &MemberStoreProviderMock{}

			if tc.setupMocks != nil {
				tc.setupMocks(tv, us, ak, gr, mb)
			}

			mw := AuthMiddleware(AuthConfig{
				TokenValidator: tv,
				UserStore:      us,
				APIKeyStore:    ak,
				GrantStore:     gr,
				MemberStore:    mb,
				AuthCacheTTL:   0,
				MemberCacheTTL: 0,
			})

			var gotSpaceID, gotRole, gotSubject, gotAPIKeyID string
			var gotScopes []string
			next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotSpaceID, _ = auth.SpaceIDFromContext(r.Context())
				gotRole, _ = auth.SpaceRoleFromContext(r.Context())
				p, _ := auth.PrincipalFromContext(r.Context())
				gotSubject = p.Subject
				gotAPIKeyID = p.APIKeyID
				gotScopes = p.Scopes
				w.WriteHeader(http.StatusOK)
			})

			req := httptest.NewRequest(tc.method, tc.target, nil)
			for k, v := range tc.headers {
				req.Header.Set(k, v)
			}
			rec := httptest.NewRecorder()
			mw(next).ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d (body: %s)", rec.Code, tc.wantStatus, rec.Body.String())
			}

			if tc.wantStatus == http.StatusOK {
				if gotSpaceID != tc.wantSpaceID {
					t.Errorf("space_id = %q, want %q", gotSpaceID, tc.wantSpaceID)
				}
				if gotRole != tc.wantSpaceRole {
					t.Errorf("space_role = %q, want %q", gotRole, tc.wantSpaceRole)
				}
				if gotSubject != tc.wantPrincipal {
					t.Errorf("principal.Subject = %q, want %q", gotSubject, tc.wantPrincipal)
				}
				if gotAPIKeyID != tc.wantAPIKeyID {
					t.Errorf("principal.APIKeyID = %q, want %q", gotAPIKeyID, tc.wantAPIKeyID)
				}
				if tc.wantAPIKeyID != "" && !slices.Contains(gotScopes, "finance:read") {
					t.Errorf("expected scopes to include finance:read, got %v", gotScopes)
				}
				if tc.wantTouchCount > 0 {
					deadline := time.Now().Add(500 * time.Millisecond)
					for len(ak.TouchLastUsedCalls()) < tc.wantTouchCount && time.Now().Before(deadline) {
						time.Sleep(10 * time.Millisecond)
					}
					if got := len(ak.TouchLastUsedCalls()); got != tc.wantTouchCount {
						t.Errorf("TouchLastUsedCalls = %d, want %d", got, tc.wantTouchCount)
					}
				}
			}
		})
	}
}

func TestFormatToolError(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		wantNil  bool
		wantMsg  string
		notShown string
	}{
		{
			name:    "nil error",
			err:     nil,
			wantNil: true,
		},
		{
			name:     "sanitizes raw non-platform error",
			err:      stderrors.New("pq: password authentication failed for user postgres"),
			wantMsg:  "internal error: operation failed",
			notShown: "postgres",
		},
		{
			name:     "sanitizes internal platform error",
			err:      platformerrors.E(platformerrors.Internal, "db connection refused at 10.0.0.5"),
			wantMsg:  "internal error: please try again later",
			notShown: "10.0.0.5",
		},
		{
			name:    "exposes user message for invalid platform error",
			err:     platformerrors.E(platformerrors.Invalid, platformerrors.Code("BAD_AMOUNT"), "amount must be positive"),
			wantMsg: "amount must be positive (invalid: BAD_AMOUNT)",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := FormatToolError(tc.err)
			if tc.wantNil {
				if got != nil {
					t.Fatalf("expected nil, got %v", got)
				}
				return
			}
			if got == nil {
				t.Fatal("expected error, got nil")
			}
			if got.Error() != tc.wantMsg {
				t.Errorf("got %q, want %q", got.Error(), tc.wantMsg)
			}
			if tc.notShown != "" && slices.Contains([]string{got.Error()}, tc.notShown) {
				t.Errorf("leaked sensitive text %q in %q", tc.notShown, got.Error())
			}
		})
	}
}

func TestAuthMiddleware_DynamicWWWAuthenticateResourceMetadata(t *testing.T) {
	mw := AuthMiddleware(AuthConfig{
		IssuerURL: "https://saturn.example.com",
	})
	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	tests := []struct {
		name     string
		target   string
		wantHdr  string
	}{
		{
			name:    "instance /mcp points to /.well-known/oauth-protected-resource/mcp",
			target:  "/mcp",
			wantHdr: `Bearer resource_metadata="https://saturn.example.com/.well-known/oauth-protected-resource/mcp"`,
		},
		{
			name:    "workspace /spaces/spc_1/mcp points to /.well-known/oauth-protected-resource/spaces/spc_1/mcp",
			target:  "/spaces/spc_1/mcp",
			wantHdr: `Bearer resource_metadata="https://saturn.example.com/.well-known/oauth-protected-resource/spaces/spc_1/mcp"`,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, tc.target, nil)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want 401", rec.Code)
			}
			if got := rec.Header().Get("WWW-Authenticate"); got != tc.wantHdr {
				t.Errorf("WWW-Authenticate = %q, want %q", got, tc.wantHdr)
			}
		})
	}
}
