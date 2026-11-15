package workflow

import (
	"context"
	"encoding/json/v2"
	"fmt"
	"time"

	"github.com/doug-martin/goqu/v9"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// PostgresTriggerStore implements TriggerStore against PostgreSQL `platform.flow_triggers`.
type PostgresTriggerStore struct {
	db db.DB
}

// NewTriggerStore creates a new PostgresTriggerStore.
func NewTriggerStore(database db.DB) *PostgresTriggerStore {
	return &PostgresTriggerStore{db: database}
}

type triggerRow struct {
	ID         string    `db:"id"`
	FlowID     string    `db:"flow_id"`
	SpaceID    string    `db:"space_id"`
	Name       string    `db:"name"`
	Type       string    `db:"type"`
	Config     []byte    `db:"config"`
	IsEnabled  bool      `db:"is_enabled"`
	CreateTime time.Time `db:"create_time"`
	UpdateTime time.Time `db:"update_time"`
}

func (r *triggerRow) toDomain() (Trigger, error) {
	t := Trigger{
		ID:         r.ID,
		FlowID:     r.FlowID,
		SpaceID:    r.SpaceID,
		Name:       r.Name,
		Type:       TriggerType(r.Type),
		IsEnabled:  r.IsEnabled,
		CreateTime: r.CreateTime,
		UpdateTime: r.UpdateTime,
	}
	if len(r.Config) > 0 {
		if err := json.Unmarshal(r.Config, &t.Config); err != nil {
			return Trigger{}, fmt.Errorf("unmarshal trigger config: %w", err)
		}
	}
	return t, nil
}

// ReplaceForFlow replaces trigger bindings for a flow while preserving existing IDs when provided.
func (s *PostgresTriggerStore) ReplaceForFlow(ctx context.Context, spaceID string, flowID string, triggers []Trigger) ([]Trigger, error) {
	const op errors.Op = "platform/workflow.TriggerStore.ReplaceForFlow"

	keepIDs := make([]string, 0, len(triggers))
	for i := range triggers {
		if triggers[i].ID != "" {
			keepIDs = append(keepIDs, triggers[i].ID)
		}
	}

	if len(keepIDs) == 0 {
		const delAll = `DELETE FROM platform.flow_triggers WHERE space_id = $1 AND flow_id = $2`
		if _, err := s.db.Exec(ctx, delAll, spaceID, flowID); err != nil {
			return nil, errors.E(op, err)
		}
	} else {
		delDS := pgDialect.Delete(goqu.T("flow_triggers").Schema("platform")).
			Where(
				goqu.C("space_id").Eq(spaceID),
				goqu.C("flow_id").Eq(flowID),
				goqu.C("id").NotIn(keepIDs),
			)
		delQuery, delArgs, err := delDS.Prepared(true).ToSQL()
		if err != nil {
			return nil, errors.E(op, err)
		}
		if _, err := s.db.Exec(ctx, delQuery, delArgs...); err != nil {
			return nil, errors.E(op, err)
		}
	}

	const upsertQuery = `
		INSERT INTO platform.flow_triggers (
			id, flow_id, space_id, name, type, config, is_enabled, create_time, update_time
		) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			type = EXCLUDED.type,
			config = EXCLUDED.config,
			is_enabled = EXCLUDED.is_enabled,
			update_time = NOW()
		WHERE platform.flow_triggers.space_id = $3 AND platform.flow_triggers.flow_id = $2
		RETURNING id, flow_id, space_id, name, type, config, is_enabled, create_time, update_time
	`

	out := make([]Trigger, 0, len(triggers))
	for i := range triggers {
		t := triggers[i]
		if t.ID == "" {
			idStr, err := GenerateTriggerID()
			if err != nil {
				return nil, errors.E(op, err)
			}
			t.ID = idStr
		}
		cfgBytes, err := json.Marshal(t.Config)
		if err != nil {
			return nil, errors.E(op, errors.Internal, err)
		}

		var row triggerRow
		if err := s.db.Get(
			ctx,
			&row,
			upsertQuery,
			t.ID,
			flowID,
			spaceID,
			t.Name,
			string(t.Type),
			cfgBytes,
			t.IsEnabled,
		); err != nil {
			return nil, errors.E(op, err)
		}
		saved, err := row.toDomain()
		if err != nil {
			return nil, errors.E(op, errors.Internal, err)
		}
		out = append(out, saved)
	}

	return out, nil
}

// ListByFlow lists all triggers for a single flow.
func (s *PostgresTriggerStore) ListByFlow(ctx context.Context, spaceID string, flowID string) ([]Trigger, error) {
	const op errors.Op = "platform/workflow.TriggerStore.ListByFlow"

	const query = `
		SELECT id, flow_id, space_id, name, type, config, is_enabled, create_time, update_time
		FROM platform.flow_triggers
		WHERE space_id = $1 AND flow_id = $2
		ORDER BY create_time ASC, id ASC
	`

	var rows []triggerRow
	if err := s.db.Select(ctx, &rows, query, spaceID, flowID); err != nil {
		return nil, errors.E(op, err)
	}

	triggers := make([]Trigger, 0, len(rows))
	for i := range rows {
		t, err := rows[i].toDomain()
		if err != nil {
			return nil, errors.E(op, errors.Internal, err)
		}
		triggers = append(triggers, t)
	}
	return triggers, nil
}

// ListByFlowIDs batch-loads triggers for a set of flow IDs.
func (s *PostgresTriggerStore) ListByFlowIDs(ctx context.Context, spaceID string, flowIDs []string) (map[string][]Trigger, error) {
	const op errors.Op = "platform/workflow.TriggerStore.ListByFlowIDs"

	result := make(map[string][]Trigger, len(flowIDs))
	if len(flowIDs) == 0 {
		return result, nil
	}

	ds := pgDialect.From(goqu.T("flow_triggers").Schema("platform")).
		Select("id", "flow_id", "space_id", "name", "type", "config", "is_enabled", "create_time", "update_time").
		Where(
			goqu.C("space_id").Eq(spaceID),
			goqu.C("flow_id").In(flowIDs),
		).
		Order(goqu.C("create_time").Asc(), goqu.C("id").Asc())

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var rows []triggerRow
	if err := s.db.Select(ctx, &rows, query, args...); err != nil {
		return nil, errors.E(op, err)
	}

	for i := range rows {
		t, err := rows[i].toDomain()
		if err != nil {
			return nil, errors.E(op, errors.Internal, err)
		}
		result[t.FlowID] = append(result[t.FlowID], t)
	}
	return result, nil
}

// Get retrieves a trigger by ID scoped to spaceID.
func (s *PostgresTriggerStore) Get(ctx context.Context, spaceID string, triggerID string) (*Trigger, error) {
	const op errors.Op = "platform/workflow.TriggerStore.Get"

	const query = `
		SELECT id, flow_id, space_id, name, type, config, is_enabled, create_time, update_time
		FROM platform.flow_triggers
		WHERE space_id = $1 AND id = $2
	`

	var row triggerRow
	if err := s.db.Get(ctx, &row, query, spaceID, triggerID); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, ErrTriggerNotFound
		}
		return nil, errors.E(op, err)
	}
	t, err := row.toDomain()
	if err != nil {
		return nil, errors.E(op, errors.Internal, err)
	}
	return &t, nil
}

// GetByID retrieves a trigger by ID across spaces.
func (s *PostgresTriggerStore) GetByID(ctx context.Context, triggerID string) (*Trigger, error) {
	const op errors.Op = "platform/workflow.TriggerStore.GetByID"

	const query = `
		SELECT id, flow_id, space_id, name, type, config, is_enabled, create_time, update_time
		FROM platform.flow_triggers
		WHERE id = $1
	`

	var row triggerRow
	if err := s.db.Get(ctx, &row, query, triggerID); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, ErrTriggerNotFound
		}
		return nil, errors.E(op, err)
	}
	t, err := row.toDomain()
	if err != nil {
		return nil, errors.E(op, errors.Internal, err)
	}
	return &t, nil
}

// FindEnabledEventTriggers returns enabled event triggers matching spaceID and topic whose parent flow is enabled.
func (s *PostgresTriggerStore) FindEnabledEventTriggers(ctx context.Context, spaceID string, topic string) ([]Trigger, error) {
	const op errors.Op = "platform/workflow.TriggerStore.FindEnabledEventTriggers"

	const query = `
		SELECT t.id, t.flow_id, t.space_id, t.name, t.type, t.config, t.is_enabled, t.create_time, t.update_time
		FROM platform.flow_triggers t
		INNER JOIN platform.flows f ON f.id = t.flow_id
		WHERE t.space_id = $1
		  AND t.is_enabled = TRUE
		  AND t.type = 'event'
		  AND t.config->>'topic' = $2
		  AND f.is_enabled = TRUE
		ORDER BY t.create_time ASC, t.id ASC
	`

	var rows []triggerRow
	if err := s.db.Select(ctx, &rows, query, spaceID, topic); err != nil {
		return nil, errors.E(op, err)
	}

	triggers := make([]Trigger, 0, len(rows))
	for i := range rows {
		t, err := rows[i].toDomain()
		if err != nil {
			return nil, errors.E(op, errors.Internal, err)
		}
		triggers = append(triggers, t)
	}
	return triggers, nil
}

// ListEnabledScheduleTriggers lists all enabled schedule triggers belonging to enabled flows.
func (s *PostgresTriggerStore) ListEnabledScheduleTriggers(ctx context.Context) ([]Trigger, error) {
	const op errors.Op = "platform/workflow.TriggerStore.ListEnabledScheduleTriggers"

	const query = `
		SELECT t.id, t.flow_id, t.space_id, t.name, t.type, t.config, t.is_enabled, t.create_time, t.update_time
		FROM platform.flow_triggers t
		INNER JOIN platform.flows f ON f.id = t.flow_id
		WHERE t.is_enabled = TRUE
		  AND t.type = 'schedule'
		  AND f.is_enabled = TRUE
		ORDER BY t.create_time ASC, t.id ASC
	`

	var rows []triggerRow
	if err := s.db.Select(ctx, &rows, query); err != nil {
		return nil, errors.E(op, err)
	}

	triggers := make([]Trigger, 0, len(rows))
	for i := range rows {
		t, err := rows[i].toDomain()
		if err != nil {
			return nil, errors.E(op, errors.Internal, err)
		}
		triggers = append(triggers, t)
	}
	return triggers, nil
}
