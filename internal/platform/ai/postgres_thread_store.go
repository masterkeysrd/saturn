package ai

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/doug-martin/goqu/v9"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// PostgresThreadStore implements ThreadStore against `platform.ai_threads` and `platform.ai_messages`.
// Every query strictly enforces `space_id = $1 AND user_id = $2`.
type PostgresThreadStore struct {
	db db.DB
}

// NewThreadStore constructs a PostgresThreadStore.
func NewThreadStore(database db.DB) *PostgresThreadStore {
	return &PostgresThreadStore{db: database}
}

type threadRow struct {
	ID            string         `db:"id"`
	SpaceID       string         `db:"space_id"`
	UserID        string         `db:"user_id"`
	AgentID       sql.NullString `db:"agent_id"`
	ModelID       sql.NullString `db:"model_id"`
	Title         string         `db:"title"`
	Status        string         `db:"status"`
	Config        []byte         `db:"config"`
	State         []byte         `db:"state"`
	MessageCount  int32          `db:"message_count"`
	IsPinned      bool           `db:"is_pinned"`
	IsArchived    bool           `db:"is_archived"`
	LastMessageAt time.Time      `db:"last_message_at"`
	CreateTime    time.Time      `db:"create_time"`
	UpdateTime    time.Time      `db:"update_time"`
}

func (r *threadRow) toDomain() (*Thread, error) {
	t := &Thread{
		ID:            r.ID,
		SpaceID:       r.SpaceID,
		UserID:        r.UserID,
		Title:         r.Title,
		Status:        ThreadStatus(r.Status),
		MessageCount:  r.MessageCount,
		IsPinned:      r.IsPinned,
		IsArchived:    r.IsArchived,
		LastMessageAt: r.LastMessageAt,
		CreateTime:    r.CreateTime,
		UpdateTime:    r.UpdateTime,
	}
	if r.AgentID.Valid {
		t.AgentID = new(r.AgentID.String)
	}
	if r.ModelID.Valid {
		t.ModelID = new(r.ModelID.String)
	}
	if err := unmarshalJSONB(r.Config, &t.Config, "thread config"); err != nil {
		return nil, err
	}
	if err := unmarshalJSONB(r.State, &t.State, "thread state"); err != nil {
		return nil, err
	}
	return t, nil
}

type messageRow struct {
	ID         string         `db:"id"`
	ThreadID   string         `db:"thread_id"`
	SpaceID    string         `db:"space_id"`
	RunID      sql.NullString `db:"run_id"`
	Seq        int32          `db:"seq"`
	Role       string         `db:"role"`
	Blocks     []byte         `db:"blocks"`
	Metadata   []byte         `db:"metadata"`
	CreateTime time.Time      `db:"create_time"`
}

func (r *messageRow) toDomain() (*ThreadMessage, error) {
	blocks, err := UnmarshalContentBlocks(r.Blocks)
	if err != nil {
		return nil, err
	}
	m := &ThreadMessage{
		ID:         r.ID,
		ThreadID:   r.ThreadID,
		SpaceID:    r.SpaceID,
		Seq:        r.Seq,
		Role:       MessageRole(r.Role),
		Blocks:     blocks,
		CreateTime: r.CreateTime,
	}
	if r.RunID.Valid {
		m.RunID = new(r.RunID.String)
	}
	if err := unmarshalJSONB(r.Metadata, &m.Metadata, "message metadata"); err != nil {
		return nil, err
	}
	return m, nil
}

func (s *PostgresThreadStore) Create(ctx context.Context, t *Thread) error {
	const op errors.Op = "platform/ai.ThreadStore.Create"

	if t.ID == "" {
		idStr, err := GenerateThreadID()
		if err != nil {
			return errors.E(op, err)
		}
		t.ID = idStr
	}

	configBytes, err := marshalJSONB(t.Config, "thread config")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}
	stateBytes, err := marshalJSONB(t.State, "thread state")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}

	const query = `
		INSERT INTO platform.ai_threads (
			id, space_id, user_id, agent_id, model_id, title, status, config, state,
			message_count, is_pinned, is_archived, last_message_at, create_time, update_time
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11, NOW(), NOW(), NOW())
		RETURNING last_message_at, create_time, update_time
	`
	var times struct {
		LastMessageAt time.Time `db:"last_message_at"`
		CreateTime    time.Time `db:"create_time"`
		UpdateTime    time.Time `db:"update_time"`
	}
	if err := s.db.Get(
		ctx,
		&times,
		query,
		t.ID,
		t.SpaceID,
		t.UserID,
		strPtrToNullStr(t.AgentID),
		strPtrToNullStr(t.ModelID),
		t.Title,
		string(t.Status),
		configBytes,
		stateBytes,
		t.IsPinned,
		t.IsArchived,
	); err != nil {
		return errors.E(op, err)
	}
	t.LastMessageAt = times.LastMessageAt
	t.CreateTime = times.CreateTime
	t.UpdateTime = times.UpdateTime
	return nil
}

func (s *PostgresThreadStore) Get(ctx context.Context, spaceID, userID, id string) (*Thread, error) {
	const op errors.Op = "platform/ai.ThreadStore.Get"

	const query = `
		SELECT id, space_id, user_id, agent_id, model_id, title, status, config, state,
		       message_count, is_pinned, is_archived, last_message_at, create_time, update_time
		FROM platform.ai_threads
		WHERE space_id = $1 AND user_id = $2 AND id = $3
	`
	var row threadRow
	if err := s.db.Get(ctx, &row, query, spaceID, userID, id); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, ErrThreadNotFound
		}
		return nil, errors.E(op, err)
	}
	t, err := row.toDomain()
	if err != nil {
		return nil, errors.E(op, errors.Internal, err)
	}
	return t, nil
}

func (s *PostgresThreadStore) List(ctx context.Context, filter ListThreadsFilter) (*paging.Page[*Thread], error) {
	const op errors.Op = "platform/ai.ThreadStore.List"

	pageSize := clampPageSize(filter.PageSize, 20, 100)
	cursor, err := paging.Decode(filter.PageToken)
	if err != nil {
		return nil, errors.E(op, errors.Invalid, fmt.Errorf("invalid page token: %w", err))
	}

	archived := false
	if filter.IsArchived != nil {
		archived = *filter.IsArchived
	}

	ds := pgDialect.From(goqu.T("ai_threads").Schema("platform")).
		Select(
			"id", "space_id", "user_id", "agent_id", "model_id", "title", "status",
			"config", "state", "message_count", "is_pinned", "is_archived",
			"last_message_at", "create_time", "update_time",
		).
		Where(
			goqu.C("space_id").Eq(filter.SpaceID),
			goqu.C("user_id").Eq(filter.UserID),
			goqu.C("is_archived").Eq(archived),
		)

	if cursor != nil {
		pinnedStr, tsStr, ok := strings.Cut(cursor.SortValue, "|")
		if !ok {
			return nil, errors.E(op, errors.Invalid, "invalid thread page token")
		}
		pinned := pinnedStr == "1"
		cursorTime, tErr := time.Parse(time.RFC3339Nano, tsStr)
		if tErr != nil {
			return nil, errors.E(op, errors.Invalid, "invalid thread cursor timestamp")
		}
		ds = ds.Where(goqu.L("(is_pinned, last_message_at, id) < (?, ?, ?)", pinned, cursorTime, cursor.ID))
	}

	ds = ds.Order(goqu.C("is_pinned").Desc(), goqu.C("last_message_at").Desc(), goqu.C("id").Desc()).
		Limit(uint(pageSize + 1))

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var rows []threadRow
	if err := s.db.Select(ctx, &rows, query, args...); err != nil {
		return nil, errors.E(op, err)
	}

	items := make([]*Thread, 0, len(rows))
	for i := range rows {
		t, err := rows[i].toDomain()
		if err != nil {
			return nil, errors.E(op, errors.Internal, err)
		}
		items = append(items, t)
	}

	return paging.NewPage(items, pageSize, func(last *Thread) paging.Cursor {
		pinnedPrefix := "0"
		if last.IsPinned {
			pinnedPrefix = "1"
		}
		return paging.Cursor{
			SortValue: pinnedPrefix + "|" + last.LastMessageAt.UTC().Format(time.RFC3339Nano),
			ID:        last.ID,
		}
	}), nil
}

func (s *PostgresThreadStore) Update(ctx context.Context, t *Thread) error {
	const op errors.Op = "platform/ai.ThreadStore.Update"

	configBytes, err := marshalJSONB(t.Config, "thread config")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}
	stateBytes, err := marshalJSONB(t.State, "thread state")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}

	const query = `
		UPDATE platform.ai_threads
		SET agent_id = $4,
		    model_id = $5,
		    title = $6,
		    status = $7,
		    config = $8,
		    state = $9,
		    is_pinned = $10,
		    is_archived = $11,
		    update_time = NOW()
		WHERE space_id = $1 AND user_id = $2 AND id = $3
		RETURNING update_time
	`
	var updateTime time.Time
	if err := s.db.Get(
		ctx,
		&updateTime,
		query,
		t.SpaceID,
		t.UserID,
		t.ID,
		strPtrToNullStr(t.AgentID),
		strPtrToNullStr(t.ModelID),
		t.Title,
		string(t.Status),
		configBytes,
		stateBytes,
		t.IsPinned,
		t.IsArchived,
	); err != nil {
		if errors.Is(err, errors.NotExist) {
			return ErrThreadNotFound
		}
		return errors.E(op, err)
	}
	t.UpdateTime = updateTime
	return nil
}

func (s *PostgresThreadStore) Delete(ctx context.Context, spaceID, userID, id string) error {
	const op errors.Op = "platform/ai.ThreadStore.Delete"

	const query = `DELETE FROM platform.ai_threads WHERE space_id = $1 AND user_id = $2 AND id = $3`
	if err := s.db.ExecOne(ctx, query, spaceID, userID, id); err != nil {
		if errors.Is(err, errors.NotExist) {
			return ErrThreadNotFound
		}
		return errors.E(op, err)
	}
	return nil
}

func (s *PostgresThreadStore) AppendMessage(ctx context.Context, spaceID, userID string, msg *ThreadMessage) error {
	const op errors.Op = "platform/ai.ThreadStore.AppendMessage"

	if msg.ID == "" {
		idStr, err := GenerateMessageID()
		if err != nil {
			return errors.E(op, err)
		}
		msg.ID = idStr
	}

	blocksBytes, err := MarshalContentBlocks(msg.Blocks)
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}
	metaBytes, err := marshalJSONB(msg.Metadata, "message metadata")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}

	const query = `
		WITH locked_thread AS (
			UPDATE platform.ai_threads
			SET message_count = message_count + 1,
			    last_message_at = NOW(),
			    update_time = NOW()
			WHERE space_id = $2 AND user_id = $3 AND id = $4
			RETURNING id
		),
		next_seq AS (
			SELECT COALESCE(MAX(m.seq), 0) + 1 AS seq
			FROM platform.ai_messages m
			JOIN locked_thread lt ON lt.id = m.thread_id
		)
		INSERT INTO platform.ai_messages (
			id, thread_id, space_id, run_id, seq, role, blocks, metadata, create_time
		)
		SELECT
			$1, lt.id, $2, $5, ns.seq, $6, $7, $8, NOW()
		FROM locked_thread lt
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
		msg.ID,
		spaceID,
		userID,
		msg.ThreadID,
		strPtrToNullStr(msg.RunID),
		string(msg.Role),
		blocksBytes,
		metaBytes,
	); err != nil {
		if errors.Is(err, errors.NotExist) {
			return ErrThreadNotFound
		}
		return errors.E(op, err)
	}
	msg.SpaceID = spaceID
	msg.Seq = res.Seq
	msg.CreateTime = res.CreateTime
	return nil
}

func (s *PostgresThreadStore) UpdateMessage(ctx context.Context, spaceID, userID string, msg *ThreadMessage) error {
	const op errors.Op = "platform/ai.ThreadStore.UpdateMessage"

	blocksBytes, err := MarshalContentBlocks(msg.Blocks)
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}
	metaBytes, err := marshalJSONB(msg.Metadata, "message metadata")
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}

	const query = `
		UPDATE platform.ai_messages m
		SET blocks = $5,
		    metadata = $6
		FROM platform.ai_threads t
		WHERE m.thread_id = t.id
		  AND t.space_id = $1
		  AND t.user_id = $2
		  AND m.thread_id = $3
		  AND m.id = $4
	`
	if err := s.db.ExecOne(ctx, query, spaceID, userID, msg.ThreadID, msg.ID, blocksBytes, metaBytes); err != nil {
		if errors.Is(err, errors.NotExist) {
			return ErrThreadNotFound
		}
		return errors.E(op, err)
	}
	return nil
}

func (s *PostgresThreadStore) ListMessages(ctx context.Context, filter ListMessagesFilter) (*paging.Page[*ThreadMessage], error) {
	const op errors.Op = "platform/ai.ThreadStore.ListMessages"

	pageSize := clampPageSize(filter.PageSize, 50, 200)
	cursor, err := paging.Decode(filter.PageToken)
	if err != nil {
		return nil, errors.E(op, errors.Invalid, fmt.Errorf("invalid page token: %w", err))
	}

	ds := pgDialect.From(goqu.T("ai_messages").Schema("platform").As("m")).
		Join(
			goqu.T("ai_threads").Schema("platform").As("t"),
			goqu.On(goqu.I("t.id").Eq(goqu.I("m.thread_id"))),
		).
		Select(
			goqu.I("m.id"),
			goqu.I("m.thread_id"),
			goqu.I("m.space_id"),
			goqu.I("m.run_id"),
			goqu.I("m.seq"),
			goqu.I("m.role"),
			goqu.I("m.blocks"),
			goqu.I("m.metadata"),
			goqu.I("m.create_time"),
		).
		Where(
			goqu.I("t.space_id").Eq(filter.SpaceID),
			goqu.I("t.user_id").Eq(filter.UserID),
			goqu.I("m.thread_id").Eq(filter.ThreadID),
		)

	if cursor != nil {
		seqVal, sErr := strconv.ParseInt(cursor.SortValue, 10, 32)
		if sErr != nil {
			return nil, errors.E(op, errors.Invalid, "invalid message cursor sequence")
		}
		ds = ds.Where(goqu.I("m.seq").Gt(int32(seqVal)))
	}

	ds = ds.Order(goqu.I("m.seq").Asc()).Limit(uint(pageSize + 1))

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var rows []messageRow
	if err := s.db.Select(ctx, &rows, query, args...); err != nil {
		return nil, errors.E(op, err)
	}

	items := make([]*ThreadMessage, 0, len(rows))
	for i := range rows {
		m, err := rows[i].toDomain()
		if err != nil {
			return nil, errors.E(op, errors.Internal, err)
		}
		items = append(items, m)
	}

	return paging.NewPage(items, pageSize, func(last *ThreadMessage) paging.Cursor {
		return paging.Cursor{
			SortValue: strconv.Itoa(int(last.Seq)),
			ID:        last.ID,
		}
	}), nil
}

func clampPageSize(size, def, maxSize int32) int {
	if size <= 0 {
		return int(def)
	}
	return int(min(size, maxSize))
}
