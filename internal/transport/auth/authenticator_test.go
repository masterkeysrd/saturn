package transportauth

import (
	"context"
	stderrors "errors"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/token"
)

func TestAuthenticator_AuthenticateToken(t *testing.T) {
	now := time.Date(2026, 4, 15, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name           string
		rawToken       string
		setupMocks     func(tv *TokenValidatorMock, us *UserStoreProviderMock, ak *APIKeyStoreProviderMock, gr *APIKeyGrantProviderMock)
		wantErr        bool
		wantSubject    string
		wantAPIKeyID   string
		wantTouchCalls int
	}{
		{
			name:     "empty token returns Unauthenticated",
			rawToken: "   ",
			wantErr:  true,
		},
		{
			name:     "valid JWT succeeds",
			rawToken: "jwt_ok",
			setupMocks: func(tv *TokenValidatorMock, us *UserStoreProviderMock, _ *APIKeyStoreProviderMock, _ *APIKeyGrantProviderMock) {
				tv.ValidateAccessTokenFunc = func(_ string, _ time.Time) (*token.Claims, error) {
					return &token.Claims{
						Subject:     "usr_1",
						AccessLevel: "user",
						AuthVersion: 2,
						SessionID:   "ses_1",
					}, nil
				}
				us.GetAuthVersionFunc = func(_ context.Context, _ identity.UserID) (int64, error) {
					return 2, nil
				}
			},
			wantSubject: "usr_1",
		},
		{
			name:     "stale JWT auth_version fails",
			rawToken: "jwt_stale",
			setupMocks: func(tv *TokenValidatorMock, us *UserStoreProviderMock, _ *APIKeyStoreProviderMock, _ *APIKeyGrantProviderMock) {
				tv.ValidateAccessTokenFunc = func(_ string, _ time.Time) (*token.Claims, error) {
					return &token.Claims{Subject: "usr_1", AuthVersion: 1}, nil
				}
				us.GetAuthVersionFunc = func(_ context.Context, _ identity.UserID) (int64, error) {
					return 2, nil
				}
			},
			wantErr: true,
		},
		{
			name:     "valid API key succeeds and touches last_used",
			rawToken: "sat_validkey",
			setupMocks: func(_ *TokenValidatorMock, us *UserStoreProviderMock, ak *APIKeyStoreProviderMock, gr *APIKeyGrantProviderMock) {
				ak.GetByHashFunc = func(_ context.Context, _ string) (*identity.APIKey, error) {
					return &identity.APIKey{
						ID:     "apk_1",
						UserID: "usr_1",
						Scopes: []string{"finance:read"},
					}, nil
				}
				ak.TouchLastUsedFunc = func(_ context.Context, _ identity.APIKeyID, _ time.Time) error {
					return nil
				}
				us.GetByIDFunc = func(_ context.Context, _ identity.UserID) (*identity.User, error) {
					return &identity.User{ID: "usr_1", Status: identity.UserStatusActive, AccessLevel: identity.AccessLevelUser}, nil
				}
				gr.ListSpaceIDsByAPIKeyIDFunc = func(_ context.Context, _ string) ([]space.SpaceID, error) {
					return []space.SpaceID{"spc_000000000000000000000000001"}, nil
				}
			},
			wantSubject:    "usr_1",
			wantAPIKeyID:   "apk_1",
			wantTouchCalls: 1,
		},
		{
			name:     "expired API key fails",
			rawToken: "sat_expired",
			setupMocks: func(_ *TokenValidatorMock, _ *UserStoreProviderMock, ak *APIKeyStoreProviderMock, _ *APIKeyGrantProviderMock) {
				ak.GetByHashFunc = func(_ context.Context, _ string) (*identity.APIKey, error) {
					return &identity.APIKey{
						ID:        "apk_1",
						UserID:    "usr_1",
						ExpiresAt: new(now.Add(-time.Second)),
					}, nil
				}
			},
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tv := &TokenValidatorMock{}
			us := &UserStoreProviderMock{}
			ak := &APIKeyStoreProviderMock{}
			gr := &APIKeyGrantProviderMock{}
			if tc.setupMocks != nil {
				tc.setupMocks(tv, us, ak, gr)
			}

			a := NewAuthenticator(Config{
				TokenValidator: tv,
				UserStore:      us,
				APIKeyStore:    ak,
				GrantStore:     gr,
				NowFunc:        func() time.Time { return now },
			})

			res, err := a.AuthenticateToken(context.Background(), tc.rawToken)
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if errors.KindOf(err) != errors.Unauthenticated {
					t.Errorf("kind = %v, want Unauthenticated", errors.KindOf(err))
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res.Principal.Subject != tc.wantSubject || res.Principal.APIKeyID != tc.wantAPIKeyID {
				t.Errorf("got principal %+v, want subject=%q apiKey=%q", res.Principal, tc.wantSubject, tc.wantAPIKeyID)
			}
			if tc.wantTouchCalls > 0 {
				deadline := time.Now().Add(500 * time.Millisecond)
				for len(ak.TouchLastUsedCalls()) < tc.wantTouchCalls && time.Now().Before(deadline) {
					time.Sleep(10 * time.Millisecond)
				}
				if len(ak.TouchLastUsedCalls()) != tc.wantTouchCalls {
					t.Errorf("TouchLastUsedCalls = %d, want %d", len(ak.TouchLastUsedCalls()), tc.wantTouchCalls)
				}
			}
		})
	}
}

func TestAuthenticator_ResolveSpace(t *testing.T) {
	spc1, _ := space.NewSpaceID()
	spc2, _ := space.NewSpaceID()

	tests := []struct {
		name            string
		principal       auth.Principal
		explicitSpaceID string
		memberErr       error
		wantSpaceID     string
		wantRole        string
		wantKind        errors.Kind
	}{
		{
			name: "single-space API key auto-resolves",
			principal: auth.Principal{
				Subject:         "usr_1",
				APIKeyID:        "apk_1",
				GrantedSpaceIDs: []string{string(spc1)},
			},
			wantSpaceID: string(spc1),
			wantRole:    "member",
		},
		{
			name: "multi-space API key without explicit space returns Invalid",
			principal: auth.Principal{
				Subject:         "usr_1",
				APIKeyID:        "apk_1",
				GrantedSpaceIDs: []string{string(spc1), string(spc2)},
			},
			wantKind: errors.Invalid,
		},
		{
			name: "API key ungranted space returns Permission",
			principal: auth.Principal{
				Subject:         "usr_1",
				APIKeyID:        "apk_1",
				GrantedSpaceIDs: []string{string(spc1)},
			},
			explicitSpaceID: string(spc2),
			wantKind:        errors.Permission,
		},
		{
			name:            "JWT missing space returns Invalid",
			principal:       auth.Principal{Subject: "usr_1"},
			explicitSpaceID: "",
			wantKind:        errors.Invalid,
		},
		{
			name:            "non-member returns Permission",
			principal:       auth.Principal{Subject: "usr_1"},
			explicitSpaceID: string(spc1),
			memberErr:       stderrors.New("not a member"),
			wantKind:        errors.Permission,
		},
		{
			name:            "JWT with valid member succeeds",
			principal:       auth.Principal{Subject: "usr_1"},
			explicitSpaceID: string(spc1),
			wantSpaceID:     string(spc1),
			wantRole:        "member",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mb := &MemberStoreProviderMock{
				GetByIDFunc: func(_ context.Context, sid space.SpaceID, uid space.UserID) (*space.Member, error) {
					if tc.memberErr != nil {
						return nil, tc.memberErr
					}
					return &space.Member{SpaceID: sid, UserID: uid, Role: space.RoleMember}, nil
				},
			}
			a := NewAuthenticator(Config{MemberStore: mb})

			sc, err := a.ResolveSpace(context.Background(), tc.principal, tc.explicitSpaceID)
			if tc.wantKind != 0 {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if errors.KindOf(err) != tc.wantKind {
					t.Errorf("kind = %v, want %v (err: %v)", errors.KindOf(err), tc.wantKind, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if sc.SpaceID != tc.wantSpaceID || sc.Role != tc.wantRole {
				t.Errorf("got %+v, want space=%q role=%q", sc, tc.wantSpaceID, tc.wantRole)
			}
		})
	}
}
