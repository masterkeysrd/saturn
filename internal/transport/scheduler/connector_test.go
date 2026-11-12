package scheduler_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
	transportscheduler "github.com/masterkeysrd/saturn/internal/transport/scheduler"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockConnectorStore struct {
	listActiveAccountsFunc func(ctx context.Context) ([]*connector.ConnectedAccount, error)
}

func (m *mockConnectorStore) CreateAccount(ctx context.Context, account *connector.ConnectedAccount) error {
	return nil
}
func (m *mockConnectorStore) GetAccount(ctx context.Context, spaceID, accountID string) (*connector.ConnectedAccount, error) {
	return nil, nil
}
func (m *mockConnectorStore) GetAccountByID(ctx context.Context, accountID string) (*connector.ConnectedAccount, error) {
	return nil, nil
}
func (m *mockConnectorStore) GetAccountByProvider(ctx context.Context, spaceID, provider, providerAccountID string) (*connector.ConnectedAccount, error) {
	return nil, nil
}
func (m *mockConnectorStore) ListAccounts(ctx context.Context, spaceID string) ([]*connector.ConnectedAccount, error) {
	return nil, nil
}
func (m *mockConnectorStore) ListActiveAccounts(ctx context.Context) ([]*connector.ConnectedAccount, error) {
	if m.listActiveAccountsFunc != nil {
		return m.listActiveAccountsFunc(ctx)
	}
	return nil, nil
}
func (m *mockConnectorStore) UpdateAccount(ctx context.Context, account *connector.ConnectedAccount) error {
	return nil
}
func (m *mockConnectorStore) UpdateAccountTokens(ctx context.Context, accountID string, accessTokenEnc, refreshTokenEnc string, expiry time.Time) error {
	return nil
}
func (m *mockConnectorStore) UpdateAccountStatus(ctx context.Context, spaceID, accountID string, status connector.AccountStatus, reason *string, backoffUntil *time.Time) error {
	return nil
}
func (m *mockConnectorStore) DeleteAccount(ctx context.Context, spaceID, accountID string) error {
	return nil
}
func (m *mockConnectorStore) CountActiveByProviderIdentity(ctx context.Context, provider, providerAccountID, excludeSpaceID string) (int, error) {
	return 0, nil
}
func (m *mockConnectorStore) CreateOAuthState(ctx context.Context, state *connector.OAuthState) error {
	return nil
}
func (m *mockConnectorStore) ConsumeOAuthState(ctx context.Context, stateHash string) (*connector.OAuthState, error) {
	return nil, nil
}
func (m *mockConnectorStore) UpsertContacts(ctx context.Context, contacts []*connector.AccountContact) error {
	return nil
}
func (m *mockConnectorStore) ListContacts(ctx context.Context, spaceID, accountID string) ([]*connector.AccountContact, error) {
	return nil, nil
}
func (m *mockConnectorStore) SuggestContacts(ctx context.Context, spaceID string, query string, limit int) ([]*connector.AccountContact, error) {
	return nil, nil
}

type mockSchedulerDB struct {
	execFunc func(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func (m *mockSchedulerDB) Get(ctx context.Context, dest any, query string, args ...any) error {
	return nil
}
func (m *mockSchedulerDB) Select(ctx context.Context, dest any, query string, args ...any) error {
	return nil
}
func (m *mockSchedulerDB) Exec(ctx context.Context, query string, args ...any) (sql.Result, error) {
	if m.execFunc != nil {
		return m.execFunc(ctx, query, args...)
	}
	return nil, nil
}
func (m *mockSchedulerDB) ExecOne(ctx context.Context, query string, args ...any) error {
	return nil
}
func (m *mockSchedulerDB) Rebind(query string) string {
	return query
}
func (m *mockSchedulerDB) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}

func TestRegisterConnectorJobs_PeriodicSync(t *testing.T) {
	ctx := context.Background()

	var enqueuedJobTypes []string
	dbMock := &mockSchedulerDB{
		execFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
			if len(args) > 1 {
				if jt, ok := args[1].(string); ok {
					enqueuedJobTypes = append(enqueuedJobTypes, jt)
				}
			}
			return nil, nil
		},
	}
	engine := scheduler.NewEngine(dbMock)

	store := &mockConnectorStore{
		listActiveAccountsFunc: func(ctx context.Context) ([]*connector.ConnectedAccount, error) {
			return []*connector.ConnectedAccount{
				{
					ID:                  "cac_1",
					SpaceID:             "spc_1",
					Status:              connector.AccountStatusHealthy,
					EnabledCapabilities: []string{"calendar", "mail"},
				},
				{
					ID:                  "cac_2",
					SpaceID:             "spc_2",
					Status:              connector.AccountStatusHealthy,
					EnabledCapabilities: []string{"calendar"},
				},
			}, nil
		},
	}

	transportscheduler.RegisterConnectorJobs(engine, nil, store)

	// Register 3-minute schedule
	err := transportscheduler.RegisterConnectorSchedules(ctx, engine)
	require.NoError(t, err)

	assert.Contains(t, enqueuedJobTypes, "connector.periodic_sync")
}
