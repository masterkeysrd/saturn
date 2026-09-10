package agent

import (
	"context"
	"fmt"
	"time"

	"github.com/lib/pq"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// Store handles SQL operations for the agents and LLM providers tables using db.DB.
type Store struct {
	db db.DB
}

// NewStore initializes a new Store instance backed by db.DB.
func NewStore(db db.DB) *Store {
	return &Store{db: db}
}

// ============================================================================
// LLM Provider Storage Operations
// ============================================================================

// CreateProvider inserts a new LLM provider config.
func (s *Store) CreateProvider(ctx context.Context, spaceID string, name string, mode CompatibilityMode, url *string, key *string) (*LLMProvider, error) {
	const op errors.Op = "platform/agent/storage.CreateProvider"

	providerID, err := id.Generate("prv_")
	if err != nil {
		return nil, errors.E(op, err)
	}

	query := `INSERT INTO platform.llm_providers (id, space_id, name, compatibility_mode, api_url, api_key, create_time, update_time)
	          VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
	          RETURNING id, space_id, name, compatibility_mode, api_url, api_key, create_time, update_time`

	var p LLMProvider
	if err := s.db.Get(ctx, &p, query, providerID, spaceID, name, mode, url, key); err != nil {
		return nil, errors.E(op, err)
	}
	return &p, nil
}

// GetProvider retrieves a single LLM provider record.
func (s *Store) GetProvider(ctx context.Context, q GetLLMProvider) (*LLMProvider, error) {
	const op errors.Op = "platform/agent/storage.GetProvider"

	query := `SELECT id, space_id, name, compatibility_mode, api_url, api_key, create_time, update_time
	          FROM platform.llm_providers WHERE space_id = $1 AND id = $2`

	var p LLMProvider
	if err := s.db.Get(ctx, &p, query, q.SpaceID, q.ID); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}
	return &p, nil
}

// ListProviders lists all LLM providers in a space.
func (s *Store) ListProviders(ctx context.Context, spaceID string) ([]*LLMProvider, error) {
	const op errors.Op = "platform/agent/storage.ListProviders"

	query := `SELECT id, space_id, name, compatibility_mode, api_url, api_key, create_time, update_time
	          FROM platform.llm_providers WHERE space_id = $1 ORDER BY create_time DESC`

	var list []*LLMProvider
	if err := s.db.Select(ctx, &list, query, spaceID); err != nil {
		return nil, errors.E(op, err)
	}
	return list, nil
}

// UpdateProvider updates LLM provider details.
func (s *Store) UpdateProvider(ctx context.Context, spaceID string, id string, name string, url *string, key *string) (*LLMProvider, error) {
	const op errors.Op = "platform/agent/storage.UpdateProvider"

	query := `UPDATE platform.llm_providers
	          SET name = $3, api_url = $4, api_key = COALESCE($5, api_key), update_time = NOW()
	          WHERE space_id = $1 AND id = $2
	          RETURNING id, space_id, name, compatibility_mode, api_url, api_key, create_time, update_time`

	var p LLMProvider
	if err := s.db.Get(ctx, &p, query, spaceID, id, name, url, key); err != nil {
		return nil, errors.E(op, err)
	}
	return &p, nil
}

// DeleteProvider deletes an LLM provider record.
func (s *Store) DeleteProvider(ctx context.Context, spaceID string, id string) error {
	const op errors.Op = "platform/agent/storage.DeleteProvider"

	query := `DELETE FROM platform.llm_providers WHERE space_id = $1 AND id = $2`
	if err := s.db.ExecOne(ctx, query, spaceID, id); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// ============================================================================
// Agent Storage Operations
// ============================================================================

// CreateAgent registers a new agent instance.
func (s *Store) CreateAgent(ctx context.Context, spaceID string, providerID *string, name string, desc *string, purpose string, tags []string, model string, prompt *string, temp float64) (*Agent, error) {
	const op errors.Op = "platform/agent/storage.CreateAgent"

	if tags == nil {
		tags = []string{}
	}

	agentID, err := id.Generate("agt_")
	if err != nil {
		return nil, errors.E(op, err)
	}

	query := `INSERT INTO platform.agents (id, space_id, llm_provider_id, name, description, purpose, tags, model_name, system_instruction, temperature, is_enabled, create_time, update_time)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, NOW(), NOW())
	          RETURNING id, space_id, llm_provider_id, name, description, purpose, tags, model_name, system_instruction, temperature, is_enabled, create_time, update_time`

	var a Agent
	if err := s.db.Get(ctx, &a, query, agentID, spaceID, providerID, name, desc, purpose, pq.Array(tags), model, prompt, temp); err != nil {
		return nil, errors.E(op, err)
	}
	return &a, nil
}

// GetAgent retrieves a single Agent by purpose or ID.
func (s *Store) GetAgent(ctx context.Context, q GetAgent) (*Agent, error) {
	const op errors.Op = "platform/agent/storage.GetAgent"

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
	if err := s.db.Get(ctx, &a, query, args...); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, nil
		}
		return nil, errors.E(op, err)
	}
	return &a, nil
}

// ListAgents lists all agents configured in a workspace.
func (s *Store) ListAgents(ctx context.Context, spaceID string) ([]*Agent, error) {
	const op errors.Op = "platform/agent/storage.ListAgents"

	query := `SELECT id, space_id, llm_provider_id, name, description, purpose, tags, model_name, system_instruction, temperature, is_enabled, create_time, update_time
	          FROM platform.agents WHERE space_id = $1 ORDER BY create_time DESC`

	var list []*Agent
	if err := s.db.Select(ctx, &list, query, spaceID); err != nil {
		return nil, errors.E(op, err)
	}
	return list, nil
}

// UpdateAgent modifies agent configuration.
func (s *Store) UpdateAgent(ctx context.Context, spaceID string, id string, providerID *string, name string, desc *string, tags []string, model string, prompt *string, temp float64, isEnabled bool) (*Agent, error) {
	const op errors.Op = "platform/agent/storage.UpdateAgent"

	if tags == nil {
		tags = []string{}
	}

	query := `UPDATE platform.agents
	          SET llm_provider_id = $3, name = $4, description = $5, tags = $6, model_name = $7, system_instruction = $8, temperature = $9, is_enabled = $10, update_time = NOW()
	          WHERE space_id = $1 AND id = $2
	          RETURNING id, space_id, llm_provider_id, name, description, purpose, tags, model_name, system_instruction, temperature, is_enabled, create_time, update_time`

	var a Agent
	if err := s.db.Get(ctx, &a, query, spaceID, id, providerID, name, desc, pq.Array(tags), model, prompt, temp, isEnabled); err != nil {
		return nil, errors.E(op, err)
	}
	return &a, nil
}

// DeleteAgent deletes an Agent record.
func (s *Store) DeleteAgent(ctx context.Context, spaceID string, id string) error {
	const op errors.Op = "platform/agent/storage.DeleteAgent"

	query := `DELETE FROM platform.agents WHERE space_id = $1 AND id = $2`
	if err := s.db.ExecOne(ctx, query, spaceID, id); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// ============================================================================
// Agent Runs Logging Operations
// ============================================================================

// LogRun inserts a record of an agent execution attempt.
func (s *Store) LogRun(ctx context.Context, agentID string, spaceID string, status AgentRunStatus, input string, output *string, errMsg *string, tokens int) (*AgentRun, error) {
	const op errors.Op = "platform/agent/storage.LogRun"

	runID, err := id.Generate("run_")
	if err != nil {
		return nil, errors.E(op, err)
	}

	query := `INSERT INTO platform.agent_runs (id, agent_id, space_id, status, input_raw, output_raw, error_message, tokens_used, create_time)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
	          RETURNING id, agent_id, space_id, status, input_raw, output_raw, error_message, tokens_used, create_time`

	var r AgentRun
	if err := s.db.Get(ctx, &r, query, runID, agentID, spaceID, status, input, output, errMsg, tokens); err != nil {
		return nil, errors.E(op, err)
	}
	return &r, nil
}

// ListRuns lists execution logs for an agent with cursor-based pagination.
func (s *Store) ListRuns(ctx context.Context, q ListAgentRuns) (*paging.Page[*AgentRun], error) {
	const op errors.Op = "platform/agent/storage.ListRuns"

	pageSize := int(q.PageSize)
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	cursor, err := paging.Decode(q.PageToken)
	if err != nil {
		return nil, errors.E(op, errors.Invalid, fmt.Errorf("invalid page token: %w", err))
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
	if err := s.db.Select(ctx, &list, query, args...); err != nil {
		return nil, errors.E(op, err)
	}

	return paging.NewPage(list, pageSize, func(item *AgentRun) paging.Cursor {
		return paging.Cursor{
			SortValue: item.CreateTime.Format(time.RFC3339Nano),
			ID:        item.ID,
		}
	}), nil
}
