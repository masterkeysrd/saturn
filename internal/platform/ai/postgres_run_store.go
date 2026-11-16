package ai

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/doug-martin/goqu/v9"
	"github.com/lib/pq"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// PostgresRunStore implements RunStore against `platform.ai_runs` and `platform.ai_run_steps`.
type PostgresRunStore struct {
	db db.DB
}

// NewRunStore constructs a PostgresRunStore.
func NewRunStore(database db.DB) *PostgresRunStore {
	return &PostgresRunStore{db: database}
}

type runRow struct {
	ID         string         `db:"id"`
	SpaceID    string         `db:"space_id"`
	Kind       string         `db:"kind"`
	Source     string         `db:"source"`
	ThreadID   sql.NullString `db:"thread_id"`
	AgentID    sql.NullString `db:"agent_id"`
	ProviderID sql.NullString `db:"provider_id"`
	ModelID    sql.NullString `db:"model_id"`
	FlowRunID  sql.NullString `db:"flow_run_id"`
	Status     string         `db:"status"`
	Input      []byte         `db:"input"`
	Output     []byte         `db:"output"`
	Error      []byte         `db:"error"`
	Metrics    []byte         `db:"metrics"`
	StartTime  time.Time      `db:"start_time"`
	EndTime    sql.NullTime   `db:"end_time"`
	CreateTime time.Time      `db:"create_time"`
}

func (r *runRow) toDomain() (*Run, error) {
	run := &Run{
		ID:         r.ID,
		SpaceID:    r.SpaceID,
		Kind:       RunKind(r.Kind),
		Source:     RunSource(r.Source),
		Status:     RunStatus(r.Status),
		StartTime:  r.StartTime,
		CreateTime: r.CreateTime,
	}
	if r.ThreadID.Valid {
		run.ThreadID = new(r.ThreadID.String)
	}
	if r.AgentID.Valid {
		run.AgentID = new(r.AgentID.String)
	}
	if r.ProviderID.Valid {
		run.ProviderID = new(r.ProviderID.String)
	}
	if r.ModelID.Valid {
		run.ModelID = new(r.ModelID.String)
	}
	if r.FlowRunID.Valid {
		run.FlowRunID = new(r.FlowRunID.String)
	}
	if r.EndTime.Valid {
		run.EndTime = new(r.EndTime.Time)
	}
	if err := unmarshalJSONB(r.Input, &run.Input, "run input"); err != nil {
		return nil, err
	}
	if len(r.Output) > 0 {
		var out RunOutput
		if err := unmarshalJSONB(r.Output, &out, "run output"); err != nil {
			return nil, err
		}
		run.Output = &out
	}
	if len(r.Error) > 0 {
		var detail ErrorDetail
		if err := unmarshalJSONB(r.Error, &detail, "run error"); err != nil {
			return nil, err
		}
		run.Error = &detail
	}
	if err := unmarshalJSONB(r.Metrics, &run.Metrics, "run metrics"); err != nil {
		return nil, err
	}
	return run, nil
}

type runStepRow struct {
	ID          string         `db:"id"`
	RunID       string         `db:"run_id"`
	SpaceID     string         `db:"space_id"`
	Seq         int32          `db:"seq"`
	Kind        string         `db:"kind"`
	MCPServerID sql.NullString `db:"mcp_server_id"`
	Name        string         `db:"name"`
	Status      string         `db:"status"`
	Input       []byte         `db:"input"`
	Output      []byte         `db:"output"`
	Error       []byte         `db:"error"`
	Metrics     []byte         `db:"metrics"`
	CreateTime  time.Time      `db:"create_time"`
}

func (r *runStepRow) toDomain() (*RunStep, error) {
	step := &RunStep{
		ID:         r.ID,
		RunID:      r.RunID,
		SpaceID:    r.SpaceID,
		Seq:        r.Seq,
		Kind:       RunStepKind(r.Kind),
		Name:       r.Name,
		Status:     RunStepStatus(r.Status),
		CreateTime: r.CreateTime,
	}
	if r.MCPServerID.Valid {
		step.MCPServerID = new(r.MCPServerID.String)
	}
	if err := unmarshalJSONB(r.Input, &step.Input, "step input"); err != nil {
		return nil, err
	}
	if len(r.Output) > 0 {
		if err := unmarshalJSONB(r.Output, &step.Output, "step output"); err != nil {
			return nil, err
		}
	}
	if len(r.Error) > 0 {
		var detail ErrorDetail
		if err := unmarshalJSONB(r.Error, &detail, "step error"); err != nil {
			return nil, err
		}
		step.Error = &detail
	}
	if err := unmarshalJSONB(r.Metrics, &step.Metrics, "step metrics"); err != nil {
		return nil, err
	}
	return step, nil
}

func (s *PostgresRunStore) Create(ctx context.Context, r *Run) error {
	const op errors.Op = "platform/ai.RunStore.Create"

	if r.ID == "" {
		idStr, err := GenerateRunID()
		if err != nil {
			return errors.E(op, err)
		}
		r.ID = idStr
	}

	inputBytes, outputBytes, errBytes, metricsBytes, err := marshalRunColumns(r)
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}

	const query = `
		INSERT INTO platform.ai_runs (
			id, space_id, kind, source, thread_id, agent_id, provider_id, model_id, flow_run_id,
			status, input, output, error, metrics, start_time, end_time, create_time
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, COALESCE($15, NOW()), $16, NOW())
		RETURNING start_time, create_time
	`
	var times struct {
		StartTime  time.Time `db:"start_time"`
		CreateTime time.Time `db:"create_time"`
	}
	var startVal sql.NullTime
	if !r.StartTime.IsZero() {
		startVal = sql.NullTime{Time: r.StartTime, Valid: true}
	}
	if err := s.db.Get(
		ctx,
		&times,
		query,
		r.ID,
		r.SpaceID,
		string(r.Kind),
		string(r.Source),
		strPtrToNullStr(r.ThreadID),
		strPtrToNullStr(r.AgentID),
		strPtrToNullStr(r.ProviderID),
		strPtrToNullStr(r.ModelID),
		strPtrToNullStr(r.FlowRunID),
		string(r.Status),
		inputBytes,
		nullableBytes(outputBytes),
		nullableBytes(errBytes),
		metricsBytes,
		startVal,
		timePtrToNullTime(r.EndTime),
	); err != nil {
		return errors.E(op, err)
	}
	r.StartTime = times.StartTime
	r.CreateTime = times.CreateTime
	return nil
}

func (s *PostgresRunStore) Get(ctx context.Context, spaceID, id string) (*Run, error) {
	const op errors.Op = "platform/ai.RunStore.Get"

	const query = `
		SELECT id, space_id, kind, source, thread_id, agent_id, provider_id, model_id, flow_run_id,
		       status, input, output, error, metrics, start_time, end_time, create_time
		FROM platform.ai_runs
		WHERE space_id = $1 AND id = $2
	`
	var row runRow
	if err := s.db.Get(ctx, &row, query, spaceID, id); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, ErrRunNotFound
		}
		return nil, errors.E(op, err)
	}
	r, err := row.toDomain()
	if err != nil {
		return nil, errors.E(op, errors.Internal, err)
	}
	return r, nil
}

func (s *PostgresRunStore) Update(ctx context.Context, r *Run) error {
	const op errors.Op = "platform/ai.RunStore.Update"

	_, outputBytes, errBytes, metricsBytes, err := marshalRunColumns(r)
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}

	const query = `
		UPDATE platform.ai_runs
		SET status = $3,
		    output = $4,
		    error = $5,
		    metrics = $6,
		    end_time = $7
		WHERE space_id = $1 AND id = $2
	`
	if err := s.db.ExecOne(
		ctx,
		query,
		r.SpaceID,
		r.ID,
		string(r.Status),
		nullableBytes(outputBytes),
		nullableBytes(errBytes),
		metricsBytes,
		timePtrToNullTime(r.EndTime),
	); err != nil {
		if errors.Is(err, errors.NotExist) {
			return ErrRunNotFound
		}
		return errors.E(op, err)
	}
	return nil
}

func (s *PostgresRunStore) List(ctx context.Context, filter ListRunsFilter) (*paging.Page[*Run], error) {
	const op errors.Op = "platform/ai.RunStore.List"

	pageSize := clampPageSize(filter.PageSize, 20, 100)
	cursor, err := paging.Decode(filter.PageToken)
	if err != nil {
		return nil, errors.E(op, errors.Invalid, fmt.Errorf("invalid page token: %w", err))
	}

	ds := pgDialect.From(goqu.T("ai_runs").Schema("platform")).
		Select(
			"id", "space_id", "kind", "source", "thread_id", "agent_id", "provider_id", "model_id", "flow_run_id",
			"status", "input", "output", "error", "metrics", "start_time", "end_time", "create_time",
		).
		Where(goqu.C("space_id").Eq(filter.SpaceID))

	if filter.Kind != nil && *filter.Kind != "" {
		ds = ds.Where(goqu.C("kind").Eq(string(*filter.Kind)))
	}
	if filter.Source != nil && *filter.Source != "" {
		ds = ds.Where(goqu.C("source").Eq(string(*filter.Source)))
	}
	if filter.AgentID != nil && *filter.AgentID != "" {
		ds = ds.Where(goqu.C("agent_id").Eq(*filter.AgentID))
	}
	if filter.ThreadID != nil && *filter.ThreadID != "" {
		ds = ds.Where(goqu.C("thread_id").Eq(*filter.ThreadID))
	}
	if filter.Status != nil && *filter.Status != "" {
		ds = ds.Where(goqu.C("status").Eq(string(*filter.Status)))
	}
	if cursor != nil {
		cursorTime, tErr := time.Parse(time.RFC3339Nano, cursor.SortValue)
		if tErr != nil {
			return nil, errors.E(op, errors.Invalid, "invalid run cursor timestamp")
		}
		ds = ds.Where(goqu.L("(create_time, id) < (?, ?)", cursorTime, cursor.ID))
	}

	ds = ds.Order(goqu.C("create_time").Desc(), goqu.C("id").Desc()).Limit(uint(pageSize + 1))

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var rows []runRow
	if err := s.db.Select(ctx, &rows, query, args...); err != nil {
		return nil, errors.E(op, err)
	}

	items := make([]*Run, 0, len(rows))
	for i := range rows {
		r, err := rows[i].toDomain()
		if err != nil {
			return nil, errors.E(op, errors.Internal, err)
		}
		items = append(items, r)
	}

	return paging.NewPage(items, pageSize, func(last *Run) paging.Cursor {
		return paging.Cursor{
			SortValue: last.CreateTime.UTC().Format(time.RFC3339Nano),
			ID:        last.ID,
		}
	}), nil
}

func (s *PostgresRunStore) AppendStep(ctx context.Context, step *RunStep) error {
	const op errors.Op = "platform/ai.RunStore.AppendStep"

	if step.ID == "" {
		idStr, err := GenerateRunStepID()
		if err != nil {
			return errors.E(op, err)
		}
		step.ID = idStr
	}

	inputMap := step.Input
	if inputMap == nil {
		inputMap = map[string]any{}
	}
	inputBytes, err := marshalJSONB(inputMap, "step input")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}
	var outputBytes []byte
	if step.Output != nil {
		outputBytes, err = marshalJSONB(step.Output, "step output")
		if err != nil {
			return errors.E(op, errors.Internal, err)
		}
	}
	var errBytes []byte
	if step.Error != nil {
		errBytes, err = marshalJSONB(step.Error, "step error")
		if err != nil {
			return errors.E(op, errors.Internal, err)
		}
	}
	metricsBytes, err := marshalJSONB(step.Metrics, "step metrics")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}

	const query = `
		WITH target_run AS (
			SELECT id FROM platform.ai_runs WHERE id = $2 AND space_id = $3 FOR UPDATE
		),
		next_seq AS (
			SELECT COALESCE(MAX(rs.seq), 0) + 1 AS seq
			FROM platform.ai_run_steps rs
			JOIN target_run tr ON tr.id = rs.run_id
		)
		INSERT INTO platform.ai_run_steps (
			id, run_id, space_id, seq, kind, mcp_server_id, name, status,
			input, output, error, metrics, create_time
		)
		SELECT
			$1, tr.id, $3, CASE WHEN $4 > 0 THEN $4 ELSE ns.seq END, $5, $6, $7, $8,
			$9, $10, $11, $12, NOW()
		FROM target_run tr
		CROSS JOIN next_seq ns
		RETURNING seq, create_time
	`
	var res struct {
		Seq        int32     `db:"seq"`
		CreateTime time.Time `db:"create_time"`
	}
	if err := s.db.Get(
		ctx,
		&res,
		query,
		step.ID,
		step.RunID,
		step.SpaceID,
		step.Seq,
		string(step.Kind),
		strPtrToNullStr(step.MCPServerID),
		step.Name,
		string(step.Status),
		inputBytes,
		nullableBytes(outputBytes),
		nullableBytes(errBytes),
		metricsBytes,
	); err != nil {
		if errors.Is(err, errors.NotExist) {
			return ErrRunNotFound
		}
		return errors.E(op, err)
	}
	step.Seq = res.Seq
	step.CreateTime = res.CreateTime
	return nil
}

func (s *PostgresRunStore) ListSteps(ctx context.Context, spaceID, runID string) ([]*RunStep, error) {
	const op errors.Op = "platform/ai.RunStore.ListSteps"

	const query = `
		SELECT id, run_id, space_id, seq, kind, mcp_server_id, name, status,
		       input, output, error, metrics, create_time
		FROM platform.ai_run_steps
		WHERE space_id = $1 AND run_id = $2
		ORDER BY seq ASC
	`
	var rows []runStepRow
	if err := s.db.Select(ctx, &rows, query, spaceID, runID); err != nil {
		return nil, errors.E(op, err)
	}
	out := make([]*RunStep, 0, len(rows))
	for i := range rows {
		st, err := rows[i].toDomain()
		if err != nil {
			return nil, errors.E(op, errors.Internal, err)
		}
		out = append(out, st)
	}
	return out, nil
}

func (s *PostgresRunStore) GetAgentStats7d(ctx context.Context, spaceID string, agentIDs []string, since time.Time) (map[string]AgentStats, error) {
	const op errors.Op = "platform/ai.RunStore.GetAgentStats7d"

	if len(agentIDs) == 0 {
		return map[string]AgentStats{}, nil
	}

	const query = `
		SELECT
			agent_id,
			COUNT(*)::INT AS total_runs,
			COUNT(*) FILTER (WHERE status = 'completed')::INT AS completed_runs,
			COUNT(*) FILTER (WHERE status IN ('failed', 'timed_out', 'max_steps_exceeded'))::INT AS failed_runs,
			MAX(create_time) AS last_run_at
		FROM platform.ai_runs
		WHERE space_id = $1 AND agent_id = ANY($2) AND create_time >= $3
		GROUP BY agent_id
	`
	var rows []struct {
		AgentID       string       `db:"agent_id"`
		TotalRuns     int32        `db:"total_runs"`
		CompletedRuns int32        `db:"completed_runs"`
		FailedRuns    int32        `db:"failed_runs"`
		LastRunAt     sql.NullTime `db:"last_run_at"`
	}
	if err := s.db.Select(ctx, &rows, query, spaceID, pq.Array(agentIDs), since); err != nil {
		return nil, errors.E(op, err)
	}

	out := make(map[string]AgentStats, len(rows))
	for _, row := range rows {
		st := AgentStats{
			TotalRuns7d:     row.TotalRuns,
			CompletedRuns7d: row.CompletedRuns,
			FailedRuns7d:    row.FailedRuns,
		}
		if row.LastRunAt.Valid {
			st.LastRunAt = new(row.LastRunAt.Time)
		}
		out[row.AgentID] = st
	}
	return out, nil
}

func (s *PostgresRunStore) GetMonthlySpendUSD(ctx context.Context, spaceID string, monthStart time.Time) (float64, error) {
	const op errors.Op = "platform/ai.RunStore.GetMonthlySpendUSD"

	const query = `
		SELECT COALESCE(SUM((metrics->>'estimated_cost_usd')::DOUBLE PRECISION), 0)
		FROM platform.ai_runs
		WHERE space_id = $1 AND create_time >= $2
	`
	var total float64
	if err := s.db.Get(ctx, &total, query, spaceID, monthStart); err != nil {
		return 0, errors.E(op, err)
	}
	return total, nil
}

func (s *PostgresRunStore) PurgeExpired(ctx context.Context, spaceID string, cutoff time.Time) (int64, error) {
	const op errors.Op = "platform/ai.RunStore.PurgeExpired"

	const query = `
		DELETE FROM platform.ai_runs
		WHERE space_id = $1 AND create_time < $2
	`
	res, err := s.db.Exec(ctx, query, spaceID, cutoff)
	if err != nil {
		return 0, errors.E(op, err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return 0, errors.E(op, err)
	}
	return affected, nil
}

func (s *PostgresRunStore) GetByIDs(ctx context.Context, spaceID string, ids []string) ([]*Run, error) {
	const op errors.Op = "platform/ai.RunStore.GetByIDs"

	if len(ids) == 0 {
		return []*Run{}, nil
	}

	const query = `
		SELECT id, space_id, kind, source, thread_id, agent_id, provider_id, model_id, flow_run_id,
		       status, input, output, error, metrics, start_time, end_time, create_time
		FROM platform.ai_runs
		WHERE space_id = $1 AND id = ANY($2)
	`
	var rows []runRow
	if err := s.db.Select(ctx, &rows, query, spaceID, pq.Array(ids)); err != nil {
		return nil, errors.E(op, err)
	}
	out := make([]*Run, 0, len(rows))
	for i := range rows {
		r, err := rows[i].toDomain()
		if err != nil {
			return nil, errors.E(op, errors.Internal, err)
		}
		out = append(out, r)
	}
	return out, nil
}

func (s *PostgresRunStore) ListSpaceIDs(ctx context.Context) ([]string, error) {
	const op errors.Op = "platform/ai.RunStore.ListSpaceIDs"

	const query = `
		SELECT DISTINCT space_id
		FROM platform.ai_runs
		ORDER BY space_id ASC
	`
	var ids []string
	if err := s.db.Select(ctx, &ids, query); err != nil {
		return nil, errors.E(op, err)
	}
	return ids, nil
}

func marshalRunColumns(r *Run) (inputBytes, outputBytes, errBytes, metricsBytes []byte, err error) {
	inputBytes, err = marshalJSONB(r.Input, "run input")
	if err != nil {
		return nil, nil, nil, nil, err
	}
	if r.Output != nil {
		outputBytes, err = marshalJSONB(r.Output, "run output")
		if err != nil {
			return nil, nil, nil, nil, err
		}
	}
	if r.Error != nil {
		errBytes, err = marshalJSONB(r.Error, "run error")
		if err != nil {
			return nil, nil, nil, nil, err
		}
	}
	metricsBytes, err = marshalJSONB(r.Metrics, "run metrics")
	if err != nil {
		return nil, nil, nil, nil, err
	}
	return inputBytes, outputBytes, errBytes, metricsBytes, nil
}
