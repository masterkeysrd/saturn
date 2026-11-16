package ai

import (
	"database/sql"
	"encoding/json/v2"
	"fmt"
	"time"

	"github.com/doug-martin/goqu/v9"
	_ "github.com/doug-martin/goqu/v9/dialect/postgres"
	"github.com/masterkeysrd/saturn/internal/platform/db"
)

var pgDialect = goqu.Dialect("postgres")

// PostgresStore aggregates PostgreSQL implementations of all platform/ai stores.
type PostgresStore struct {
	providers  *PostgresProviderStore
	models     *PostgresModelStore
	mcpServers *PostgresMCPServerStore
	agents     *PostgresAgentStore
	threads    *PostgresThreadStore
	runs       *PostgresRunStore
}

// NewStore creates a new PostgreSQL Store backed by database.
func NewStore(database db.DB) *PostgresStore {
	return &PostgresStore{
		providers:  NewProviderStore(database),
		models:     NewModelStore(database),
		mcpServers: NewMCPServerStore(database),
		agents:     NewAgentStore(database),
		threads:    NewThreadStore(database),
		runs:       NewRunStore(database),
	}
}

func (s *PostgresStore) Providers() ProviderStore   { return s.providers }
func (s *PostgresStore) Models() ModelStore         { return s.models }
func (s *PostgresStore) MCPServers() MCPServerStore { return s.mcpServers }
func (s *PostgresStore) Agents() AgentStore         { return s.agents }
func (s *PostgresStore) Threads() ThreadStore       { return s.threads }
func (s *PostgresStore) Runs() RunStore             { return s.runs }

func strPtrToNullStr(s *string) sql.NullString {
	if s == nil || *s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: *s, Valid: true}
}

func timePtrToNullTime(t *time.Time) sql.NullTime {
	if t == nil {
		return sql.NullTime{}
	}
	return sql.NullTime{Time: *t, Valid: true}
}

func nullableBytes(b []byte) any {
	if len(b) == 0 {
		return nil
	}
	return b
}

func marshalJSONB(v any, label string) ([]byte, error) {
	data, err := json.Marshal(v, json.Deterministic(true))
	if err != nil {
		return nil, fmt.Errorf("marshal %s: %w", label, err)
	}
	return data, nil
}

func unmarshalJSONB(data []byte, dst any, label string) error {
	if len(data) == 0 {
		return nil
	}
	if err := json.Unmarshal(data, dst); err != nil {
		return fmt.Errorf("unmarshal %s: %w", label, err)
	}
	return nil
}
