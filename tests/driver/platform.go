package driver

import (
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

// PlatformDriver provides driver actions for platform infrastructure (e.g. integrations).
type PlatformDriver struct {
	driver *Driver
}

// IntegrationOptions parameters for creating/ensuring a platform integration.
type IntegrationOptions struct {
	Kind     string
	Provider string
}

// EnsureIntegration ensures an integration channel exists in PostgreSQL for the active space.
func (p *PlatformDriver) EnsureIntegration(tb testing.TB, opts IntegrationOptions) *PlatformDriver {
	tb.Helper()
	if tb.Failed() {
		return p
	}

	spaceID := p.driver.state.SpaceID
	if spaceID == "" {
		tb.Fatalf("EnsureIntegration called without active space context")
	}

	kind := opts.Kind
	if kind == "" {
		tb.Fatalf("EnsureIntegration: Kind option is required")
	}
	provider := opts.Provider
	if provider == "" {
		tb.Fatalf("EnsureIntegration: Provider option is required")
	}

	integrationID, _ := id.Generate("itg_")
	_, err := p.driver.env.DB.Exec(`
		INSERT INTO platform.integration (id, space_id, kind, provider, is_enabled)
		VALUES ($1, $2, $3, $4, true)
		ON CONFLICT (space_id, kind, provider) DO UPDATE SET is_enabled = true
	`, integrationID, spaceID, kind, provider)
	if err != nil {
		tb.Fatalf("EnsureIntegration: failed to insert platform integration: %v", err)
	}

	var resolvedID string
	err = p.driver.env.DB.Get(&resolvedID, `
		SELECT id FROM platform.integration WHERE space_id = $1 AND kind = $2 AND provider = $3
	`, spaceID, kind, provider)
	if err != nil {
		tb.Fatalf("EnsureIntegration: failed to query platform integration: %v", err)
	}

	p.driver.state.LastIntegrationID = resolvedID
	return p
}
