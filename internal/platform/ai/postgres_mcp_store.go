package ai

import (
	"context"
	"database/sql"
	"encoding/json/v2"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// PostgresMCPServerStore implements MCPServerStore against `platform.ai_mcp_servers`.
type PostgresMCPServerStore struct {
	db db.DB
}

// NewMCPServerStore constructs a PostgresMCPServerStore.
func NewMCPServerStore(database db.DB) *PostgresMCPServerStore {
	return &PostgresMCPServerStore{db: database}
}

type mcpServerRow struct {
	ID          string         `db:"id"`
	SpaceID     string         `db:"space_id"`
	SystemKey   sql.NullString `db:"system_key"`
	IsSystem    bool           `db:"is_system"`
	Slug        string         `db:"slug"`
	Name        string         `db:"name"`
	Description string         `db:"description"`
	Transport   string         `db:"transport"`
	Config      []byte         `db:"config"`
	AuthSecret  sql.NullString `db:"auth_secret"`
	Discovery   []byte         `db:"discovery"`
	IsEnabled   bool           `db:"is_enabled"`
	CreateTime  time.Time      `db:"create_time"`
	UpdateTime  time.Time      `db:"update_time"`
}

func (r *mcpServerRow) toDomain() (*MCPServer, error) {
	m := &MCPServer{
		ID:          r.ID,
		SpaceID:     r.SpaceID,
		IsSystem:    r.IsSystem,
		Slug:        r.Slug,
		Name:        r.Name,
		Description: r.Description,
		Transport:   MCPTransport(r.Transport),
		IsEnabled:   r.IsEnabled,
		CreateTime:  r.CreateTime,
		UpdateTime:  r.UpdateTime,
	}
	if r.SystemKey.Valid {
		m.SystemKey = new(r.SystemKey.String)
	}
	if err := unmarshalJSONB(r.Config, &m.Config, "mcp server config"); err != nil {
		return nil, err
	}
	if err := unmarshalJSONB(r.Discovery, &m.Discovery, "mcp server discovery"); err != nil {
		return nil, err
	}
	if m.Discovery.HealthStatus == "" {
		m.Discovery.HealthStatus = MCPHealthUnknown
	}
	if r.AuthSecret.Valid && r.AuthSecret.String != "" {
		m.AuthSecretCiphertext = new(r.AuthSecret.String)
		m.HasAuthSecret = true
		if strings.HasPrefix(strings.TrimSpace(r.AuthSecret.String), "{") {
			var sec MCPAuthSecret
			if err := json.Unmarshal([]byte(r.AuthSecret.String), &sec); err == nil {
				m.AuthSecret = &sec
			}
		}
	}
	return m, nil
}

func (s *PostgresMCPServerStore) Create(ctx context.Context, m *MCPServer) error {
	const op errors.Op = "platform/ai.MCPServerStore.Create"

	if m.ID == "" {
		idStr, err := GenerateMCPServerID()
		if err != nil {
			return errors.E(op, err)
		}
		m.ID = idStr
	}

	configBytes, err := marshalJSONB(m.Config, "mcp server config")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}
	discoveryBytes, err := marshalJSONB(m.Discovery, "mcp server discovery")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}
	secretVal, err := mcpSecretColumn(m)
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}

	const query = `
		INSERT INTO platform.ai_mcp_servers (
			id, space_id, system_key, is_system, slug, name, description, transport,
			config, auth_secret, discovery, is_enabled, create_time, update_time
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
		RETURNING create_time, update_time
	`
	var times struct {
		CreateTime time.Time `db:"create_time"`
		UpdateTime time.Time `db:"update_time"`
	}
	if err := s.db.Get(
		ctx,
		&times,
		query,
		m.ID,
		m.SpaceID,
		strPtrToNullStr(m.SystemKey),
		m.IsSystem,
		m.Slug,
		m.Name,
		m.Description,
		string(m.Transport),
		configBytes,
		secretVal,
		discoveryBytes,
		m.IsEnabled,
	); err != nil {
		return errors.E(op, err)
	}
	m.CreateTime = times.CreateTime
	m.UpdateTime = times.UpdateTime
	return nil
}

func (s *PostgresMCPServerStore) Get(ctx context.Context, spaceID, id string) (*MCPServer, error) {
	const op errors.Op = "platform/ai.MCPServerStore.Get"

	const query = `
		SELECT id, space_id, system_key, is_system, slug, name, description, transport,
		       config, auth_secret, discovery, is_enabled, create_time, update_time
		FROM platform.ai_mcp_servers
		WHERE space_id = $1 AND (id = $2 OR system_key = $2)
	`
	return s.getOne(ctx, op, query, spaceID, id)
}

func (s *PostgresMCPServerStore) GetBySystemKey(ctx context.Context, spaceID, systemKey string) (*MCPServer, error) {
	const op errors.Op = "platform/ai.MCPServerStore.GetBySystemKey"

	const query = `
		SELECT id, space_id, system_key, is_system, slug, name, description, transport,
		       config, auth_secret, discovery, is_enabled, create_time, update_time
		FROM platform.ai_mcp_servers
		WHERE space_id = $1 AND system_key = $2
	`
	return s.getOne(ctx, op, query, spaceID, systemKey)
}

func (s *PostgresMCPServerStore) GetBySlug(ctx context.Context, spaceID, slug string) (*MCPServer, error) {
	const op errors.Op = "platform/ai.MCPServerStore.GetBySlug"

	const query = `
		SELECT id, space_id, system_key, is_system, slug, name, description, transport,
		       config, auth_secret, discovery, is_enabled, create_time, update_time
		FROM platform.ai_mcp_servers
		WHERE space_id = $1 AND slug = $2
	`
	return s.getOne(ctx, op, query, spaceID, slug)
}

func (s *PostgresMCPServerStore) getOne(ctx context.Context, op errors.Op, query, spaceID, key string) (*MCPServer, error) {
	var row mcpServerRow
	if err := s.db.Get(ctx, &row, query, spaceID, key); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, ErrMCPServerNotFound
		}
		return nil, errors.E(op, err)
	}
	m, err := row.toDomain()
	if err != nil {
		return nil, errors.E(op, errors.Internal, err)
	}
	return m, nil
}

func (s *PostgresMCPServerStore) List(ctx context.Context, spaceID string) ([]*MCPServer, error) {
	const op errors.Op = "platform/ai.MCPServerStore.List"

	const query = `
		SELECT id, space_id, system_key, is_system, slug, name, description, transport,
		       config, auth_secret, discovery, is_enabled, create_time, update_time
		FROM platform.ai_mcp_servers
		WHERE space_id = $1
		ORDER BY is_system DESC, create_time DESC
	`
	var rows []mcpServerRow
	if err := s.db.Select(ctx, &rows, query, spaceID); err != nil {
		return nil, errors.E(op, err)
	}
	out := make([]*MCPServer, 0, len(rows))
	for i := range rows {
		m, err := rows[i].toDomain()
		if err != nil {
			return nil, errors.E(op, errors.Internal, err)
		}
		out = append(out, m)
	}
	return out, nil
}

func (s *PostgresMCPServerStore) Update(ctx context.Context, m *MCPServer) error {
	const op errors.Op = "platform/ai.MCPServerStore.Update"

	configBytes, err := marshalJSONB(m.Config, "mcp server config")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}
	discoveryBytes, err := marshalJSONB(m.Discovery, "mcp server discovery")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}
	secretVal, err := mcpSecretColumn(m)
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}

	const query = `
		UPDATE platform.ai_mcp_servers
		SET slug = $3,
		    name = $4,
		    description = $5,
		    config = $6,
		    auth_secret = $7,
		    discovery = $8,
		    is_enabled = $9,
		    update_time = NOW()
		WHERE space_id = $1 AND id = $2
		RETURNING update_time
	`
	var updateTime time.Time
	if err := s.db.Get(ctx, &updateTime, query, m.SpaceID, m.ID, m.Slug, m.Name, m.Description, configBytes, secretVal, discoveryBytes, m.IsEnabled); err != nil {
		if errors.Is(err, errors.NotExist) {
			return ErrMCPServerNotFound
		}
		return errors.E(op, err)
	}
	m.UpdateTime = updateTime
	return nil
}

func (s *PostgresMCPServerStore) Delete(ctx context.Context, spaceID, id string) error {
	const op errors.Op = "platform/ai.MCPServerStore.Delete"

	const query = `DELETE FROM platform.ai_mcp_servers WHERE space_id = $1 AND id = $2`
	if err := s.db.ExecOne(ctx, query, spaceID, id); err != nil {
		if errors.Is(err, errors.NotExist) {
			return ErrMCPServerNotFound
		}
		return errors.E(op, err)
	}
	return nil
}

func mcpSecretColumn(m *MCPServer) (sql.NullString, error) {
	if m.AuthSecretCiphertext != nil && *m.AuthSecretCiphertext != "" {
		return sql.NullString{String: *m.AuthSecretCiphertext, Valid: true}, nil
	}
	if m.AuthSecret != nil && m.AuthSecret.HasCredentials() {
		raw, err := json.Marshal(m.AuthSecret, json.Deterministic(true))
		if err != nil {
			return sql.NullString{}, err
		}
		return sql.NullString{String: string(raw), Valid: true}, nil
	}
	return sql.NullString{}, nil
}
