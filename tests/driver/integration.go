//go:build integration

package driver

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/masterkeysrd/saturn/apis/saturn"
	integrationv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/integration/v1"
)

// IntegrationDriver provides methods for managing third-party platform integrations, tokens, and webhooks.
type IntegrationDriver struct {
	driver      *Driver
	client      *integrationv1.Client
	lastToken   string
	lastSpaceID string
}

func (i *IntegrationDriver) getClient() *integrationv1.Client {
	if i.client == nil || i.lastToken != i.driver.state.AccessToken || i.lastSpaceID != i.driver.state.SpaceID {
		i.lastToken = i.driver.state.AccessToken
		i.lastSpaceID = i.driver.state.SpaceID
		i.client = integrationv1.NewClient(saturn.Config{
			BaseURL:     i.driver.env.ServerURL,
			AccessToken: i.lastToken,
			SpaceID:     i.lastSpaceID,
			HTTPClient:  i.driver.httpClient,
		})
	}
	return i.client
}

// ConfigureIntegrationOptions encapsulates options for configuring a space integration.
type ConfigureIntegrationOptions struct {
	Provider  string
	Kind      string
	IsEnabled bool
	Config    string
	ExpectErr string
	Assert    func(tb testing.TB, in *integrationv1.Integration)
}

// GetIntegrationOptions encapsulates options for fetching an integration.
type GetIntegrationOptions struct {
	Provider  string
	Kind      string
	ExpectErr string
	Assert    func(tb testing.TB, in *integrationv1.Integration)
}

// CreateIntegrationTokenOptions encapsulates options for issuing an integration token.
type CreateIntegrationTokenOptions struct {
	Provider  string
	Name      string
	ExpectErr string
	Assert    func(tb testing.TB, resp *integrationv1.CreateIntegrationTokenResponse)
}

// ListIntegrationTokensOptions encapsulates options for listing integration tokens.
type ListIntegrationTokensOptions struct {
	Provider  string
	Kind      string
	ExpectErr string
	Assert    func(tb testing.TB, resp *integrationv1.ListIntegrationTokensResponse)
}

// DeleteIntegrationTokenOptions encapsulates options for deleting an integration token.
type DeleteIntegrationTokenOptions struct {
	Provider  string
	ID        string
	Kind      string
	ExpectErr string
}

// RotateIntegrationTokenOptions encapsulates options for rotating an integration token.
type RotateIntegrationTokenOptions struct {
	Provider  string
	Kind      string
	ExpectErr string
	Assert    func(tb testing.TB, resp *integrationv1.RotateIntegrationTokenResponse)
}

// SimulateWebhookOptions encapsulates options for simulating an incoming webhook.
type SimulateWebhookOptions struct {
	Provider  string
	Kind      string
	Headers   map[string]string
	Payload   string
	Body      []byte
	ExpectErr string
	Assert    func(tb testing.TB, resp *integrationv1.SimulateWebhookResponse)
}

// PostWebhookOptions encapsulates options for posting a raw HTTP webhook to the Saturn webhook dispatcher.
type PostWebhookOptions struct {
	Path      string
	Secret    string
	Headers   map[string]string
	Body      []byte
	ExpectErr string
	Assert    func(tb testing.TB, resp *http.Response, body []byte)
}

// Configure registers or updates an integration channel in the active workspace.
func (i *IntegrationDriver) Configure(tb testing.TB, opts ConfigureIntegrationOptions) (*integrationv1.Integration, error) {
	tb.Helper()
	client := i.getClient()
	res, err := client.ConfigureIntegration(tb.Context(), &integrationv1.ConfigureIntegrationRequest{
		Provider:   opts.Provider,
		Kind:       opts.Kind,
		IsEnabled:  opts.IsEnabled,
		ConfigJson: opts.Config,
	})
	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("Configure succeeded, but expected error containing %q", opts.ExpectErr)
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("Configure error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return nil, err
	}
	if err != nil {
		return nil, err
	}
	if res != nil {
		i.driver.state.LastIntegrationID = res.GetId()
	}
	if opts.Assert != nil {
		opts.Assert(tb, res)
	}
	return res, nil
}

// Get retrieves an integration by provider name and kind.
func (i *IntegrationDriver) Get(tb testing.TB, opts GetIntegrationOptions) (*integrationv1.Integration, error) {
	tb.Helper()
	client := i.getClient()
	res, err := client.GetIntegration(tb.Context(), &integrationv1.GetIntegrationRequest{
		Provider: opts.Provider,
		Kind:     opts.Kind,
	})
	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("Get succeeded, but expected error containing %q", opts.ExpectErr)
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("Get error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return nil, err
	}
	if err != nil {
		return nil, err
	}
	if opts.Assert != nil {
		opts.Assert(tb, res)
	}
	return res, nil
}

// List retrieves all integrations configured for the active space.
func (i *IntegrationDriver) List(tb testing.TB) (*integrationv1.ListIntegrationsResponse, error) {
	tb.Helper()
	client := i.getClient()
	return client.ListIntegrations(tb.Context(), &integrationv1.ListIntegrationsRequest{})
}

// ListCatalog retrieves the registered integration descriptors.
func (i *IntegrationDriver) ListCatalog(tb testing.TB) (*integrationv1.ListCatalogResponse, error) {
	tb.Helper()
	client := i.getClient()
	return client.ListCatalog(tb.Context(), &integrationv1.ListCatalogRequest{})
}

// CreateToken issues a new access/routing token for an integration.
func (i *IntegrationDriver) CreateToken(tb testing.TB, opts CreateIntegrationTokenOptions) (*integrationv1.CreateIntegrationTokenResponse, error) {
	tb.Helper()
	client := i.getClient()
	res, err := client.CreateIntegrationToken(tb.Context(), &integrationv1.CreateIntegrationTokenRequest{
		Provider: opts.Provider,
		Name:     opts.Name,
	})
	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("CreateToken succeeded, but expected error containing %q", opts.ExpectErr)
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("CreateToken error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return nil, err
	}
	if err != nil {
		return nil, err
	}
	if opts.Assert != nil {
		opts.Assert(tb, res)
	}
	return res, nil
}

// ListTokens lists all active tokens for an integration.
func (i *IntegrationDriver) ListTokens(tb testing.TB, opts ListIntegrationTokensOptions) (*integrationv1.ListIntegrationTokensResponse, error) {
	tb.Helper()
	client := i.getClient()
	res, err := client.ListIntegrationTokens(tb.Context(), &integrationv1.ListIntegrationTokensRequest{
		Provider: opts.Provider,
		Kind:     opts.Kind,
	})
	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("ListTokens succeeded, but expected error containing %q", opts.ExpectErr)
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("ListTokens error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return nil, err
	}
	if err != nil {
		return nil, err
	}
	if opts.Assert != nil {
		opts.Assert(tb, res)
	}
	return res, nil
}

// DeleteToken revokes a specific integration token by ID.
func (i *IntegrationDriver) DeleteToken(tb testing.TB, opts DeleteIntegrationTokenOptions) error {
	tb.Helper()
	client := i.getClient()
	_, err := client.DeleteIntegrationToken(tb.Context(), &integrationv1.DeleteIntegrationTokenRequest{
		Provider: opts.Provider,
		Id:       opts.ID,
		Kind:     opts.Kind,
	})
	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("DeleteToken succeeded, but expected error containing %q", opts.ExpectErr)
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("DeleteToken error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return err
	}
	return err
}

// RotateToken rotates the integration token, issuing a fresh raw token.
func (i *IntegrationDriver) RotateToken(tb testing.TB, opts RotateIntegrationTokenOptions) (*integrationv1.RotateIntegrationTokenResponse, error) {
	tb.Helper()
	client := i.getClient()
	res, err := client.RotateIntegrationToken(tb.Context(), &integrationv1.RotateIntegrationTokenRequest{
		Provider: opts.Provider,
		Kind:     opts.Kind,
	})
	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("RotateToken succeeded, but expected error containing %q", opts.ExpectErr)
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("RotateToken error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return nil, err
	}
	if err != nil {
		return nil, err
	}
	if opts.Assert != nil {
		opts.Assert(tb, res)
	}
	return res, nil
}

// SimulateWebhook simulates webhook payload verification and ingestion synchronously.
func (i *IntegrationDriver) SimulateWebhook(tb testing.TB, opts SimulateWebhookOptions) (*integrationv1.SimulateWebhookResponse, error) {
	tb.Helper()
	client := i.getClient()
	payload := opts.Payload
	if payload == "" && len(opts.Body) > 0 {
		payload = string(opts.Body)
	}
	res, err := client.SimulateWebhook(tb.Context(), &integrationv1.SimulateWebhookRequest{
		Provider: opts.Provider,
		Kind:     opts.Kind,
		Headers:  opts.Headers,
		Payload:  payload,
	})
	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("SimulateWebhook succeeded, but expected error containing %q", opts.ExpectErr)
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("SimulateWebhook error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return nil, err
	}
	if err != nil {
		return nil, err
	}
	if opts.Assert != nil {
		opts.Assert(tb, res)
	}
	return res, nil
}

// PostWebhook sends an HTTP POST request to the Saturn webhook dispatcher (/api/v1/webhooks/...).
func (i *IntegrationDriver) PostWebhook(tb testing.TB, opts PostWebhookOptions) (*http.Response, []byte, error) {
	tb.Helper()
	secret := opts.Secret
	if secret == "" {
		secret = "dev_webhook_secret"
	}

	url := fmt.Sprintf("%s/api/v1/webhooks/%s", i.driver.env.ServerURL, strings.TrimPrefix(opts.Path, "/"))
	req, err := http.NewRequestWithContext(tb.Context(), http.MethodPost, url, bytes.NewReader(opts.Body))
	if err != nil {
		tb.Fatalf("construct webhook HTTP request: %v", err)
	}

	if secret != "none" {
		req.Header.Set("Authorization", "Bearer "+secret)
	}
	for k, v := range opts.Headers {
		req.Header.Set(k, v)
	}

	resp, err := i.driver.httpClient.Do(req)
	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("PostWebhook succeeded, but expected error containing %q", opts.ExpectErr)
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("PostWebhook error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return nil, nil, err
	}
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		tb.Fatalf("read webhook response body: %v", err)
	}

	if opts.Assert != nil {
		opts.Assert(tb, resp, respBody)
	}

	return resp, respBody, nil
}
