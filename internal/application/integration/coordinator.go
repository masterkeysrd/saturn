package integration

import (
	"context"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/integration"
)

// WebhookSimulator defines the interface that an integration provider can implement
// if it supports webhook simulation.
type WebhookSimulator interface {
	Simulate(ctx context.Context, spaceID string, headers map[string][]string, body []byte) (*finance.PendingTransaction, error)
}

// Dependencies wraps the required resources for the integrations application.
type Dependencies struct {
	Registry *integration.Registry
}

// Coordinator orchestrates application workflows for configuring integrations,
// simulating incoming webhook requests, and managing authorization keys.
type Coordinator struct {
	registry *integration.Registry
}

// NewCoordinator creates a new integrations Coordinator.
func NewCoordinator(deps Dependencies) *Coordinator {
	return &Coordinator{
		registry: deps.Registry,
	}
}

// Get retrieves an integration by parameters.
func (c *Coordinator) Get(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error) {
	return c.registry.Get(ctx, query)
}

// Configure registers or updates an integration settings config.
func (c *Coordinator) Configure(ctx context.Context, cmd integration.ConfigureIntegration) (*integration.Integration, string, error) {
	return c.registry.Configure(ctx, cmd)
}

// List returns all active configured integrations for the space.
func (c *Coordinator) List(ctx context.Context, spaceID string) ([]*integration.Integration, error) {
	return c.registry.List(ctx, spaceID)
}

// ListCatalog returns catalog descriptors from all active providers in the system.
func (c *Coordinator) ListCatalog() []integration.Descriptor {
	return c.registry.ListCatalog()
}

// CreateToken creates a named access token under an active integration.
func (c *Coordinator) CreateToken(ctx context.Context, query integration.GetIntegration, name string) (*integration.IntegrationToken, string, error) {
	i, err := c.Get(ctx, query)
	if err != nil {
		return nil, "", err
	}
	if i == nil {
		return nil, "", fmt.Errorf("integration not found for provider %s and kind %s", query.Provider, query.Kind)
	}
	return c.registry.CreateToken(ctx, i.ID, name)
}

// ListTokens lists all active tokens configured for an integration.
func (c *Coordinator) ListTokens(ctx context.Context, query integration.GetIntegration) ([]*integration.IntegrationToken, error) {
	i, err := c.Get(ctx, query)
	if err != nil {
		return nil, err
	}
	if i == nil {
		return nil, nil
	}
	return c.registry.ListTokens(ctx, i.ID)
}

// DeleteToken revokes a specific access token.
func (c *Coordinator) DeleteToken(ctx context.Context, query integration.GetIntegration, tokenID string) error {
	i, err := c.Get(ctx, query)
	if err != nil {
		return err
	}
	if i == nil {
		return fmt.Errorf("integration not found for provider %s and kind %s", query.Provider, query.Kind)
	}
	return c.registry.DeleteToken(ctx, i.ID, tokenID)
}

// SimulateWebhook simulates webhook payload verification and ingestion.
func (c *Coordinator) SimulateWebhook(ctx context.Context, spaceID, providerName, kind string, headers map[string][]string, body []byte) (*finance.PendingTransaction, error) {
	prov, exists := c.registry.GetProvider(providerName)
	if !exists {
		return nil, fmt.Errorf("provider %s not found", providerName)
	}

	sim, ok := prov.(WebhookSimulator)
	if !ok {
		return nil, fmt.Errorf("provider %s does not support simulation", providerName)
	}

	return sim.Simulate(ctx, spaceID, headers, body)
}
