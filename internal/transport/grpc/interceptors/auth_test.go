package interceptors

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

type mockUserStoreProvider struct {
	GetAuthVersionFunc func(ctx context.Context, id identity.UserID) (int64, error)
	GetByIDFunc        func(ctx context.Context, id identity.UserID) (*identity.User, error)
}

func (m *mockUserStoreProvider) GetAuthVersion(ctx context.Context, id identity.UserID) (int64, error) {
	if m.GetAuthVersionFunc != nil {
		return m.GetAuthVersionFunc(ctx, id)
	}
	return 1, nil
}

func (m *mockUserStoreProvider) GetByID(ctx context.Context, id identity.UserID) (*identity.User, error) {
	if m.GetByIDFunc != nil {
		return m.GetByIDFunc(ctx, id)
	}
	return &identity.User{
		ID:          id,
		Status:      identity.UserStatusActive,
		AccessLevel: identity.AccessLevelUser,
	}, nil
}

type mockAPIKeyStoreProvider struct {
	GetByHashFunc     func(ctx context.Context, keyHash string) (*identity.APIKey, error)
	TouchLastUsedFunc func(ctx context.Context, id identity.APIKeyID, lastUsedAt time.Time) error
}

func (m *mockAPIKeyStoreProvider) GetByHash(ctx context.Context, keyHash string) (*identity.APIKey, error) {
	if m.GetByHashFunc != nil {
		return m.GetByHashFunc(ctx, keyHash)
	}
	return nil, errors.New("not found")
}

func (m *mockAPIKeyStoreProvider) TouchLastUsed(ctx context.Context, id identity.APIKeyID, lastUsedAt time.Time) error {
	if m.TouchLastUsedFunc != nil {
		return m.TouchLastUsedFunc(ctx, id, lastUsedAt)
	}
	return nil
}

type mockAPIKeyGrantProvider struct {
	ListSpaceIDsFunc func(ctx context.Context, apiKeyID string) ([]space.SpaceID, error)
}

func (m *mockAPIKeyGrantProvider) ListSpaceIDsByAPIKeyID(ctx context.Context, apiKeyID string) ([]space.SpaceID, error) {
	if m.ListSpaceIDsFunc != nil {
		return m.ListSpaceIDsFunc(ctx, apiKeyID)
	}
	return nil, nil
}

func TestResolvePolicy(t *testing.T) {
	rules := []api.AuthRule{
		{
			Selector:     "*",
			AuthRequired: true,
		},
		{
			Selector:     "saturn.identity.v1.Identity.LoginUser",
			AuthRequired: false,
		},
		{
			Selector:     "saturn.identity.v1.Identity.RegisterUser",
			AuthRequired: false,
		},
		{
			Selector:     "saturn.identity.admin.v1.AdminIdentity.*",
			AuthRequired: true,
			AccessLevels: []string{"admin"},
		},
		{
			Selector:     "saturn.finance.v1.Finance.ListBudgets",
			AuthRequired: true,
			APIKeyScopes: []string{"finance:read", "finance:write"},
		},
	}

	interceptor := NewAuthInterceptor(nil, &mockUserStoreProvider{}, nil, nil, rules)

	tests := []struct {
		name                 string
		grpcMethod           string
		expectedAuthRequired bool
		expectedAccessLevels []string
		expectedScopes       []string
	}{
		{
			name:                 "Public endpoint - LoginUser",
			grpcMethod:           "/saturn.identity.v1.Identity/LoginUser",
			expectedAuthRequired: false,
		},
		{
			name:                 "Public endpoint - RegisterUser",
			grpcMethod:           "/saturn.identity.v1.Identity/RegisterUser",
			expectedAuthRequired: false,
		},
		{
			name:                 "Default secure endpoint - RefreshSession",
			grpcMethod:           "/saturn.identity.v1.Identity/RefreshSession",
			expectedAuthRequired: true,
		},
		{
			name:                 "Admin wildcard endpoint - ListUsers",
			grpcMethod:           "/saturn.identity.admin.v1.AdminIdentity/ListUsers",
			expectedAuthRequired: true,
			expectedAccessLevels: []string{"admin"},
		},
		{
			name:                 "Finance read endpoint with API key scopes",
			grpcMethod:           "/saturn.finance.v1.Finance/ListBudgets",
			expectedAuthRequired: true,
			expectedScopes:       []string{"finance:read", "finance:write"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			policy, _ := interceptor.resolvePolicy(tc.grpcMethod)
			if policy.AuthRequired != tc.expectedAuthRequired {
				t.Errorf("expected AuthRequired=%v, got %v", tc.expectedAuthRequired, policy.AuthRequired)
			}
			if len(policy.AccessLevels) != len(tc.expectedAccessLevels) {
				t.Errorf("expected AccessLevels=%v, got %v", tc.expectedAccessLevels, policy.AccessLevels)
			}
			if len(policy.APIKeyScopes) != len(tc.expectedScopes) {
				t.Errorf("expected APIKeyScopes=%v, got %v", tc.expectedScopes, policy.APIKeyScopes)
			}
		})
	}

	t.Run("Fail-closed fallback when no rule matches", func(t *testing.T) {
		noRules := NewAuthInterceptor(nil, &mockUserStoreProvider{}, nil, nil, nil)
		policy, _ := noRules.resolvePolicy("/saturn.new.v1.Service/SecretMethod")
		if !policy.AuthRequired {
			t.Errorf("expected unmatched RPC to fail closed (AuthRequired=true)")
		}
	})
}

func TestAuthInterceptor_APIKey(t *testing.T) {
	rules := []api.AuthRule{
		{Selector: "*", AuthRequired: true},
		{Selector: "saturn.identity.v1.Identity.*", AuthRequired: true},
		{Selector: "saturn.finance.v1.Finance.ListBudgets", AuthRequired: true, APIKeyScopes: []string{"finance:read", "finance:write"}},
		{Selector: "saturn.finance.v1.Finance.CreateBudget", AuthRequired: true, APIKeyScopes: []string{"finance:write"}},
	}

	rawToken := "sat_test_token_12345678901234567890"
	tokenHash := identity.HashAPIKeyToken(rawToken)
	spc1, _ := space.NewSpaceID()

	tests := []struct {
		name      string
		method    string
		key       *identity.APIKey
		user      *identity.User
		grants    []space.SpaceID
		wantCode  codes.Code
		wantTouch bool
	}{
		{
			name:   "Valid API key with matching scope",
			method: "/saturn.finance.v1.Finance/ListBudgets",
			key: &identity.APIKey{
				ID:     "apk_1",
				UserID: "usr_1",
				Scopes: []string{"finance:read"},
			},
			grants:    []space.SpaceID{spc1},
			wantTouch: true,
		},
		{
			name:   "API key debounces touch when recently used",
			method: "/saturn.finance.v1.Finance/ListBudgets",
			key: &identity.APIKey{
				ID:         "apk_1",
				UserID:     "usr_1",
				Scopes:     []string{"finance:read"},
				LastUsedAt: new(time.Now()),
			},
			grants:    []space.SpaceID{spc1},
			wantTouch: false,
		},
		{
			name:   "Insufficient scope rejected with PermissionDenied",
			method: "/saturn.finance.v1.Finance/CreateBudget",
			key: &identity.APIKey{
				ID:     "apk_1",
				UserID: "usr_1",
				Scopes: []string{"finance:read"},
			},
			grants:   []space.SpaceID{spc1},
			wantCode: codes.PermissionDenied,
		},
		{
			name:   "Default-deny Identity endpoint rejected with PermissionDenied",
			method: "/saturn.identity.v1.Identity/CreateAPIKey",
			key: &identity.APIKey{
				ID:     "apk_1",
				UserID: "usr_1",
				Scopes: []string{"finance:read", "finance:write"},
			},
			grants:   []space.SpaceID{spc1},
			wantCode: codes.PermissionDenied,
		},
		{
			name:   "Expired API key rejected with Unauthenticated",
			method: "/saturn.finance.v1.Finance/ListBudgets",
			key: &identity.APIKey{
				ID:        "apk_1",
				UserID:    "usr_1",
				Scopes:    []string{"finance:read"},
				ExpiresAt: new(time.Now().Add(-time.Minute)),
			},
			grants:   []space.SpaceID{spc1},
			wantCode: codes.Unauthenticated,
		},
		{
			name:   "No active space grants rejected with Unauthenticated",
			method: "/saturn.finance.v1.Finance/ListBudgets",
			key: &identity.APIKey{
				ID:     "apk_1",
				UserID: "usr_1",
				Scopes: []string{"finance:read"},
			},
			grants:   nil,
			wantCode: codes.Unauthenticated,
		},
		{
			name:   "Inactive user rejected with Unauthenticated",
			method: "/saturn.finance.v1.Finance/ListBudgets",
			key: &identity.APIKey{
				ID:     "apk_1",
				UserID: "usr_1",
				Scopes: []string{"finance:read"},
			},
			user: &identity.User{
				ID:          "usr_1",
				Status:      identity.UserStatusSuspended,
				AccessLevel: identity.AccessLevelUser,
			},
			grants:   []space.SpaceID{spc1},
			wantCode: codes.Unauthenticated,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			touched := make(chan struct{}, 1)
			uStore := &mockUserStoreProvider{
				GetByIDFunc: func(ctx context.Context, id identity.UserID) (*identity.User, error) {
					if tc.user != nil {
						return tc.user, nil
					}
					return &identity.User{ID: id, Status: identity.UserStatusActive, AccessLevel: identity.AccessLevelUser}, nil
				},
			}
			kStore := &mockAPIKeyStoreProvider{
				GetByHashFunc: func(ctx context.Context, keyHash string) (*identity.APIKey, error) {
					if keyHash != tokenHash || tc.key == nil {
						return nil, errors.New("not found")
					}
					return tc.key, nil
				},
				TouchLastUsedFunc: func(ctx context.Context, id identity.APIKeyID, lastUsedAt time.Time) error {
					select {
					case touched <- struct{}{}:
					default:
					}
					return nil
				},
			}
			gStore := &mockAPIKeyGrantProvider{
				ListSpaceIDsFunc: func(ctx context.Context, apiKeyID string) ([]space.SpaceID, error) {
					return tc.grants, nil
				},
			}

			ai := NewAuthInterceptor(nil, uStore, kStore, gStore, rules)
			ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+rawToken))
			outCtx, err := ai.intercept(ctx, tc.method)
			if tc.wantCode != codes.OK {
				if err == nil {
					t.Fatalf("expected gRPC status %v, got nil", tc.wantCode)
				}
				if status.Code(err) != tc.wantCode {
					t.Fatalf("expected gRPC status %v, got %v (%v)", tc.wantCode, status.Code(err), err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			p, ok := auth.PrincipalFromContext(outCtx)
			if !ok || !p.IsAPIKey() || p.APIKeyID != "apk_1" {
				t.Fatalf("unexpected principal: ok=%v p=%+v", ok, p)
			}
			if tc.wantTouch {
				select {
				case <-touched:
				case <-time.After(500 * time.Millisecond):
					t.Error("expected TouchLastUsed to be called asynchronously")
				}
			}
		})
	}
}

func TestAuthInterceptor_AuthVersionCache(t *testing.T) {
	origNow := timeNow
	defer func() { timeNow = origNow }()

	now := time.Date(2026, 4, 1, 12, 0, 0, 0, time.UTC)
	timeNow = func() time.Time { return now }

	var calls int
	currentVersion := int64(1)
	uStore := &mockUserStoreProvider{
		GetAuthVersionFunc: func(ctx context.Context, id identity.UserID) (int64, error) {
			calls++
			return currentVersion, nil
		},
	}

	ai := NewAuthInterceptor(nil, uStore, nil, nil, nil)
	ctx := context.Background()

	// 1. First lookup hits store
	v, err := ai.getAuthVersion(ctx, "usr_1", 1)
	if err != nil || v != 1 || calls != 1 {
		t.Fatalf("first lookup: v=%d err=%v calls=%d", v, err, calls)
	}

	// 2. Second lookup within 5s TTL hits cache
	v, err = ai.getAuthVersion(ctx, "usr_1", 1)
	if err != nil || v != 1 || calls != 1 {
		t.Fatalf("cached lookup: v=%d err=%v calls=%d", v, err, calls)
	}

	// 3. Newer claim version bypasses cache immediately (e.g., right after password change)
	currentVersion = 2
	v, err = ai.getAuthVersion(ctx, "usr_1", 2)
	if err != nil || v != 2 || calls != 2 {
		t.Fatalf("newer claim lookup: v=%d err=%v calls=%d", v, err, calls)
	}

	// 4. Advance past 5s TTL -> refreshes from store
	now = now.Add(6 * time.Second)
	v, err = ai.getAuthVersion(ctx, "usr_1", 2)
	if err != nil || v != 2 || calls != 3 {
		t.Fatalf("expired lookup: v=%d err=%v calls=%d", v, err, calls)
	}
}
