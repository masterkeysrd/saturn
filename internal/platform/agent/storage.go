package agent

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// Store handles SQL operations for the agents and LLM providers tables.
type Store struct {
	db *sqlx.DB
}

// NewStore initializes a new Store instance.
func NewStore(db *sqlx.DB) *Store {
	return &Store{db: db}
}

// ============================================================================
// LLM Provider Storage Operations
// ============================================================================

// CreateProvider inserts a new LLM provider config.
func (s *Store) CreateProvider(ctx context.Context, spaceID string, name string, mode CompatibilityMode, url *string, key *string) (*LLMProvider, error) {
	providerID, err := id.Generate("prv_")
	if err != nil {
		return nil, err
	}

	query := `INSERT INTO platform.llm_providers (id, space_id, name, compatibility_mode, api_url, api_key, create_time, update_time)
	          VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
	          RETURNING id, space_id, name, compatibility_mode, api_url, api_key, create_time, update_time`

	var p LLMProvider
	err = s.db.GetContext(ctx, &p, query, providerID, spaceID, name, mode, url, key)
	if err != nil {
		return nil, fmt.Errorf("create llm provider: %w", err)
	}
	return &p, nil
}

// GetProvider retrieves a single LLM provider record.
func (s *Store) GetProvider(ctx context.Context, q GetLLMProvider) (*LLMProvider, error) {
	query := `SELECT id, space_id, name, compatibility_mode, api_url, api_key, create_time, update_time
	          FROM platform.llm_providers WHERE space_id = $1 AND id = $2`

	var p LLMProvider
	err := s.db.GetContext(ctx, &p, query, q.SpaceID, q.ID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("get llm provider: %w", err)
	}
	return &p, nil
}

// ListProviders lists all LLM providers in a space.
func (s *Store) ListProviders(ctx context.Context, spaceID string) ([]*LLMProvider, error) {
	query := `SELECT id, space_id, name, compatibility_mode, api_url, api_key, create_time, update_time
	          FROM platform.llm_providers WHERE space_id = $1 ORDER BY create_time DESC`

	var list []*LLMProvider
	err := s.db.SelectContext(ctx, &list, query, spaceID)
	if err != nil {
		return nil, fmt.Errorf("list llm providers: %w", err)
	}
	return list, nil
}

// UpdateProvider updates LLM provider details.
func (s *Store) UpdateProvider(ctx context.Context, spaceID string, id string, name string, url *string, key *string) (*LLMProvider, error) {
	query := `UPDATE platform.llm_providers
	          SET name = $3, api_url = $4, api_key = COALESCE($5, api_key), update_time = NOW()
	          WHERE space_id = $1 AND id = $2
	          RETURNING id, space_id, name, compatibility_mode, api_url, api_key, create_time, update_time`

	var p LLMProvider
	err := s.db.GetContext(ctx, &p, query, spaceID, id, name, url, key)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("llm provider not found")
		}
		return nil, fmt.Errorf("update llm provider: %w", err)
	}
	return &p, nil
}

// DeleteProvider deletes an LLM provider record.
func (s *Store) DeleteProvider(ctx context.Context, spaceID string, id string) error {
	query := `DELETE FROM platform.llm_providers WHERE space_id = $1 AND id = $2`
	res, err := s.db.ExecContext(ctx, query, spaceID, id)
	if err != nil {
		return fmt.Errorf("delete llm provider: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return errors.New("llm provider not found")
	}
	return nil
}

// ============================================================================
// Agent Storage Operations
// ============================================================================

// CreateAgent registers a new agent instance.
func (s *Store) CreateAgent(ctx context.Context, spaceID string, providerID *string, name string, desc *string, purpose string, tags []string, model string, prompt *string, temp float64) (*Agent, error) {
	if tags == nil {
		tags = []string{}
	}

	agentID, err := id.Generate("agt_")
	if err != nil {
		return nil, err
	}

	query := `INSERT INTO platform.agents (id, space_id, llm_provider_id, name, description, purpose, tags, model_name, system_instruction, temperature, is_enabled, create_time, update_time)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, NOW(), NOW())
	          RETURNING id, space_id, llm_provider_id, name, description, purpose, tags, model_name, system_instruction, temperature, is_enabled, create_time, update_time`

	var a Agent
	err = s.db.GetContext(ctx, &a, query, agentID, spaceID, providerID, name, desc, purpose, pq.Array(tags), model, prompt, temp)
	if err != nil {
		return nil, fmt.Errorf("create agent: %w", err)
	}
	return &a, nil
}

// GetAgent retrieves a single Agent by purpose or ID.
func (s *Store) GetAgent(ctx context.Context, q GetAgent) (*Agent, error) {
	var query string
	var args []any

	if q.Purpose != "" {
		query = `SELECT id, space_id, llm_provider_id, name, description, purpose, tags, model_name, system_instruction, temperature, is_enabled, create_time, update_time
		         FROM platform.agents WHERE space_id = $1 AND purpose = $2 AND is_enabled = TRUE LIMIT 1`
		args = []any{q.SpaceID, q.Purpose}
	} else {
		query = `SELECT id, space_id, llm_provider_id, name, description, purpose, tags, model_name, system_instruction, temperature, is_enabled, create_time, update_time
		         FROM platform.agents WHERE space_id = $1 AND id = $2`
		args = []any{q.SpaceID, q.ID}
	}

	var a Agent
	err := s.db.GetContext(ctx, &a, query, args...)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("get agent: %w", err)
	}
	return &a, nil
}

// ListAgents lists all agents configured in a workspace.
func (s *Store) ListAgents(ctx context.Context, spaceID string) ([]*Agent, error) {
	query := `SELECT id, space_id, llm_provider_id, name, description, purpose, tags, model_name, system_instruction, temperature, is_enabled, create_time, update_time
	          FROM platform.agents WHERE space_id = $1 ORDER BY create_time DESC`

	var list []*Agent
	err := s.db.SelectContext(ctx, &list, query, spaceID)
	if err != nil {
		return nil, fmt.Errorf("list agents: %w", err)
	}
	return list, nil
}

// UpdateAgent modifies agent configuration.
func (s *Store) UpdateAgent(ctx context.Context, spaceID string, id string, providerID *string, name string, desc *string, tags []string, model string, prompt *string, temp float64, isEnabled bool) (*Agent, error) {
	if tags == nil {
		tags = []string{}
	}

	query := `UPDATE platform.agents
	          SET llm_provider_id = $3, name = $4, description = $5, tags = $6, model_name = $7, system_instruction = $8, temperature = $9, is_enabled = $10, update_time = NOW()
	          WHERE space_id = $1 AND id = $2
	          RETURNING id, space_id, llm_provider_id, name, description, purpose, tags, model_name, system_instruction, temperature, is_enabled, create_time, update_time`

	var a Agent
	err := s.db.GetContext(ctx, &a, query, spaceID, id, providerID, name, desc, pq.Array(tags), model, prompt, temp, isEnabled)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("agent not found")
		}
		return nil, fmt.Errorf("update agent: %w", err)
	}
	return &a, nil
}

// DeleteAgent deletes an Agent record.
func (s *Store) DeleteAgent(ctx context.Context, spaceID string, id string) error {
	query := `DELETE FROM platform.agents WHERE space_id = $1 AND id = $2`
	res, err := s.db.ExecContext(ctx, query, spaceID, id)
	if err != nil {
		return fmt.Errorf("delete agent: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return errors.New("agent not found")
	}
	return nil
}

// ============================================================================
// Agent Runs Logging Operations
// ============================================================================

// LogRun inserts a record of an agent execution attempt.
func (s *Store) LogRun(ctx context.Context, agentID string, spaceID string, status AgentRunStatus, input string, output *string, errMsg *string, tokens int) (*AgentRun, error) {
	runID, err := id.Generate("run_")
	if err != nil {
		return nil, err
	}

	query := `INSERT INTO platform.agent_runs (id, agent_id, space_id, status, input_raw, output_raw, error_message, tokens_used, create_time)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
	          RETURNING id, agent_id, space_id, status, input_raw, output_raw, error_message, tokens_used, create_time`

	var r AgentRun
	err = s.db.GetContext(ctx, &r, query, runID, agentID, spaceID, status, input, output, errMsg, tokens)
	if err != nil {
		return nil, fmt.Errorf("log agent run: %w", err)
	}
	return &r, nil
}

// ListRuns lists execution logs for an agent with cursor-based pagination.
func (s *Store) ListRuns(ctx context.Context, q ListAgentRuns) (*paging.Page[*AgentRun], error) {
	pageSize := int(q.PageSize)
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	cursor, err := paging.Decode(q.PageToken)
	if err != nil {
		return nil, fmt.Errorf("invalid page token: %w", err)
	}

	query := `SELECT id, agent_id, space_id, status, input_raw, output_raw, error_message, tokens_used, create_time
	          FROM platform.agent_runs WHERE space_id = $1 AND agent_id = $2`

	args := []any{q.SpaceID, q.AgentID}
	argIdx := 3

	if cursor != nil {
		cursorTime, err := time.Parse(time.RFC3339Nano, cursor.SortValue)
		if err == nil {
			query += fmt.Sprintf(" AND (create_time, id) < ($%d, $%d)", argIdx, argIdx+1)
			args = append(args, cursorTime, cursor.ID)
			argIdx += 2
		}
	}

	query += fmt.Sprintf(" ORDER BY create_time DESC, id DESC LIMIT $%d", argIdx)
	args = append(args, pageSize+1)

	var list []*AgentRun
	err = s.db.SelectContext(ctx, &list, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list agent runs: %w", err)
	}

	return paging.NewPage(list, pageSize, func(item *AgentRun) paging.Cursor {
		return paging.Cursor{
			SortValue: item.CreateTime.Format(time.RFC3339Nano),
			ID:        item.ID,
		}
	}), nil
}
