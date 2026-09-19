package integration

import (
	"context"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/integration"
)

type baseProvider struct{}

func (baseProvider) Provider() string                                           { return "mock" }
func (baseProvider) Kind() string                                               { return "mock" }
func (baseProvider) Descriptor() integration.Descriptor                         { return integration.Descriptor{} }
func (baseProvider) Verify(context.Context, map[string][]string, []byte) error  { return nil }
func (baseProvider) Process(context.Context, map[string][]string, []byte) error { return nil }

type mockSimulator struct {
	baseProvider
	simulateFn func(ctx context.Context, spaceID string, headers map[string][]string, body []byte) (any, error)
}

func (m *mockSimulator) Simulate(ctx context.Context, spaceID string, headers map[string][]string, body []byte) (any, error) {
	if m.simulateFn != nil {
		return m.simulateFn(ctx, spaceID, headers, body)
	}
	return map[string]any{"simulated": true}, nil
}

func TestCoordinator_Get(t *testing.T) {
	tests := []struct {
		name          string
		query         integration.GetIntegration
		mockGet       func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error)
		expectedID    string
		expectedNil   bool
		expectedError bool
	}{
		{
			name: "Success - integration found",
			query: integration.GetIntegration{
				SpaceID:  "spc_123",
				Provider: "github",
				Kind:     "repo",
			},
			mockGet: func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error) {
				return &integration.Integration{
					ID:       "int_123",
					SpaceID:  query.SpaceID,
					Provider: query.Provider,
					Kind:     query.Kind,
				}, nil
			},
			expectedID:    "int_123",
			expectedNil:   false,
			expectedError: false,
		},
		{
			name: "Success - integration not found in registry returns nil without error",
			query: integration.GetIntegration{
				SpaceID:  "spc_123",
				Provider: "github",
			},
			mockGet: func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error) {
				return nil, nil
			},
			expectedNil:   true,
			expectedError: false,
		},
		{
			name: "Failure - registry returns error",
			query: integration.GetIntegration{
				SpaceID:  "spc_123",
				Provider: "github",
			},
			mockGet: func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error) {
				return nil, errors.New("registry error")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			reg := &RegistryMock{
				GetFunc: tc.mockGet,
			}
			coord := NewCoordinator(Dependencies{Registry: reg})

			res, err := coord.Get(context.Background(), tc.query)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tc.expectedNil {
				if res != nil {
					t.Fatalf("expected nil integration, got %+v", res)
				}
				return
			}
			if res == nil || res.ID != tc.expectedID {
				t.Fatalf("expected ID %q, got %+v", tc.expectedID, res)
			}
		})
	}
}

func TestCoordinator_Configure(t *testing.T) {
	tests := []struct {
		name          string
		cmd           integration.ConfigureIntegration
		mockConfigure func(ctx context.Context, cmd integration.ConfigureIntegration) (*integration.Integration, string, error)
		expectedID    string
		expectedToken string
		expectedError bool
	}{
		{
			name: "Success - configure without token",
			cmd: integration.ConfigureIntegration{
				SpaceID:    "spc_1",
				Kind:       "webhook",
				Provider:   "slack",
				ConfigJSON: `{"channel":"#general"}`,
				IsEnabled:  true,
			},
			mockConfigure: func(ctx context.Context, cmd integration.ConfigureIntegration) (*integration.Integration, string, error) {
				return &integration.Integration{
					ID:       "int_slack",
					SpaceID:  cmd.SpaceID,
					Provider: cmd.Provider,
					Kind:     cmd.Kind,
				}, "", nil
			},
			expectedID:    "int_slack",
			expectedToken: "",
			expectedError: false,
		},
		{
			name: "Success - configure with token",
			cmd: integration.ConfigureIntegration{
				SpaceID:    "spc_1",
				Kind:       "transaction_ingestion",
				Provider:   "email",
				ConfigJSON: `{}`,
				IsEnabled:  true,
			},
			mockConfigure: func(ctx context.Context, cmd integration.ConfigureIntegration) (*integration.Integration, string, error) {
				return &integration.Integration{
					ID:       "int_email",
					SpaceID:  cmd.SpaceID,
					Provider: cmd.Provider,
				}, "raw_token_xyz", nil
			},
			expectedID:    "int_email",
			expectedToken: "raw_token_xyz",
			expectedError: false,
		},
		{
			name: "Failure - registry configure error",
			cmd: integration.ConfigureIntegration{
				SpaceID:  "spc_1",
				Provider: "github",
			},
			mockConfigure: func(ctx context.Context, cmd integration.ConfigureIntegration) (*integration.Integration, string, error) {
				return nil, "", errors.New("configuration error")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			reg := &RegistryMock{
				ConfigureFunc: tc.mockConfigure,
			}
			coord := NewCoordinator(Dependencies{Registry: reg})

			res, rawToken, err := coord.Configure(context.Background(), tc.cmd)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res.ID != tc.expectedID {
				t.Errorf("expected ID %q, got %q", tc.expectedID, res.ID)
			}
			if rawToken != tc.expectedToken {
				t.Errorf("expected raw token %q, got %q", tc.expectedToken, rawToken)
			}
		})
	}
}

func TestCoordinator_List(t *testing.T) {
	tests := []struct {
		name          string
		spaceID       string
		mockList      func(ctx context.Context, spaceID string) ([]*integration.Integration, error)
		expectedCount int
		expectedError bool
	}{
		{
			name:    "Success - returns integrations",
			spaceID: "spc_1",
			mockList: func(ctx context.Context, spaceID string) ([]*integration.Integration, error) {
				return []*integration.Integration{
					{ID: "int_1", SpaceID: spaceID},
					{ID: "int_2", SpaceID: spaceID},
				}, nil
			},
			expectedCount: 2,
			expectedError: false,
		},
		{
			name:    "Failure - registry list error",
			spaceID: "spc_1",
			mockList: func(ctx context.Context, spaceID string) ([]*integration.Integration, error) {
				return nil, errors.New("query failed")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			reg := &RegistryMock{
				ListFunc: tc.mockList,
			}
			coord := NewCoordinator(Dependencies{Registry: reg})

			items, err := coord.List(context.Background(), tc.spaceID)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(items) != tc.expectedCount {
				t.Errorf("expected %d items, got %d", tc.expectedCount, len(items))
			}
		})
	}
}

func TestCoordinator_ListCatalog(t *testing.T) {
	tests := []struct {
		name            string
		mockListCatalog func() []integration.Descriptor
		expectedCount   int
	}{
		{
			name: "Empty catalog",
			mockListCatalog: func() []integration.Descriptor {
				return []integration.Descriptor{}
			},
			expectedCount: 0,
		},
		{
			name: "Multiple registered providers",
			mockListCatalog: func() []integration.Descriptor {
				return []integration.Descriptor{
					{Provider: "email"},
					{Provider: "slack"},
				}
			},
			expectedCount: 2,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			reg := &RegistryMock{
				ListCatalogFunc: tc.mockListCatalog,
			}
			coord := NewCoordinator(Dependencies{Registry: reg})

			catalog := coord.ListCatalog()
			if len(catalog) != tc.expectedCount {
				t.Errorf("expected %d catalog items, got %d", tc.expectedCount, len(catalog))
			}
		})
	}
}

func TestCoordinator_CreateToken(t *testing.T) {
	tests := []struct {
		name            string
		query           integration.GetIntegration
		tokenName       string
		mockGet         func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error)
		mockCreateToken func(ctx context.Context, integrationID string, name string) (*integration.IntegrationToken, string, error)
		expectedError   bool
		expectedCode    errors.Code
		expectedKind    errors.Kind
	}{
		{
			name:          "Failure - empty token name",
			query:         integration.GetIntegration{SpaceID: "spc_1", Provider: "email", Kind: "ingest"},
			tokenName:     "",
			expectedError: true,
			expectedKind:  errors.Invalid,
		},
		{
			name:      "Failure - Get integration returns error",
			query:     integration.GetIntegration{SpaceID: "spc_1", Provider: "email", Kind: "ingest"},
			tokenName: "ci-token",
			mockGet: func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error) {
				return nil, errors.New("lookup error")
			},
			expectedError: true,
		},
		{
			name:      "Failure - integration not found",
			query:     integration.GetIntegration{SpaceID: "spc_1", Provider: "email", Kind: "ingest"},
			tokenName: "ci-token",
			mockGet: func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error) {
				return nil, nil
			},
			expectedError: true,
			expectedKind:  errors.NotExist,
			expectedCode:  IntegrationNotFound,
		},
		{
			name:      "Failure - CreateToken error in registry",
			query:     integration.GetIntegration{SpaceID: "spc_1", Provider: "email", Kind: "ingest"},
			tokenName: "ci-token",
			mockGet: func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error) {
				return &integration.Integration{ID: "int_email"}, nil
			},
			mockCreateToken: func(ctx context.Context, integrationID string, name string) (*integration.IntegrationToken, string, error) {
				return nil, "", errors.New("creation failed")
			},
			expectedError: true,
		},
		{
			name:      "Success - token created",
			query:     integration.GetIntegration{SpaceID: "spc_1", Provider: "email", Kind: "ingest"},
			tokenName: "ci-token",
			mockGet: func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error) {
				return &integration.Integration{ID: "int_email"}, nil
			},
			mockCreateToken: func(ctx context.Context, integrationID string, name string) (*integration.IntegrationToken, string, error) {
				return &integration.IntegrationToken{ID: "tok_123", IntegrationID: integrationID, Name: name}, "raw_secret", nil
			},
			expectedError: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			reg := &RegistryMock{
				GetFunc:         tc.mockGet,
				CreateTokenFunc: tc.mockCreateToken,
			}
			coord := NewCoordinator(Dependencies{Registry: reg})

			tok, rawToken, err := coord.CreateToken(context.Background(), tc.query, tc.tokenName)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tc.expectedKind != errors.Other && errors.KindOf(err) != tc.expectedKind {
					t.Errorf("expected error kind %v, got %v", tc.expectedKind, errors.KindOf(err))
				}
				if tc.expectedCode != "" && errors.CodeOf(err) != tc.expectedCode {
					t.Errorf("expected error code %v, got %v", tc.expectedCode, errors.CodeOf(err))
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tok == nil || tok.ID != "tok_123" {
				t.Errorf("unexpected token: %+v", tok)
			}
			if rawToken != "raw_secret" {
				t.Errorf("expected raw token 'raw_secret', got %q", rawToken)
			}
		})
	}
}

func TestCoordinator_ListTokens(t *testing.T) {
	tests := []struct {
		name           string
		query          integration.GetIntegration
		mockGet        func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error)
		mockListTokens func(ctx context.Context, integrationID string) ([]*integration.IntegrationToken, error)
		expectedCount  int
		expectedNil    bool
		expectedError  bool
	}{
		{
			name:  "Failure - Get integration returns error",
			query: integration.GetIntegration{SpaceID: "spc_1", Provider: "email", Kind: "ingest"},
			mockGet: func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error) {
				return nil, errors.New("lookup error")
			},
			expectedError: true,
		},
		{
			name:  "Success - integration not found returns nil without error",
			query: integration.GetIntegration{SpaceID: "spc_1", Provider: "email", Kind: "ingest"},
			mockGet: func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error) {
				return nil, nil
			},
			expectedNil:   true,
			expectedError: false,
		},
		{
			name:  "Failure - ListTokens registry error",
			query: integration.GetIntegration{SpaceID: "spc_1", Provider: "email", Kind: "ingest"},
			mockGet: func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error) {
				return &integration.Integration{ID: "int_email"}, nil
			},
			mockListTokens: func(ctx context.Context, integrationID string) ([]*integration.IntegrationToken, error) {
				return nil, errors.New("list tokens error")
			},
			expectedError: true,
		},
		{
			name:  "Success - returns tokens",
			query: integration.GetIntegration{SpaceID: "spc_1", Provider: "email", Kind: "ingest"},
			mockGet: func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error) {
				return &integration.Integration{ID: "int_email"}, nil
			},
			mockListTokens: func(ctx context.Context, integrationID string) ([]*integration.IntegrationToken, error) {
				return []*integration.IntegrationToken{
					{ID: "tok_1", Name: "Key 1"},
					{ID: "tok_2", Name: "Key 2"},
				}, nil
			},
			expectedCount: 2,
			expectedError: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			reg := &RegistryMock{
				GetFunc:        tc.mockGet,
				ListTokensFunc: tc.mockListTokens,
			}
			coord := NewCoordinator(Dependencies{Registry: reg})

			tokens, err := coord.ListTokens(context.Background(), tc.query)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tc.expectedNil {
				if tokens != nil {
					t.Errorf("expected nil tokens, got %+v", tokens)
				}
				return
			}
			if len(tokens) != tc.expectedCount {
				t.Errorf("expected %d tokens, got %d", tc.expectedCount, len(tokens))
			}
		})
	}
}

func TestCoordinator_DeleteToken(t *testing.T) {
	tests := []struct {
		name            string
		query           integration.GetIntegration
		tokenID         string
		mockGet         func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error)
		mockDeleteToken func(ctx context.Context, integrationID string, tokenID string) error
		expectedError   bool
		expectedKind    errors.Kind
		expectedCode    errors.Code
	}{
		{
			name:    "Failure - Get integration error",
			query:   integration.GetIntegration{SpaceID: "spc_1", Provider: "email", Kind: "ingest"},
			tokenID: "tok_1",
			mockGet: func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error) {
				return nil, errors.New("lookup error")
			},
			expectedError: true,
		},
		{
			name:    "Failure - integration not found",
			query:   integration.GetIntegration{SpaceID: "spc_1", Provider: "email", Kind: "ingest"},
			tokenID: "tok_1",
			mockGet: func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error) {
				return nil, nil
			},
			expectedError: true,
			expectedKind:  errors.NotExist,
			expectedCode:  IntegrationNotFound,
		},
		{
			name:    "Failure - token not found (NotExist)",
			query:   integration.GetIntegration{SpaceID: "spc_1", Provider: "email", Kind: "ingest"},
			tokenID: "tok_missing",
			mockGet: func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error) {
				return &integration.Integration{ID: "int_email"}, nil
			},
			mockDeleteToken: func(ctx context.Context, integrationID string, tokenID string) error {
				return errors.E("Registry.DeleteToken", errors.NotExist, "not found")
			},
			expectedError: true,
			expectedKind:  errors.NotExist,
			expectedCode:  TokenNotFound,
		},
		{
			name:    "Failure - registry generic error on delete",
			query:   integration.GetIntegration{SpaceID: "spc_1", Provider: "email", Kind: "ingest"},
			tokenID: "tok_1",
			mockGet: func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error) {
				return &integration.Integration{ID: "int_email"}, nil
			},
			mockDeleteToken: func(ctx context.Context, integrationID string, tokenID string) error {
				return errors.New("delete error")
			},
			expectedError: true,
		},
		{
			name:    "Success - token deleted",
			query:   integration.GetIntegration{SpaceID: "spc_1", Provider: "email", Kind: "ingest"},
			tokenID: "tok_1",
			mockGet: func(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error) {
				return &integration.Integration{ID: "int_email"}, nil
			},
			mockDeleteToken: func(ctx context.Context, integrationID string, tokenID string) error {
				return nil
			},
			expectedError: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			reg := &RegistryMock{
				GetFunc:         tc.mockGet,
				DeleteTokenFunc: tc.mockDeleteToken,
			}
			coord := NewCoordinator(Dependencies{Registry: reg})

			err := coord.DeleteToken(context.Background(), tc.query, tc.tokenID)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tc.expectedKind != errors.Other && errors.KindOf(err) != tc.expectedKind {
					t.Errorf("expected error kind %v, got %v", tc.expectedKind, errors.KindOf(err))
				}
				if tc.expectedCode != "" && errors.CodeOf(err) != tc.expectedCode {
					t.Errorf("expected error code %v, got %v", tc.expectedCode, errors.CodeOf(err))
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestCoordinator_SimulateWebhook(t *testing.T) {
	tests := []struct {
		name            string
		providerName    string
		mockGetProvider func(provider string) (integration.Provider, bool)
		expectedError   bool
		expectedKind    errors.Kind
		expectedCode    errors.Code
	}{
		{
			name:         "Provider not found returns NotExist",
			providerName: "missing_provider",
			mockGetProvider: func(provider string) (integration.Provider, bool) {
				return nil, false
			},
			expectedError: true,
			expectedKind:  errors.NotExist,
			expectedCode:  ProviderNotFound,
		},
		{
			name:         "Provider does not support simulation returns Invalid",
			providerName: "webhook",
			mockGetProvider: func(provider string) (integration.Provider, bool) {
				return &baseProvider{}, true
			},
			expectedError: true,
			expectedKind:  errors.Invalid,
			expectedCode:  SimulationNotSupported,
		},
		{
			name:         "Provider simulation fails",
			providerName: "email",
			mockGetProvider: func(provider string) (integration.Provider, bool) {
				return &mockSimulator{
					simulateFn: func(ctx context.Context, spaceID string, headers map[string][]string, body []byte) (any, error) {
						return nil, errors.E("mockSimulator.Simulate", errors.Invalid, "invalid payload")
					},
				}, true
			},
			expectedError: true,
			expectedKind:  errors.Invalid,
		},
		{
			name:         "Provider simulation succeeds",
			providerName: "email",
			mockGetProvider: func(provider string) (integration.Provider, bool) {
				return &mockSimulator{
					simulateFn: func(ctx context.Context, spaceID string, headers map[string][]string, body []byte) (any, error) {
						return map[string]any{"simulated": true}, nil
					},
				}, true
			},
			expectedError: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			reg := &RegistryMock{
				GetProviderFunc: tc.mockGetProvider,
			}
			coord := NewCoordinator(Dependencies{Registry: reg})

			res, err := coord.SimulateWebhook(context.Background(), "spc_1", tc.providerName, "kind", nil, []byte("{}"))
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tc.expectedKind != errors.Other && errors.KindOf(err) != tc.expectedKind {
					t.Errorf("expected error kind %v, got %v", tc.expectedKind, errors.KindOf(err))
				}
				if tc.expectedCode != "" && errors.CodeOf(err) != tc.expectedCode {
					t.Errorf("expected error code %v, got %v", tc.expectedCode, errors.CodeOf(err))
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			m, ok := res.(map[string]any)
			if !ok || m["simulated"] != true {
				t.Errorf("unexpected simulation result: %+v", res)
			}
		})
	}
}
