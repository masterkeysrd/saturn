package integration

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

// Get retrieves an integration matching the provided query parameters.
func (r *Registry) Get(ctx context.Context, query GetIntegration) (*Integration, error) {
	var queryStr string
	var args []any
	if query.Kind != "" {
		queryStr = `SELECT id, space_id, kind, provider, config, is_enabled, create_time, update_time 
		            FROM platform.integration WHERE space_id = $1 AND provider = $2 AND kind = $3`
		args = []any{query.SpaceID, query.Provider, query.Kind}
	} else {
		queryStr = `SELECT id, space_id, kind, provider, config, is_enabled, create_time, update_time 
		            FROM platform.integration WHERE space_id = $1 AND provider = $2`
		args = []any{query.SpaceID, query.Provider}
	}
	var integration Integration
	err := r.db.GetContext(ctx, &integration, queryStr, args...)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil // not found
		}
		return nil, fmt.Errorf("query integration: %w", err)
	}
	return &integration, nil
}

// ResolveByToken hashes a raw token and resolves the matching active integration settings.
func (r *Registry) ResolveByToken(ctx context.Context, token string) (*Integration, error) {
	hash := HashToken(token)
	query := `SELECT i.id, i.space_id, i.kind, i.provider, i.config, i.is_enabled, i.create_time, i.update_time 
	          FROM platform.integration i
	          JOIN platform.integration_token t ON i.id = t.integration_id
	          WHERE t.token_hash = $1 AND i.is_enabled = true`
	var integration Integration
	err := r.db.GetContext(ctx, &integration, query, hash)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("invalid or disabled integration token")
		}
		return nil, fmt.Errorf("query integration by token hash: %w", err)
	}
	return &integration, nil
}

// Configure registers or updates an integration configuration.
func (r *Registry) Configure(ctx context.Context, cmd ConfigureIntegration) (*Integration, string, error) {
	existing, err := r.Get(ctx, GetIntegration{SpaceID: cmd.SpaceID, Provider: cmd.Provider, Kind: cmd.Kind})
	if err != nil {
		return nil, "", err
	}

	var rawToken string
	var integration Integration

	if existing == nil {
		integrationID, err := id.Generate("int_")
		if err != nil {
			return nil, "", fmt.Errorf("generate integration ID: %w", err)
		}

		query := `INSERT INTO platform.integration (id, space_id, kind, provider, config, is_enabled)
		          VALUES ($1, $2, $3, $4, $5, $6)
		          RETURNING id, space_id, kind, provider, config, is_enabled, create_time, update_time`
		err = r.db.GetContext(ctx, &integration, query, integrationID, cmd.SpaceID, cmd.Kind, cmd.Provider, cmd.ConfigJSON, cmd.IsEnabled)
		if err != nil {
			return nil, "", fmt.Errorf("insert integration: %w", err)
		}

		// Create a default token if provider supports it (e.g. "email")
		if cmd.Provider == "email" {
			tok, err := GenerateToken()
			if err != nil {
				return nil, "", fmt.Errorf("generate default token: %w", err)
			}
			rawToken = tok
			hash := HashToken(tok)
			tokenID, err := id.Generate("tok_")
			if err != nil {
				return nil, "", fmt.Errorf("generate token ID: %w", err)
			}
			tokenQuery := `INSERT INTO platform.integration_token (id, integration_id, name, token_hash)
			               VALUES ($1, $2, $3, $4)`
			_, err = r.db.ExecContext(ctx, tokenQuery, tokenID, integration.ID, "Default Key", hash)
			if err != nil {
				return nil, "", fmt.Errorf("insert default token: %w", err)
			}
		}
	} else {
		query := `UPDATE platform.integration 
		          SET config = $1, is_enabled = $2, update_time = NOW()
		          WHERE space_id = $3 AND provider = $4 AND kind = $5
		          RETURNING id, space_id, kind, provider, config, is_enabled, create_time, update_time`
		err = r.db.GetContext(ctx, &integration, query, cmd.ConfigJSON, cmd.IsEnabled, cmd.SpaceID, cmd.Provider, cmd.Kind)
		if err != nil {
			return nil, "", fmt.Errorf("update integration: %w", err)
		}
	}

	return &integration, rawToken, nil
}

// RotateToken generates and replaces the integration token, returning the new raw token.
func (r *Registry) RotateToken(ctx context.Context, query GetIntegration) (string, error) {
	existing, err := r.Get(ctx, query)
	if err != nil {
		return "", err
	}
	if existing == nil {
		return "", errors.New("integration must be configured first before rotating token")
	}

	tok, err := GenerateToken()
	if err != nil {
		return "", fmt.Errorf("generate integration token: %w", err)
	}
	hash := HashToken(tok)

	// Clean up older default keys
	_, _ = r.db.ExecContext(ctx, `DELETE FROM platform.integration_token WHERE integration_id = $1 AND name = $2`, existing.ID, "Default Key")

	tokenID, err := id.Generate("tok_")
	if err != nil {
		return "", err
	}
	_, err = r.db.ExecContext(ctx, `INSERT INTO platform.integration_token (id, integration_id, name, token_hash) VALUES ($1, $2, $3, $4)`, tokenID, existing.ID, "Default Key", hash)
	if err != nil {
		return "", fmt.Errorf("insert rotated default token: %w", err)
	}

	return tok, nil
}

// List retrieves all integrations configured for a space.
func (r *Registry) List(ctx context.Context, spaceID string) ([]*Integration, error) {
	query := `SELECT id, space_id, kind, provider, config, is_enabled, create_time, update_time 
	          FROM platform.integration WHERE space_id = $1`
	var list []*Integration
	err := r.db.SelectContext(ctx, &list, query, spaceID)
	if err != nil {
		return nil, fmt.Errorf("select integrations: %w", err)
	}
	return list, nil
}

// CreateToken generates and stores a new integration token.
func (r *Registry) CreateToken(ctx context.Context, integrationID, name string) (*IntegrationToken, string, error) {
	tok, err := GenerateToken()
	if err != nil {
		return nil, "", err
	}
	hash := HashToken(tok)

	tokenID, err := id.Generate("tok_")
	if err != nil {
		return nil, "", err
	}

	query := `INSERT INTO platform.integration_token (id, integration_id, name, token_hash)
	          VALUES ($1, $2, $3, $4)
	          RETURNING id, integration_id, name, token_hash, create_time, last_used_time`
	var token IntegrationToken
	err = r.db.GetContext(ctx, &token, query, tokenID, integrationID, name, hash)
	if err != nil {
		return nil, "", fmt.Errorf("insert integration token: %w", err)
	}

	return &token, tok, nil
}

// ListTokens retrieves all tokens for a given integration ID.
func (r *Registry) ListTokens(ctx context.Context, integrationID string) ([]*IntegrationToken, error) {
	query := `SELECT id, integration_id, name, token_hash, create_time, last_used_time 
	          FROM platform.integration_token WHERE integration_id = $1`
	var list []*IntegrationToken
	err := r.db.SelectContext(ctx, &list, query, integrationID)
	if err != nil {
		return nil, fmt.Errorf("select integration tokens: %w", err)
	}
	return list, nil
}

// DeleteToken revokes/deletes a specific token.
func (r *Registry) DeleteToken(ctx context.Context, integrationID, tokenID string) error {
	query := `DELETE FROM platform.integration_token WHERE id = $1 AND integration_id = $2`
	_, err := r.db.ExecContext(ctx, query, tokenID, integrationID)
	if err != nil {
		return fmt.Errorf("delete integration token: %w", err)
	}
	return nil
}
