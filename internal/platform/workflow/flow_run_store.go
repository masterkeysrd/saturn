package workflow

import (
	"context"
	"database/sql"
	"encoding/json/v2"
	"fmt"
	"strings"
	"time"

	"github.com/doug-martin/goqu/v9"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/sorting"
)

// PostgresFlowRunStore implements FlowRunStore against PostgreSQL `platform.flow_runs`.
type PostgresFlowRunStore struct {
	db       db.DB
	stepRuns StepRunStore
}

// NewFlowRunStore creates a new PostgresFlowRunStore.
func NewFlowRunStore(database db.DB, stepRuns StepRunStore) *PostgresFlowRunStore {
	return &PostgresFlowRunStore{
		db:       database,
		stepRuns: stepRuns,
	}
}

type flowRunRow struct {
	ID             string         `db:"id"`
	SpaceID        string         `db:"space_id"`
	FlowID         string         `db:"flow_id"`
	FlowVersion    int64          `db:"flow_version"`
	TriggerID      sql.NullString `db:"trigger_id"`
	IdempotencyKey sql.NullString `db:"idempotency_key"`
	Status         string         `db:"status"`
	Attempts       int            `db:"attempts"`
	TriggerData    []byte         `db:"trigger_data"`
	Input          []byte         `db:"input"`
	Output         []byte         `db:"output"`
	Error          []byte         `db:"error"`
	Metadata       []byte         `db:"metadata"`
	ResumeTime     sql.NullTime   `db:"resume_time"`
	StartTime      sql.NullTime   `db:"start_time"`
	EndTime        sql.NullTime   `db:"end_time"`
	CreateTime     time.Time      `db:"create_time"`
	UpdateTime     time.Time      `db:"update_time"`
}

func (r *flowRunRow) toDomain() (*FlowRun, error) {
	run := &FlowRun{
		ID:          r.ID,
		SpaceID:     r.SpaceID,
		FlowID:      r.FlowID,
		FlowVersion: r.FlowVersion,
		Status:      FlowRunStatus(r.Status),
		Attempts:    r.Attempts,
		CreateTime:  r.CreateTime,
		UpdateTime:  r.UpdateTime,
	}
	if r.TriggerID.Valid {
		run.TriggerID = new(r.TriggerID.String)
	}
	if r.IdempotencyKey.Valid {
		run.IdempotencyKey = new(r.IdempotencyKey.String)
	}
	if r.ResumeTime.Valid {
		run.ResumeTime = new(r.ResumeTime.Time)
	}
	if r.StartTime.Valid {
		run.StartTime = new(r.StartTime.Time)
	}
	if r.EndTime.Valid {
		run.EndTime = new(r.EndTime.Time)
	}
	if len(r.TriggerData) > 0 {
		if err := json.Unmarshal(r.TriggerData, &run.TriggerData); err != nil {
			return nil, fmt.Errorf("unmarshal flow_run trigger_data: %w", err)
		}
	}
	if len(r.Input) > 0 {
		if err := json.Unmarshal(r.Input, &run.Input); err != nil {
			return nil, fmt.Errorf("unmarshal flow_run input: %w", err)
		}
	}
	if len(r.Output) > 0 {
		if err := json.Unmarshal(r.Output, &run.Output); err != nil {
			return nil, fmt.Errorf("unmarshal flow_run output: %w", err)
		}
	}
	if len(r.Error) > 0 {
		var fe FlowError
		if err := json.Unmarshal(r.Error, &fe); err != nil {
			return nil, fmt.Errorf("unmarshal flow_run error: %w", err)
		}
		run.Error = &fe
	}
	if len(r.Metadata) > 0 {
		if err := json.Unmarshal(r.Metadata, &run.Metadata); err != nil {
			return nil, fmt.Errorf("unmarshal flow_run metadata: %w", err)
		}
	}
	return run, nil
}

// CreateOrResume inserts a FlowRun or resumes an existing run matching (space_id, flow_id, idempotency_key).
func (s *PostgresFlowRunStore) CreateOrResume(ctx context.Context, run *FlowRun) (*FlowRun, bool, error) {
	const op errors.Op = "platform/workflow.FlowRunStore.CreateOrResume"

	if run.ID == "" {
		idStr, err := GenerateFlowRunID()
		if err != nil {
			return nil, false, errors.E(op, err)
		}
		run.ID = idStr
	}
	if run.Status == "" {
		run.Status = RunPending
	}
	if run.Attempts <= 0 {
		run.Attempts = 1
	}

	trigBytes, err := json.Marshal(nonNilMap(run.TriggerData))
	if err != nil {
		return nil, false, errors.E(op, errors.Internal, err)
	}
	inBytes, metaBytes, outBytes, errBytes, err := marshalFlowRunMutableColumns(run)
	if err != nil {
		return nil, false, errors.E(op, errors.Internal, err)
	}

	if run.IdempotencyKey != nil && *run.IdempotencyKey != "" {
		const upsertQuery = `
			INSERT INTO platform.flow_runs (
				id, space_id, flow_id, flow_version, trigger_id, idempotency_key,
				status, attempts, trigger_data, input, output, error, metadata,
				resume_time, start_time, end_time, create_time, update_time
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
			ON CONFLICT (space_id, flow_id, idempotency_key) WHERE idempotency_key IS NOT NULL
			DO UPDATE SET
				attempts = platform.flow_runs.attempts + 1,
				update_time = NOW()
			RETURNING id, space_id, flow_id, flow_version, trigger_id, idempotency_key,
			          status, attempts, trigger_data, input, output, error, metadata,
			          resume_time, start_time, end_time, create_time, update_time
		`
		var row flowRunRow
		if err := s.db.Get(
			ctx,
			&row,
			upsertQuery,
			run.ID,
			run.SpaceID,
			run.FlowID,
			run.FlowVersion,
			strPtrToNullStr(run.TriggerID),
			*run.IdempotencyKey,
			string(run.Status),
			run.Attempts,
			trigBytes,
			inBytes,
			nullableBytes(outBytes),
			nullableBytes(errBytes),
			metaBytes,
			timePtrToNullTime(run.ResumeTime),
			timePtrToNullTime(run.StartTime),
			timePtrToNullTime(run.EndTime),
		); err != nil {
			return nil, false, errors.E(op, err)
		}
		saved, err := row.toDomain()
		if err != nil {
			return nil, false, errors.E(op, errors.Internal, err)
		}
		resumed := saved.ID != run.ID || saved.Attempts > 1
		if resumed && s.stepRuns != nil {
			steps, err := s.stepRuns.ListByFlowRun(ctx, saved.SpaceID, saved.ID)
			if err != nil {
				return nil, false, errors.E(op, err)
			}
			saved.StepRuns = steps
		}
		return saved, resumed, nil
	}

	const insertQuery = `
		INSERT INTO platform.flow_runs (
			id, space_id, flow_id, flow_version, trigger_id, idempotency_key,
			status, attempts, trigger_data, input, output, error, metadata,
			resume_time, start_time, end_time, create_time, update_time
		) VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
		RETURNING id, space_id, flow_id, flow_version, trigger_id, idempotency_key,
		          status, attempts, trigger_data, input, output, error, metadata,
		          resume_time, start_time, end_time, create_time, update_time
	`

	var row flowRunRow
	if err := s.db.Get(
		ctx,
		&row,
		insertQuery,
		run.ID,
		run.SpaceID,
		run.FlowID,
		run.FlowVersion,
		strPtrToNullStr(run.TriggerID),
		string(run.Status),
		run.Attempts,
		trigBytes,
		inBytes,
		nullableBytes(outBytes),
		nullableBytes(errBytes),
		metaBytes,
		timePtrToNullTime(run.ResumeTime),
		timePtrToNullTime(run.StartTime),
		timePtrToNullTime(run.EndTime),
	); err != nil {
		return nil, false, errors.E(op, err)
	}
	saved, err := row.toDomain()
	if err != nil {
		return nil, false, errors.E(op, errors.Internal, err)
	}
	return saved, false, nil
}

// Update updates mutable execution fields on a FlowRun.
func (s *PostgresFlowRunStore) Update(ctx context.Context, run *FlowRun) error {
	const op errors.Op = "platform/workflow.FlowRunStore.Update"

	inBytes, metaBytes, outBytes, errBytes, err := marshalFlowRunMutableColumns(run)
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}

	const query = `
		UPDATE platform.flow_runs
		SET status = $3,
		    attempts = $4,
		    input = $5,
		    output = $6,
		    error = $7,
		    metadata = $8,
		    resume_time = $9,
		    start_time = $10,
		    end_time = $11,
		    update_time = NOW()
		WHERE space_id = $1 AND id = $2
		RETURNING update_time
	`

	var updateTime time.Time
	if err := s.db.Get(
		ctx,
		&updateTime,
		query,
		run.SpaceID,
		run.ID,
		string(run.Status),
		run.Attempts,
		inBytes,
		nullableBytes(outBytes),
		nullableBytes(errBytes),
		metaBytes,
		timePtrToNullTime(run.ResumeTime),
		timePtrToNullTime(run.StartTime),
		timePtrToNullTime(run.EndTime),
	); err != nil {
		if errors.Is(err, errors.NotExist) {
			return ErrFlowRunNotFound
		}
		return errors.E(op, err)
	}
	run.UpdateTime = updateTime
	return nil
}

func marshalFlowRunMutableColumns(run *FlowRun) (inBytes, metaBytes, outBytes, errBytes []byte, err error) {
	inBytes, err = json.Marshal(nonNilMap(run.Input))
	if err != nil {
		return nil, nil, nil, nil, err
	}
	metaBytes, err = json.Marshal(nonNilMap(run.Metadata))
	if err != nil {
		return nil, nil, nil, nil, err
	}
	if run.Output != nil {
		outBytes, err = json.Marshal(run.Output)
		if err != nil {
			return nil, nil, nil, nil, err
		}
	}
	if run.Error != nil {
		errBytes, err = json.Marshal(run.Error)
		if err != nil {
			return nil, nil, nil, nil, err
		}
	}
	return inBytes, metaBytes, outBytes, errBytes, nil
}

// Get retrieves a single FlowRun hydrated with its StepRuns.
func (s *PostgresFlowRunStore) Get(ctx context.Context, spaceID string, id string) (*FlowRun, error) {
	const op errors.Op = "platform/workflow.FlowRunStore.Get"

	const query = `
		SELECT id, space_id, flow_id, flow_version, trigger_id, idempotency_key,
		       status, attempts, trigger_data, input, output, error, metadata,
		       resume_time, start_time, end_time, create_time, update_time
		FROM platform.flow_runs
		WHERE space_id = $1 AND id = $2
	`

	var row flowRunRow
	if err := s.db.Get(ctx, &row, query, spaceID, id); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, ErrFlowRunNotFound
		}
		return nil, errors.E(op, err)
	}

	run, err := row.toDomain()
	if err != nil {
		return nil, errors.E(op, errors.Internal, err)
	}

	if s.stepRuns != nil {
		steps, err := s.stepRuns.ListByFlowRun(ctx, spaceID, run.ID)
		if err != nil {
			return nil, errors.E(op, err)
		}
		run.StepRuns = steps
	}
	return run, nil
}

// List returns cursor-paginated FlowRuns filtered by space, flow_id, and status.
func (s *PostgresFlowRunStore) List(ctx context.Context, filter ListFlowRunsFilter) (*paging.Page[*FlowRun], error) {
	const op errors.Op = "platform/workflow.FlowRunStore.List"

	pageSize := filter.PageSize
	if pageSize <= 0 {
		pageSize = 25
	}
	if pageSize > 100 {
		pageSize = 100
	}

	ds := pgDialect.From(goqu.T("flow_runs").Schema("platform")).
		Select(
			"id", "space_id", "flow_id", "flow_version", "trigger_id", "idempotency_key",
			"status", "attempts", "trigger_data", "input", "output", "error", "metadata",
			"resume_time", "start_time", "end_time", "create_time", "update_time",
		).
		Where(goqu.C("space_id").Eq(filter.SpaceID))

	if filter.FlowID != nil && strings.TrimSpace(*filter.FlowID) != "" {
		ds = ds.Where(goqu.C("flow_id").Eq(*filter.FlowID))
	}
	if filter.Status != nil && *filter.Status != "" {
		ds = ds.Where(goqu.C("status").Eq(string(*filter.Status)))
	}

	cursor, _ := paging.Decode(filter.PageToken)
	ds = paging.ApplyPagination(ds, paging.Options{
		Sort: sorting.SortOrder{
			Field:     "create_time",
			Ascending: false,
		},
		Cursor:   cursor,
		PageSize: uint(pageSize),
	})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var rows []flowRunRow
	if err := s.db.Select(ctx, &rows, query, args...); err != nil {
		return nil, errors.E(op, err)
	}

	runs := make([]*FlowRun, 0, len(rows))
	for i := range rows {
		r, err := rows[i].toDomain()
		if err != nil {
			return nil, errors.E(op, errors.Internal, err)
		}
		runs = append(runs, r)
	}

	page := paging.NewPage(runs, pageSize, func(r *FlowRun) paging.Cursor {
		return paging.Cursor{
			SortValue: r.CreateTime.UTC().Format(time.RFC3339Nano),
			ID:        r.ID,
		}
	})
	return page, nil
}

// GetStats7d computes 7-day summary counts, latest run status, and daily counts per flow.
func (s *PostgresFlowRunStore) GetStats7d(ctx context.Context, spaceID string, flowIDs []string, now time.Time) (map[string]FlowStats, error) {
	const op errors.Op = "platform/workflow.FlowRunStore.GetStats7d"

	stats := make(map[string]FlowStats, len(flowIDs))
	if len(flowIDs) == 0 {
		return stats, nil
	}

	windowStart := now.UTC().Truncate(24*time.Hour).AddDate(0, 0, -6)

	ds := pgDialect.From(goqu.T("flow_runs").Schema("platform")).
		Select("flow_id", "status", "create_time").
		Where(
			goqu.C("space_id").Eq(spaceID),
			goqu.C("flow_id").In(flowIDs),
			goqu.C("create_time").Gte(windowStart),
		).
		Order(goqu.C("create_time").Desc(), goqu.C("id").Desc())

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var rows []struct {
		FlowID     string    `db:"flow_id"`
		Status     string    `db:"status"`
		CreateTime time.Time `db:"create_time"`
	}
	if err := s.db.Select(ctx, &rows, query, args...); err != nil {
		return nil, errors.E(op, err)
	}

	for _, idStr := range flowIDs {
		stats[idStr] = FlowStats{
			DailyCounts7d: make([]int32, 7),
		}
	}

	for _, row := range rows {
		st := stats[row.FlowID]
		st.TotalRuns7d++
		switch FlowRunStatus(row.Status) {
		case RunCompleted:
			st.CompletedRuns7d++
		case RunFailed:
			st.FailedRuns7d++
		case RunFiltered:
			st.FilteredRuns7d++
		}
		if st.LastRunAt == nil {
			st.LastRunAt = new(row.CreateTime)
			st.LastRunStatus = new(row.Status)
		}
		dayIdx := int(row.CreateTime.UTC().Truncate(24*time.Hour).Sub(windowStart) / (24 * time.Hour))
		if dayIdx >= 0 && dayIdx < 7 {
			st.DailyCounts7d[dayIdx]++
		}
		stats[row.FlowID] = st
	}

	return stats, nil
}
