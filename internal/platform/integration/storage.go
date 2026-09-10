package integration

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/log"
)

// Get retrieves an integration matching the provided query parameters.
func (r *Registry) Get(ctx context.Context, query GetIntegration) (*Integration, error) {
	const op errors.Op = "platform/integration/storage.Get"

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
	if err := r.db.Get(ctx, &integration, queryStr, args...); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil // not found
		}
		return nil, errors.E(op, err)
	}
	return &integration, nil
}

// ResolveByToken hashes a raw token and resolves the matching active integration settings.
func (r *Registry) ResolveByToken(ctx context.Context, token string) (*Integration, error) {
	const op errors.Op = "platform/integration/storage.ResolveByToken"

	hash := HashToken(token)
	query := `SELECT i.id, i.space_id, i.kind, i.provider, i.config, i.is_enabled, i.create_time, i.update_time 
	          FROM platform.integration i
	          JOIN platform.integration_token t ON i.id = t.integration_id
	          WHERE t.token_hash = $1 AND i.is_enabled = true`

	var integration Integration
	if err := r.db.Get(ctx, &integration, query, hash); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.Unauthenticated, "invalid or disabled integration token")
		}
		return nil, errors.E(op, err)
	}
	return &integration, nil
}

// Configure registers or updates an integration configuration.
func (r *Registry) Configure(ctx context.Context, cmd ConfigureIntegration) (*Integration, string, error) {
	const op errors.Op = "platform/integration/storage.Configure"

	existing, err := r.Get(ctx, GetIntegration{SpaceID: cmd.SpaceID, Provider: cmd.Provider, Kind: cmd.Kind})
	if err != nil {
		return nil, "", errors.E(op, err)
	}

	var rawToken string
	var integration Integration

	if existing == nil {
		integrationID, err := id.Generate("int_")
		if err != nil {
			return nil, "", errors.E(op, err)
		}

		query := `INSERT INTO platform.integration (id, space_id, kind, provider, config, is_enabled)
		          VALUES ($1, $2, $3, $4, $5, $6)
		          RETURNING id, space_id, kind, provider, config, is_enabled, create_time, update_time`
		if err := r.db.Get(ctx, &integration, query, integrationID, cmd.SpaceID, cmd.Kind, cmd.Provider, cmd.ConfigJSON, cmd.IsEnabled); err != nil {
			return nil, "", errors.E(op, err)
		}

		// Create a default token if provider supports it (e.g. "email")
		if cmd.Provider == "email" {
			tok, err := GenerateToken()
			if err != nil {
				return nil, "", errors.E(op, err)
			}
			rawToken = tok
			hash := HashToken(tok)
			tokenID, err := id.Generate("tok_")
			if err != nil {
				return nil, "", errors.E(op, err)
			}
			tokenQuery := `INSERT INTO platform.integration_token (id, integration_id, name, token_hash)
			               VALUES ($1, $2, $3, $4)`
			if _, err := r.db.Exec(ctx, tokenQuery, tokenID, integration.ID, "Default Key", hash); err != nil {
				return nil, "", errors.E(op, err)
			}
		}
	} else {
		query := `UPDATE platform.integration 
		          SET config = $1, is_enabled = $2, update_time = NOW()
		          WHERE space_id = $3 AND provider = $4 AND kind = $5
		          RETURNING id, space_id, kind, provider, config, is_enabled, create_time, update_time`
		if err := r.db.Get(ctx, &integration, query, cmd.ConfigJSON, cmd.IsEnabled, cmd.SpaceID, cmd.Provider, cmd.Kind); err != nil {
			return nil, "", errors.E(op, err)
		}
	}

	return &integration, rawToken, nil
}

// RotateToken generates and replaces the integration token, returning the new raw token.
func (r *Registry) RotateToken(ctx context.Context, query GetIntegration) (string, error) {
	const op errors.Op = "platform/integration/storage.RotateToken"

	existing, err := r.Get(ctx, query)
	if err != nil {
		return "", errors.E(op, err)
	}
	if existing == nil {
		return "", errors.E(op, errors.Precondition, "integration must be configured first before rotating token")
	}

	log.Info(ctx, "rotating integration default token",
		log.String("integration_id", existing.ID),
		log.String("provider", query.Provider),
		log.String("kind", query.Kind),
		log.String("space_id", query.SpaceID),
	)

	tok, err := GenerateToken()
	if err != nil {
		return "", errors.E(op, err)
	}
	hash := HashToken(tok)

	// Clean up older default keys
	_, _ = r.db.Exec(ctx, `DELETE FROM platform.integration_token WHERE integration_id = $1 AND name = $2`, existing.ID, "Default Key")

	tokenID, err := id.Generate("tok_")
	if err != nil {
		return "", errors.E(op, err)
	}
	if _, err := r.db.Exec(ctx, `INSERT INTO platform.integration_token (id, integration_id, name, token_hash) VALUES ($1, $2, $3, $4)`, tokenID, existing.ID, "Default Key", hash); err != nil {
		return "", errors.E(op, err)
	}

	return tok, nil
}

// List retrieves all integrations configured for a space.
func (r *Registry) List(ctx context.Context, spaceID string) ([]*Integration, error) {
	const op errors.Op = "platform/integration/storage.List"

	query := `SELECT id, space_id, kind, provider, config, is_enabled, create_time, update_time 
	          FROM platform.integration WHERE space_id = $1`
	var list []*Integration
	if err := r.db.Select(ctx, &list, query, spaceID); err != nil {
		return nil, errors.E(op, err)
	}
	return list, nil
}

// CreateToken generates and stores a new integration token.
func (r *Registry) CreateToken(ctx context.Context, integrationID, name string) (*IntegrationToken, string, error) {
	const op errors.Op = "platform/integration/storage.CreateToken"

	tok, err := GenerateToken()
	if err != nil {
		return nil, "", errors.E(op, err)
	}
	hash := HashToken(tok)

	tokenID, err := id.Generate("tok_")
	if err != nil {
		return nil, "", errors.E(op, err)
	}

	query := `INSERT INTO platform.integration_token (id, integration_id, name, token_hash)
	          VALUES ($1, $2, $3, $4)
	          RETURNING id, integration_id, name, token_hash, create_time, last_used_time`
	var token IntegrationToken
	if err := r.db.Get(ctx, &token, query, tokenID, integrationID, name, hash); err != nil {
		return nil, "", errors.E(op, err)
	}

	return &token, tok, nil
}

// ListTokens retrieves all tokens for a given integration ID.
func (r *Registry) ListTokens(ctx context.Context, integrationID string) ([]*IntegrationToken, error) {
	const op errors.Op = "platform/integration/storage.ListTokens"

	query := `SELECT id, integration_id, name, token_hash, create_time, last_used_time 
	          FROM platform.integration_token WHERE integration_id = $1`
	var list []*IntegrationToken
	if err := r.db.Select(ctx, &list, query, integrationID); err != nil {
		return nil, errors.E(op, err)
	}
	return list, nil
}

// DeleteToken revokes/deletes a specific token.
func (r *Registry) DeleteToken(ctx context.Context, integrationID, tokenID string) error {
	const op errors.Op = "platform/integration/storage.DeleteToken"

	query := `DELETE FROM platform.integration_token WHERE id = $1 AND integration_id = $2`
	if err := r.db.ExecOne(ctx, query, tokenID, integrationID); err != nil {
		return errors.E(op, err)
	}
	return nil
}
