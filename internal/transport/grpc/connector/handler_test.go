package connector_test

import (
	"context"
	"testing"
	"time"

	connectorv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/connector/v1"
	connectorapp "github.com/masterkeysrd/saturn/internal/application/connector"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	connectorgrpc "github.com/masterkeysrd/saturn/internal/transport/grpc/connector"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
)

type mockCoordinator struct {
	listProvidersFunc          func(ctx context.Context) ([]*connectorapp.ProviderDescriptor, error)
	initiateOAuthFunc          func(ctx context.Context, req *connectorapp.InitiateOAuthRequest) (*connectorapp.InitiateOAuthResult, error)
	completeOAuthFunc          func(ctx context.Context, req *connectorapp.CompleteOAuthRequest) (*connectorapp.CompleteOAuthResult, error)
	listConnectedAccountsFunc  func(ctx context.Context, req *connectorapp.ListConnectedAccountsRequest) ([]*connector.ConnectedAccount, error)
	getConnectedAccountFunc    func(ctx context.Context, req *connectorapp.GetConnectedAccountRequest) (*connector.ConnectedAccount, error)
	updateConnectedAccountFunc func(ctx context.Context, req *connectorapp.UpdateConnectedAccountRequest) (*connector.ConnectedAccount, error)
	deleteConnectedAccountFunc func(ctx context.Context, req *connectorapp.DeleteConnectedAccountRequest) error
	syncConnectedAccountFunc   func(ctx context.Context, req *connectorapp.SyncConnectedAccountRequest) (*connector.ConnectedAccount, error)
	suggestContactsFunc        func(ctx context.Context, req *connectorapp.SuggestContactsRequest) ([]*connector.AccountContact, error)
	syncContactsFunc           func(ctx context.Context, req *connectorapp.SyncContactsRequest) error
}

func (m *mockCoordinator) ListProviders(ctx context.Context) ([]*connectorapp.ProviderDescriptor, error) {
	if m.listProvidersFunc != nil {
		return m.listProvidersFunc(ctx)
	}
	return nil, nil
}
func (m *mockCoordinator) InitiateOAuth(ctx context.Context, req *connectorapp.InitiateOAuthRequest) (*connectorapp.InitiateOAuthResult, error) {
	if m.initiateOAuthFunc != nil {
		return m.initiateOAuthFunc(ctx, req)
	}
	return nil, nil
}
func (m *mockCoordinator) CompleteOAuth(ctx context.Context, req *connectorapp.CompleteOAuthRequest) (*connectorapp.CompleteOAuthResult, error) {
	if m.completeOAuthFunc != nil {
		return m.completeOAuthFunc(ctx, req)
	}
	return nil, nil
}
func (m *mockCoordinator) ListConnectedAccounts(ctx context.Context, req *connectorapp.ListConnectedAccountsRequest) ([]*connector.ConnectedAccount, error) {
	if m.listConnectedAccountsFunc != nil {
		return m.listConnectedAccountsFunc(ctx, req)
	}
	return nil, nil
}
func (m *mockCoordinator) GetConnectedAccount(ctx context.Context, req *connectorapp.GetConnectedAccountRequest) (*connector.ConnectedAccount, error) {
	if m.getConnectedAccountFunc != nil {
		return m.getConnectedAccountFunc(ctx, req)
	}
	return nil, nil
}
func (m *mockCoordinator) UpdateConnectedAccount(ctx context.Context, req *connectorapp.UpdateConnectedAccountRequest) (*connector.ConnectedAccount, error) {
	if m.updateConnectedAccountFunc != nil {
		return m.updateConnectedAccountFunc(ctx, req)
	}
	return nil, nil
}
func (m *mockCoordinator) DeleteConnectedAccount(ctx context.Context, req *connectorapp.DeleteConnectedAccountRequest) error {
	if m.deleteConnectedAccountFunc != nil {
		return m.deleteConnectedAccountFunc(ctx, req)
	}
	return nil
}
func (m *mockCoordinator) SyncConnectedAccount(ctx context.Context, req *connectorapp.SyncConnectedAccountRequest) (*connector.ConnectedAccount, error) {
	if m.syncConnectedAccountFunc != nil {
		return m.syncConnectedAccountFunc(ctx, req)
	}
	return nil, nil
}
func (m *mockCoordinator) SuggestContacts(ctx context.Context, req *connectorapp.SuggestContactsRequest) ([]*connector.AccountContact, error) {
	if m.suggestContactsFunc != nil {
		return m.suggestContactsFunc(ctx, req)
	}
	return nil, nil
}
func (m *mockCoordinator) SyncContacts(ctx context.Context, req *connectorapp.SyncContactsRequest) error {
	if m.syncContactsFunc != nil {
		return m.syncContactsFunc(ctx, req)
	}
	return nil
}

func TestGRPCHandler_AllMethods(t *testing.T) {
	t.Parallel()

	now := time.Now()
	testAccount := &connector.ConnectedAccount{
		ID:                  "cac_123",
		SpaceID:             "spc_123",
		CreatedByUserID:     "usr_123",
		Provider:            "google",
		ProviderAccountID:   "g_123",
		Email:               "user@example.com",
		TokenExpiry:         now.Add(1 * time.Hour),
		GrantedScopes:       []string{"openid", "email"},
		EnabledCapabilities: []string{"calendar"},
		Status:              connector.AccountStatusHealthy,
		Version:             1,
		CreateTime:          now,
		UpdateTime:          now,
	}

	coord := &mockCoordinator{
		listProvidersFunc: func(ctx context.Context) ([]*connectorapp.ProviderDescriptor, error) {
			return []*connectorapp.ProviderDescriptor{
				{
					ID:                    "google",
					DisplayName:           "Google",
					SupportedCapabilities: []string{"calendar", "contacts"},
				},
			}, nil
		},
		initiateOAuthFunc: func(ctx context.Context, req *connectorapp.InitiateOAuthRequest) (*connectorapp.InitiateOAuthResult, error) {
			assert.Equal(t, "spc_123", req.SpaceID)
			return &connectorapp.InitiateOAuthResult{
				AuthURL: "https://accounts.google.com/auth",
				State:   "state_abc",
			}, nil
		},
		listConnectedAccountsFunc: func(ctx context.Context, req *connectorapp.ListConnectedAccountsRequest) ([]*connector.ConnectedAccount, error) {
			assert.Equal(t, "spc_123", req.SpaceID)
			return []*connector.ConnectedAccount{testAccount}, nil
		},
		getConnectedAccountFunc: func(ctx context.Context, req *connectorapp.GetConnectedAccountRequest) (*connector.ConnectedAccount, error) {
			assert.Equal(t, "cac_123", req.AccountID)
			return testAccount, nil
		},
		updateConnectedAccountFunc: func(ctx context.Context, req *connectorapp.UpdateConnectedAccountRequest) (*connector.ConnectedAccount, error) {
			assert.Equal(t, "cac_123", req.AccountID)
			assert.Contains(t, req.UpdateMask, "display_name")
			return testAccount, nil
		},
		deleteConnectedAccountFunc: func(ctx context.Context, req *connectorapp.DeleteConnectedAccountRequest) error {
			assert.Equal(t, "cac_123", req.AccountID)
			return nil
		},
		syncConnectedAccountFunc: func(ctx context.Context, req *connectorapp.SyncConnectedAccountRequest) (*connector.ConnectedAccount, error) {
			assert.Equal(t, "cac_123", req.AccountID)
			return testAccount, nil
		},
		suggestContactsFunc: func(ctx context.Context, req *connectorapp.SuggestContactsRequest) ([]*connector.AccountContact, error) {
			return []*connector.AccountContact{
				{
					ID:                 "cnt_1",
					SpaceID:            "spc_123",
					ConnectedAccountID: "cac_123",
					ProviderContactID:  "pc_1",
					DisplayName:        new("Alice"),
					UpdateTime:         now,
				},
			}, nil
		},
	}

	handler := connectorgrpc.NewHandler(coord)

	// Context with space ID
	ctxWithSpace := auth.WithSpaceID(context.Background(), "spc_123")
	ctxWithoutSpace := context.Background()

	t.Run("ListProviders", func(t *testing.T) {
		res, err := handler.ListProviders(ctxWithSpace, &connectorv1.ListProvidersRequest{})
		require.NoError(t, err)
		assert.Len(t, res.Providers, 1)
		assert.Equal(t, "google", res.Providers[0].Id)
	})

	t.Run("InitiateOAuth missing space-id returns error", func(t *testing.T) {
		_, err := handler.InitiateOAuth(ctxWithoutSpace, &connectorv1.InitiateOAuthRequest{
			Provider:  "google",
			ReturnUrl: "/settings",
		})
		require.Error(t, err)
	})

	t.Run("InitiateOAuth success", func(t *testing.T) {
		res, err := handler.InitiateOAuth(ctxWithSpace, &connectorv1.InitiateOAuthRequest{
			Provider:  "google",
			ReturnUrl: "/settings",
		})
		require.NoError(t, err)
		assert.Equal(t, "https://accounts.google.com/auth", res.AuthUrl)
		assert.Equal(t, "state_abc", res.State)
	})

	t.Run("ListConnectedAccounts", func(t *testing.T) {
		res, err := handler.ListConnectedAccounts(ctxWithSpace, &connectorv1.ListConnectedAccountsRequest{})
		require.NoError(t, err)
		assert.Len(t, res.Accounts, 1)
		assert.Equal(t, "cac_123", res.Accounts[0].Id)
	})

	t.Run("GetConnectedAccount", func(t *testing.T) {
		res, err := handler.GetConnectedAccount(ctxWithSpace, &connectorv1.GetConnectedAccountRequest{
			Id: "cac_123",
		})
		require.NoError(t, err)
		assert.Equal(t, "cac_123", res.Id)
	})

	t.Run("UpdateConnectedAccount", func(t *testing.T) {
		mask, err := fieldmaskpb.New(&connectorv1.ConnectedAccount{}, "display_name")
		require.NoError(t, err)

		name := "My Google"
		res, err := handler.UpdateConnectedAccount(ctxWithSpace, &connectorv1.UpdateConnectedAccountRequest{
			Id: "cac_123",
			Account: &connectorv1.ConnectedAccount{
				DisplayName: &name,
			},
			UpdateMask: mask,
		})
		require.NoError(t, err)
		assert.Equal(t, "cac_123", res.Id)
	})

	t.Run("DeleteConnectedAccount", func(t *testing.T) {
		_, err := handler.DeleteConnectedAccount(ctxWithSpace, &connectorv1.DeleteConnectedAccountRequest{
			Id: "cac_123",
		})
		require.NoError(t, err)
	})

	t.Run("SyncConnectedAccount", func(t *testing.T) {
		res, err := handler.SyncConnectedAccount(ctxWithSpace, &connectorv1.SyncConnectedAccountRequest{
			Id: "cac_123",
		})
		require.NoError(t, err)
		assert.Equal(t, "cac_123", res.Account.Id)
	})

	t.Run("SuggestContacts", func(t *testing.T) {
		res, err := handler.SuggestContacts(ctxWithSpace, &connectorv1.SuggestContactsRequest{
			Query: "ali",
		})
		require.NoError(t, err)
		assert.Len(t, res.Contacts, 1)
		assert.Equal(t, "cnt_1", res.Contacts[0].Id)
	})
}
