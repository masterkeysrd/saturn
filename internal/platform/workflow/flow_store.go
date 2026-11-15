package workflow

import (
	"context"
	"database/sql"
	"encoding/json/v2"
	"fmt"
	"time"

	"github.com/doug-martin/goqu/v9"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// PostgresFlowStore implements FlowStore against PostgreSQL `platform.flows`.
type PostgresFlowStore struct {
	db       db.DB
	triggers TriggerStore
}

// NewFlowStore creates a new PostgresFlowStore.
func NewFlowStore(database db.DB, triggers TriggerStore) *PostgresFlowStore {
	return &PostgresFlowStore{
		db:       database,
		triggers: triggers,
	}
}

type flowRow struct {
	ID          string         `db:"id"`
	SpaceID     string         `db:"space_id"`
	SystemKey   sql.NullString `db:"system_key"`
	IsSystem    bool           `db:"is_system"`
	IsEnabled   bool           `db:"is_enabled"`
	Name        string         `db:"name"`
	Description string         `db:"description"`
	Config      []byte         `db:"config"`
	InputSchema []byte         `db:"input_schema"`
	Steps       []byte         `db:"steps"`
	Version     int64          `db:"version"`
	CreateTime  time.Time      `db:"create_time"`
	UpdateTime  time.Time      `db:"update_time"`
}

func (r *flowRow) toDomain() (*Flow, error) {
	f := &Flow{
		ID:          r.ID,
		SpaceID:     r.SpaceID,
		IsSystem:    r.IsSystem,
		IsEnabled:   r.IsEnabled,
		Name:        r.Name,
		Description: r.Description,
		Version:     r.Version,
		CreateTime:  r.CreateTime,
		UpdateTime:  r.UpdateTime,
	}
	if r.SystemKey.Valid {
		f.SystemKey = new(r.SystemKey.String)
	}
	if len(r.Config) > 0 {
		if err := json.Unmarshal(r.Config, &f.Config); err != nil {
			return nil, fmt.Errorf("unmarshal flow config: %w", err)
		}
	}
	if len(r.InputSchema) > 0 {
		if err := json.Unmarshal(r.InputSchema, &f.InputSchema); err != nil {
			return nil, fmt.Errorf("unmarshal flow input_schema: %w", err)
		}
	}
	if len(r.Steps) > 0 {
		if err := json.Unmarshal(r.Steps, &f.Steps); err != nil {
			return nil, fmt.Errorf("unmarshal flow steps: %w", err)
		}
	}
	if f.Steps == nil {
		f.Steps = []StepNode{}
	}
	return f, nil
}

// Create inserts a new flow and its triggers.
func (s *PostgresFlowStore) Create(ctx context.Context, flow *Flow) error {
	const op errors.Op = "platform/workflow.FlowStore.Create"

	if flow.ID == "" {
		idStr, err := GenerateFlowID()
		if err != nil {
			return errors.E(op, err)
		}
		flow.ID = idStr
	}
	if flow.Version <= 0 {
		flow.Version = 1
	}

	configBytes, inputSchemaBytes, stepsBytes, err := marshalFlowColumns(flow)
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}

	const query = `
		INSERT INTO platform.flows (
			id, space_id, system_key, is_system, is_enabled, name, description,
			config, input_schema, steps, version, create_time, update_time
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
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
		flow.ID,
		flow.SpaceID,
		strPtrToNullStr(flow.SystemKey),
		flow.IsSystem,
		flow.IsEnabled,
		flow.Name,
		flow.Description,
		configBytes,
		nullableBytes(inputSchemaBytes),
		stepsBytes,
		flow.Version,
	); err != nil {
		return errors.E(op, err)
	}
	flow.CreateTime = times.CreateTime
	flow.UpdateTime = times.UpdateTime

	if len(flow.Triggers) > 0 && s.triggers != nil {
		triggers, err := s.triggers.ReplaceForFlow(ctx, flow.SpaceID, flow.ID, flow.Triggers)
		if err != nil {
			return errors.E(op, err)
		}
		flow.Triggers = triggers
	}
	return nil
}

// Get retrieves a flow by flw_... ID or system_key within a space.
func (s *PostgresFlowStore) Get(ctx context.Context, spaceID string, idOrSystemKey string) (*Flow, error) {
	const op errors.Op = "platform/workflow.FlowStore.Get"

	const query = `
		SELECT id, space_id, system_key, is_system, is_enabled, name, description,
		       config, input_schema, steps, version, create_time, update_time
		FROM platform.flows
		WHERE space_id = $1 AND (id = $2 OR system_key = $2)
	`

	var row flowRow
	if err := s.db.Get(ctx, &row, query, spaceID, idOrSystemKey); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, ErrFlowNotFound
		}
		return nil, errors.E(op, err)
	}

	flow, err := row.toDomain()
	if err != nil {
		return nil, errors.E(op, errors.Internal, err)
	}

	if s.triggers != nil {
		triggers, err := s.triggers.ListByFlow(ctx, spaceID, flow.ID)
		if err != nil {
			return nil, errors.E(op, err)
		}
		flow.Triggers = triggers
	}
	return flow, nil
}

// List returns flows matching the filter, ordered newest first.
func (s *PostgresFlowStore) List(ctx context.Context, filter ListFlowsFilter) ([]*Flow, error) {
	const op errors.Op = "platform/workflow.FlowStore.List"

	ds := pgDialect.From(goqu.T("flows").Schema("platform")).
		Select(
			"id", "space_id", "system_key", "is_system", "is_enabled", "name",
			"description", "config", "input_schema", "steps", "version", "create_time", "update_time",
		).
		Where(goqu.C("space_id").Eq(filter.SpaceID))

	if filter.IsSystem != nil {
		ds = ds.Where(goqu.C("is_system").Eq(*filter.IsSystem))
	}
	if filter.IsEnabled != nil {
		ds = ds.Where(goqu.C("is_enabled").Eq(*filter.IsEnabled))
	}

	ds = ds.Order(goqu.C("create_time").Desc(), goqu.C("id").Desc())

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var rows []flowRow
	if err := s.db.Select(ctx, &rows, query, args...); err != nil {
		return nil, errors.E(op, err)
	}

	flows := make([]*Flow, 0, len(rows))
	for i := range rows {
		f, err := rows[i].toDomain()
		if err != nil {
			return nil, errors.E(op, errors.Internal, err)
		}
		flows = append(flows, f)
	}
	return flows, nil
}

// Update updates flow metadata, config, input_schema, steps, enabled flag, and increments version.
func (s *PostgresFlowStore) Update(ctx context.Context, flow *Flow) error {
	const op errors.Op = "platform/workflow.FlowStore.Update"

	configBytes, inputSchemaBytes, stepsBytes, err := marshalFlowColumns(flow)
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}

	const query = `
		UPDATE platform.flows
		SET is_enabled = $3,
		    name = $4,
		    description = $5,
		    config = $6,
		    input_schema = $7,
		    steps = $8,
		    version = version + 1,
		    update_time = NOW()
		WHERE space_id = $1 AND id = $2
		RETURNING version, update_time
	`

	var updated struct {
		Version    int64     `db:"version"`
		UpdateTime time.Time `db:"update_time"`
	}
	if err := s.db.Get(
		ctx,
		&updated,
		query,
		flow.SpaceID,
		flow.ID,
		flow.IsEnabled,
		flow.Name,
		flow.Description,
		configBytes,
		nullableBytes(inputSchemaBytes),
		stepsBytes,
	); err != nil {
		if errors.Is(err, errors.NotExist) {
			return ErrFlowNotFound
		}
		return errors.E(op, err)
	}

	flow.Version = updated.Version
	flow.UpdateTime = updated.UpdateTime
	return nil
}

// Delete deletes a flow by ID within a space.
func (s *PostgresFlowStore) Delete(ctx context.Context, spaceID string, id string) error {
	const op errors.Op = "platform/workflow.FlowStore.Delete"

	const query = `DELETE FROM platform.flows WHERE space_id = $1 AND id = $2`
	if err := s.db.ExecOne(ctx, query, spaceID, id); err != nil {
		if errors.Is(err, errors.NotExist) {
			return ErrFlowNotFound
		}
		return errors.E(op, err)
	}
	return nil
}

// EnsureSystemFlow lazily materializes a registered system flow and its default triggers idempotently.
func (s *PostgresFlowStore) EnsureSystemFlow(ctx context.Context, flow *Flow, triggers []Trigger, triggerStore TriggerStore) (*Flow, error) {
	const op errors.Op = "platform/workflow.FlowStore.EnsureSystemFlow"

	if flow.SystemKey == nil || *flow.SystemKey == "" {
		return nil, errors.E(op, errors.Invalid, "system_key is required")
	}

	if flow.ID == "" {
		idStr, err := GenerateFlowID()
		if err != nil {
			return nil, errors.E(op, err)
		}
		flow.ID = idStr
	}

	configBytes, inputSchemaBytes, stepsBytes, err := marshalFlowColumns(flow)
	if err != nil {
		return nil, errors.E(op, errors.Internal, err)
	}

	const insertQuery = `
		INSERT INTO platform.flows (
			id, space_id, system_key, is_system, is_enabled, name, description,
			config, input_schema, steps, version, create_time, update_time
		) VALUES ($1, $2, $3, TRUE, $4, $5, $6, $7, $8, $9, 1, NOW(), NOW())
		ON CONFLICT (space_id, system_key) DO NOTHING
		RETURNING id
	`

	ts := triggerStore
	if ts == nil {
		ts = s.triggers
	}

	var insertedID string
	insertErr := s.db.Get(
		ctx,
		&insertedID,
		insertQuery,
		flow.ID,
		flow.SpaceID,
		*flow.SystemKey,
		flow.IsEnabled,
		flow.Name,
		flow.Description,
		configBytes,
		nullableBytes(inputSchemaBytes),
		stepsBytes,
	)
	if insertErr == nil && insertedID != "" && len(triggers) > 0 && ts != nil {
		if _, err := ts.ReplaceForFlow(ctx, flow.SpaceID, insertedID, triggers); err != nil {
			return nil, errors.E(op, err)
		}
	} else if insertErr != nil && !errors.Is(insertErr, errors.NotExist) {
		return nil, errors.E(op, insertErr)
	}

	return s.Get(ctx, flow.SpaceID, *flow.SystemKey)
}

func marshalFlowColumns(flow *Flow) (configBytes, inputSchemaBytes, stepsBytes []byte, err error) {
	configBytes, err = json.Marshal(flow.Config)
	if err != nil {
		return nil, nil, nil, err
	}
	if flow.InputSchema != nil {
		inputSchemaBytes, err = json.Marshal(flow.InputSchema)
		if err != nil {
			return nil, nil, nil, err
		}
	}
	stepsVal := flow.Steps
	if stepsVal == nil {
		stepsVal = []StepNode{}
	}
	stepsBytes, err = json.Marshal(stepsVal)
	if err != nil {
		return nil, nil, nil, err
	}
	return configBytes, inputSchemaBytes, stepsBytes, nil
}
