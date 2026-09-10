package integration

import (
	"context"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/integration"
)

// WebhookSimulator defines the interface that an integration provider can implement
// if it supports webhook simulation.
type WebhookSimulator interface {
	Simulate(ctx context.Context, spaceID string, headers map[string][]string, body []byte) (any, error)
}

// Dependencies wraps the required resources for the integrations application.
type Dependencies struct {
	Registry *integration.Registry
}

// Coordinator orchestrates application workflows for configuring integrations,
// simulating incoming webhook requests, and managing authorization keys.
type Coordinator interface {
	Get(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error)
	Configure(ctx context.Context, cmd integration.ConfigureIntegration) (*integration.Integration, string, error)
	List(ctx context.Context, spaceID string) ([]*integration.Integration, error)
	ListCatalog() []integration.Descriptor
	CreateToken(ctx context.Context, query integration.GetIntegration, name string) (*integration.IntegrationToken, string, error)
	ListTokens(ctx context.Context, query integration.GetIntegration) ([]*integration.IntegrationToken, error)
	DeleteToken(ctx context.Context, query integration.GetIntegration, tokenID string) error
	SimulateWebhook(ctx context.Context, spaceID, providerName, kind string, headers map[string][]string, body []byte) (any, error)
}

type coordinator struct {
	registry *integration.Registry
}

// NewCoordinator creates a new integrations Coordinator.
func NewCoordinator(deps Dependencies) Coordinator {
	return &coordinator{
		registry: deps.Registry,
	}
}

// Get retrieves an integration by parameters.
func (c *coordinator) Get(ctx context.Context, query integration.GetIntegration) (*integration.Integration, error) {
	const op errors.Op = "application/integration.Get"

	i, err := c.registry.Get(ctx, query)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return i, nil
}

// Configure registers or updates an integration settings config.
func (c *coordinator) Configure(ctx context.Context, cmd integration.ConfigureIntegration) (*integration.Integration, string, error) {
	const op errors.Op = "application/integration.Configure"

	i, tok, err := c.registry.Configure(ctx, cmd)
	if err != nil {
		return nil, "", errors.E(op, err)
	}
	return i, tok, nil
}

// List returns all active configured integrations for the space.
func (c *coordinator) List(ctx context.Context, spaceID string) ([]*integration.Integration, error) {
	const op errors.Op = "application/integration.List"

	list, err := c.registry.List(ctx, spaceID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return list, nil
}

// ListCatalog returns catalog descriptors from all active providers in the system.
func (c *coordinator) ListCatalog() []integration.Descriptor {
	return c.registry.ListCatalog()
}

// CreateToken creates a named access token under an active integration.
func (c *coordinator) CreateToken(ctx context.Context, query integration.GetIntegration, name string) (*integration.IntegrationToken, string, error) {
	const op errors.Op = "application/integration.CreateToken"

	if name == "" {
		return nil, "", errors.E(op, errors.Invalid, "token name is required")
	}

	i, err := c.Get(ctx, query)
	if err != nil {
		return nil, "", errors.E(op, err)
	}
	if i == nil {
		return nil, "", errors.E(op, errors.NotExist, IntegrationNotFound, fmt.Sprintf("integration not found for provider %s and kind %s", query.Provider, query.Kind))
	}

	token, rawToken, err := c.registry.CreateToken(ctx, i.ID, name)
	if err != nil {
		return nil, "", errors.E(op, err)
	}
	return token, rawToken, nil
}

// ListTokens lists all active tokens configured for an integration.
func (c *coordinator) ListTokens(ctx context.Context, query integration.GetIntegration) ([]*integration.IntegrationToken, error) {
	const op errors.Op = "application/integration.ListTokens"

	i, err := c.Get(ctx, query)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if i == nil {
		return nil, nil
	}

	tokens, err := c.registry.ListTokens(ctx, i.ID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return tokens, nil
}

// DeleteToken revokes a specific access token.
func (c *coordinator) DeleteToken(ctx context.Context, query integration.GetIntegration, tokenID string) error {
	const op errors.Op = "application/integration.DeleteToken"

	i, err := c.Get(ctx, query)
	if err != nil {
		return errors.E(op, err)
	}
	if i == nil {
		return errors.E(op, errors.NotExist, IntegrationNotFound, fmt.Sprintf("integration not found for provider %s and kind %s", query.Provider, query.Kind))
	}

	if err := c.registry.DeleteToken(ctx, i.ID, tokenID); err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.NotExist, TokenNotFound, "integration token not found")
		}
		return errors.E(op, err)
	}
	return nil
}

// SimulateWebhook simulates webhook payload verification and ingestion.
func (c *coordinator) SimulateWebhook(ctx context.Context, spaceID, providerName, kind string, headers map[string][]string, body []byte) (any, error) {
	const op errors.Op = "application/integration.SimulateWebhook"

	prov, exists := c.registry.GetProvider(providerName)
	if !exists {
		return nil, errors.E(op, errors.NotExist, ProviderNotFound, fmt.Sprintf("provider %s not found", providerName))
	}

	sim, ok := prov.(WebhookSimulator)
	if !ok {
		return nil, errors.E(op, errors.Invalid, SimulationNotSupported, fmt.Sprintf("provider %s does not support simulation", providerName))
	}

	res, err := sim.Simulate(ctx, spaceID, headers, body)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return res, nil
}
