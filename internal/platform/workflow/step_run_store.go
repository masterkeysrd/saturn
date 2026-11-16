package workflow

import (
	"context"
	"database/sql"
	"encoding/json/v2"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// PostgresStepRunStore implements StepRunStore against PostgreSQL `platform.step_runs`.
type PostgresStepRunStore struct {
	db db.DB
}

// NewStepRunStore creates a new PostgresStepRunStore.
func NewStepRunStore(database db.DB) *PostgresStepRunStore {
	return &PostgresStepRunStore{db: database}
}

type stepRunRow struct {
	ID           string         `db:"id"`
	FlowRunID    string         `db:"flow_run_id"`
	SpaceID      string         `db:"space_id"`
	StepID       string         `db:"step_id"`
	StepType     string         `db:"step_type"`
	ExecutionKey string         `db:"execution_key"`
	Status       string         `db:"status"`
	Output       []byte         `db:"output"`
	Error        []byte         `db:"error"`
	Metadata     []byte         `db:"metadata"`
	AIRunID      sql.NullString `db:"ai_run_id"`
	StartTime    time.Time      `db:"start_time"`
	EndTime      sql.NullTime   `db:"end_time"`
	CreateTime   time.Time      `db:"create_time"`
	UpdateTime   time.Time      `db:"update_time"`
}

func (r *stepRunRow) toDomain() (StepRun, error) {
	sr := StepRun{
		ID:           r.ID,
		FlowRunID:    r.FlowRunID,
		SpaceID:      r.SpaceID,
		StepID:       r.StepID,
		StepType:     r.StepType,
		ExecutionKey: r.ExecutionKey,
		Status:       StepRunStatus(r.Status),
		StartTime:    r.StartTime,
		CreateTime:   r.CreateTime,
		UpdateTime:   r.UpdateTime,
	}
	if r.AIRunID.Valid {
		sr.AIRunID = new(r.AIRunID.String)
	}
	if r.EndTime.Valid {
		sr.EndTime = new(r.EndTime.Time)
	}
	if len(r.Output) > 0 {
		if err := json.Unmarshal(r.Output, &sr.Output); err != nil {
			return StepRun{}, fmt.Errorf("unmarshal step_run output: %w", err)
		}
	}
	if len(r.Error) > 0 {
		var fe FlowError
		if err := json.Unmarshal(r.Error, &fe); err != nil {
			return StepRun{}, fmt.Errorf("unmarshal step_run error: %w", err)
		}
		sr.Error = &fe
	}
	if len(r.Metadata) > 0 {
		if err := json.Unmarshal(r.Metadata, &sr.Metadata); err != nil {
			return StepRun{}, fmt.Errorf("unmarshal step_run metadata: %w", err)
		}
	}
	return sr, nil
}

// Upsert persists or updates a StepRun checkpoint keyed by (flow_run_id, execution_key).
func (s *PostgresStepRunStore) Upsert(ctx context.Context, sr *StepRun) error {
	const op errors.Op = "platform/workflow.StepRunStore.Upsert"

	if sr.ID == "" {
		idStr, err := GenerateStepRunID()
		if err != nil {
			return errors.E(op, err)
		}
		sr.ID = idStr
	}

	metaBytes, err := json.Marshal(nonNilMap(sr.Metadata))
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}
	var outBytes []byte
	if sr.Output != nil {
		outBytes, err = json.Marshal(sr.Output)
		if err != nil {
			return errors.E(op, errors.Internal, err)
		}
	}
	var errBytes []byte
	if sr.Error != nil {
		errBytes, err = json.Marshal(sr.Error)
		if err != nil {
			return errors.E(op, errors.Internal, err)
		}
	}

	const query = `
		INSERT INTO platform.step_runs (
			id, flow_run_id, space_id, step_id, step_type, execution_key,
			status, output, error, metadata, ai_run_id, start_time, end_time,
			create_time, update_time
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
		ON CONFLICT (flow_run_id, execution_key) DO UPDATE SET
			status = EXCLUDED.status,
			output = EXCLUDED.output,
			error = EXCLUDED.error,
			metadata = EXCLUDED.metadata,
			ai_run_id = EXCLUDED.ai_run_id,
			end_time = EXCLUDED.end_time,
			update_time = NOW()
		RETURNING id, create_time, update_time
	`

	var res struct {
		ID         string    `db:"id"`
		CreateTime time.Time `db:"create_time"`
		UpdateTime time.Time `db:"update_time"`
	}
	if err := s.db.Get(
		ctx,
		&res,
		query,
		sr.ID,
		sr.FlowRunID,
		sr.SpaceID,
		sr.StepID,
		sr.StepType,
		sr.ExecutionKey,
		string(sr.Status),
		nullableBytes(outBytes),
		nullableBytes(errBytes),
		metaBytes,
		strPtrToNullStr(sr.AIRunID),
		sr.StartTime,
		timePtrToNullTime(sr.EndTime),
	); err != nil {
		return errors.E(op, err)
	}

	sr.ID = res.ID
	sr.CreateTime = res.CreateTime
	sr.UpdateTime = res.UpdateTime
	return nil
}

// ListByFlowRun returns step execution records for a FlowRun in chronological order.
func (s *PostgresStepRunStore) ListByFlowRun(ctx context.Context, spaceID string, flowRunID string) ([]StepRun, error) {
	const op errors.Op = "platform/workflow.StepRunStore.ListByFlowRun"

	const query = `
		SELECT id, flow_run_id, space_id, step_id, step_type, execution_key,
		       status, output, error, metadata, ai_run_id, start_time, end_time,
		       create_time, update_time
		FROM platform.step_runs
		WHERE space_id = $1 AND flow_run_id = $2
		ORDER BY create_time ASC, id ASC
	`

	var rows []stepRunRow
	if err := s.db.Select(ctx, &rows, query, spaceID, flowRunID); err != nil {
		return nil, errors.E(op, err)
	}

	out := make([]StepRun, 0, len(rows))
	for i := range rows {
		sr, err := rows[i].toDomain()
		if err != nil {
			return nil, errors.E(op, errors.Internal, err)
		}
		out = append(out, sr)
	}
	return out, nil
}
