package auth

import (
	"context"
	"testing"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

type mockUserStoreProvider struct {
	GetAuthVersionFunc func(ctx context.Context, id identity.UserID) (int64, error)
}

func (m *mockUserStoreProvider) GetAuthVersion(ctx context.Context, id identity.UserID) (int64, error) {
	if m.GetAuthVersionFunc != nil {
		return m.GetAuthVersionFunc(ctx, id)
	}
	return 1, nil
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
	}

	interceptor := NewAuthInterceptor(nil, &mockUserStoreProvider{}, rules)

	tests := []struct {
		name                 string
		grpcMethod           string
		expectedAuthRequired bool
		expectedAccessLevels []string
	}{
		{
			name:                 "Public endpoint - LoginUser",
			grpcMethod:           "/saturn.identity.v1.Identity/LoginUser",
			expectedAuthRequired: false,
			expectedAccessLevels: nil,
		},
		{
			name:                 "Public endpoint - RegisterUser",
			grpcMethod:           "/saturn.identity.v1.Identity/RegisterUser",
			expectedAuthRequired: false,
			expectedAccessLevels: nil,
		},
		{
			name:                 "Default secure endpoint - RefreshSession",
			grpcMethod:           "/saturn.identity.v1.Identity/RefreshSession",
			expectedAuthRequired: true,
			expectedAccessLevels: nil,
		},
		{
			name:                 "Admin wildcard endpoint - ListUsers",
			grpcMethod:           "/saturn.identity.admin.v1.AdminIdentity/ListUsers",
			expectedAuthRequired: true,
			expectedAccessLevels: []string{"admin"},
		},
		{
			name:                 "Admin wildcard endpoint - ApproveUser",
			grpcMethod:           "/saturn.identity.admin.v1.AdminIdentity/ApproveUser",
			expectedAuthRequired: true,
			expectedAccessLevels: []string{"admin"},
		},
		{
			name:                 "Unrelated service matches fallback",
			grpcMethod:           "/saturn.finance.v1.Finance/CreateTransaction",
			expectedAuthRequired: true,
			expectedAccessLevels: nil,
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
			} else {
				for i, v := range policy.AccessLevels {
					if v != tc.expectedAccessLevels[i] {
						t.Errorf("expected AccessLevels[%d]=%q, got %q", i, tc.expectedAccessLevels[i], v)
					}
				}
			}
		})
	}
}
