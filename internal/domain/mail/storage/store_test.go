package storage

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockDB struct {
	getFn     func(ctx context.Context, dest any, query string, args ...any) error
	selectFn  func(ctx context.Context, dest any, query string, args ...any) error
	execFn    func(ctx context.Context, query string, args ...any) (sql.Result, error)
	execOneFn func(ctx context.Context, query string, args ...any) error
	rebindFn  func(query string) string
}

func (m *mockDB) Get(ctx context.Context, dest any, query string, args ...any) error {
	if m.getFn != nil {
		return m.getFn(ctx, dest, query, args...)
	}
	return nil
}

func (m *mockDB) Select(ctx context.Context, dest any, query string, args ...any) error {
	if m.selectFn != nil {
		return m.selectFn(ctx, dest, query, args...)
	}
	return nil
}

func (m *mockDB) Exec(ctx context.Context, query string, args ...any) (sql.Result, error) {
	if m.execFn != nil {
		return m.execFn(ctx, query, args...)
	}
	return nil, nil
}

func (m *mockDB) ExecOne(ctx context.Context, query string, args ...any) error {
	if m.execOneFn != nil {
		return m.execOneFn(ctx, query, args...)
	}
	return nil
}

func (m *mockDB) Rebind(query string) string {
	if m.rebindFn != nil {
		return m.rebindFn(query)
	}
	return query
}

type mockResult struct {
	rowsAffected int64
}

func (r mockResult) LastInsertId() (int64, error) { return 0, nil }
func (r mockResult) RowsAffected() (int64, error) { return r.rowsAffected, nil }

func TestMailboxStore(t *testing.T) {
	ctx := context.Background()

	t.Run("Create", func(t *testing.T) {
		var executedQuery string
		db := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				executedQuery = query
				return mockResult{rowsAffected: 1}, nil
			},
		}
		store := NewMailboxStore(db)

		mbx := &mail.Mailbox{
			ID:                 "mbx_1",
			SpaceID:            "spc_1",
			ConnectedAccountID: "acc_1",
			Name:               "Inbox",
			SystemRole:         mail.SystemBucketInbox,
		}

		err := store.Create(ctx, mbx)
		require.NoError(t, err)
		assert.Contains(t, executedQuery, "INSERT INTO mail.mailboxes")
	})

	t.Run("GetByID found", func(t *testing.T) {
		db := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				if rec, ok := dest.(*MailboxRecord); ok {
					rec.ID = "mbx_1"
					rec.SpaceID = "spc_1"
					rec.ConnectedAccountID = "acc_1"
					rec.Name = "Inbox"
					rec.SystemRole = "inbox"
				}
				return nil
			},
		}
		store := NewMailboxStore(db)

		mbx, err := store.GetByID(ctx, "spc_1", "mbx_1")
		require.NoError(t, err)
		require.NotNil(t, mbx)
		assert.Equal(t, "mbx_1", mbx.ID)
		assert.Equal(t, mail.SystemBucketInbox, mbx.SystemRole)
	})

	t.Run("GetByID not found", func(t *testing.T) {
		db := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "not found")
			},
		}
		store := NewMailboxStore(db)

		mbx, err := store.GetByID(ctx, "spc_1", "mbx_none")
		require.NoError(t, err)
		assert.Nil(t, mbx)
	})
}

func TestThreadStore(t *testing.T) {
	ctx := context.Background()

	t.Run("Create", func(t *testing.T) {
		var executedQuery string
		db := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				executedQuery = query
				return mockResult{rowsAffected: 1}, nil
			},
		}
		store := NewThreadStore(db)

		thread := &mail.Thread{
			ID:                 "mth_1",
			SpaceID:            "spc_1",
			ConnectedAccountID: "acc_1",
			Subject:            "Test Subject",
			LastMessageAt:      time.Now().UTC(),
		}

		err := store.Create(ctx, thread)
		require.NoError(t, err)
		assert.Contains(t, executedQuery, "INSERT INTO mail.threads")
	})

	t.Run("PruneThreadsOlderThanWindow", func(t *testing.T) {
		db := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				return mockResult{rowsAffected: 42}, nil
			},
		}
		store := NewThreadStore(db)

		pruned, err := store.PruneThreadsOlderThanWindow(ctx, time.Now().Add(-90*24*time.Hour))
		require.NoError(t, err)
		assert.Equal(t, int64(42), pruned)
	})
}

func TestMessageStore(t *testing.T) {
	ctx := context.Background()

	t.Run("SaveBody and GetBody", func(t *testing.T) {
		var savedBody *mail.MessageBody
		db := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				return mockResult{rowsAffected: 1}, nil
			},
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				if rec, ok := dest.(*MessageBodyRecord); ok {
					rec.MessageID = "msg_1"
					rec.SpaceID = "spc_1"
					rec.SanitizedHTML = "<p>Sanitized</p>"
					rec.PlainText = "Sanitized"
					rec.ExpiresAt = time.Now().Add(30 * 24 * time.Hour)
				}
				return nil
			},
		}
		store := NewMessageStore(db)

		savedBody = &mail.MessageBody{
			MessageID:     "msg_1",
			SpaceID:       "spc_1",
			SanitizedHTML: "<p>Sanitized</p>",
			PlainText:     "Sanitized",
			ExpiresAt:     time.Now().Add(30 * 24 * time.Hour),
		}

		err := store.SaveBody(ctx, savedBody)
		require.NoError(t, err)

		body, err := store.GetBody(ctx, "spc_1", "msg_1")
		require.NoError(t, err)
		require.NotNil(t, body)
		assert.Equal(t, "<p>Sanitized</p>", body.SanitizedHTML)
	})

	t.Run("DeleteExpiredBodies", func(t *testing.T) {
		db := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				return mockResult{rowsAffected: 15}, nil
			},
		}
		store := NewMessageStore(db)

		deleted, err := store.DeleteExpiredBodies(ctx, time.Now())
		require.NoError(t, err)
		assert.Equal(t, int64(15), deleted)
	})
}

func TestDraftStore(t *testing.T) {
	ctx := context.Background()

	t.Run("Create and GetByID", func(t *testing.T) {
		db := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				return mockResult{rowsAffected: 1}, nil
			},
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				if rec, ok := dest.(*DraftRecord); ok {
					rec.ID = "mdf_1"
					rec.SpaceID = "spc_1"
					rec.ConnectedAccountID = "acc_1"
					rec.Mode = "new"
					rec.Subject = "Draft 1"
				}
				return nil
			},
		}
		store := NewDraftStore(db)

		draft := &mail.Draft{
			ID:                 "mdf_1",
			SpaceID:            "spc_1",
			ConnectedAccountID: "acc_1",
			Mode:               mail.DraftModeNew,
			Subject:            "Draft 1",
		}

		err := store.Create(ctx, draft)
		require.NoError(t, err)

		fetched, err := store.GetByID(ctx, "spc_1", "mdf_1")
		require.NoError(t, err)
		require.NotNil(t, fetched)
		assert.Equal(t, "Draft 1", fetched.Subject)
	})
}

func TestSyncStateStore(t *testing.T) {
	ctx := context.Background()

	t.Run("Upsert and Get", func(t *testing.T) {
		db := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				return mockResult{rowsAffected: 1}, nil
			},
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				if rec, ok := dest.(*SyncStateRecord); ok {
					rec.ConnectedAccountID = "acc_1"
					rec.SpaceID = "spc_1"
					rec.WindowDays = 90
				}
				return nil
			},
		}
		store := NewSyncStateStore(db)

		cursor := "hist_123"
		err := store.Upsert(ctx, &mail.SyncState{
			ConnectedAccountID: "acc_1",
			SpaceID:            "spc_1",
			SyncCursor:         &cursor,
			WindowDays:         90,
		})
		require.NoError(t, err)

		state, err := store.Get(ctx, "spc_1", "acc_1")
		require.NoError(t, err)
		require.NotNil(t, state)
		assert.Equal(t, 90, state.WindowDays)
	})

	t.Run("CapabilityMail cleaner deletes mail tables for account", func(t *testing.T) {
		var queries []string
		db := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				queries = append(queries, query)
				return mockResult{rowsAffected: 1}, nil
			},
		}
		NewSyncStateStore(db)
		err := connector.DefaultCleanerRegistry.RunCleaners(ctx, "spc_1", "acc_1", connector.CapabilityMail)
		require.NoError(t, err)
		require.GreaterOrEqual(t, len(queries), 5)
		joined := ""
		for _, q := range queries {
			joined += q + "\n"
		}
		assert.Contains(t, joined, "DELETE FROM mail.drafts")
		assert.Contains(t, joined, "DELETE FROM mail.messages")
		assert.Contains(t, joined, "DELETE FROM mail.threads")
		assert.Contains(t, joined, "DELETE FROM mail.mailboxes")
		assert.Contains(t, joined, "DELETE FROM mail.sync_states")
	})
}

func TestThreadSummaryStore(t *testing.T) {
	ctx := context.Background()

	t.Run("Get returns nil for missing row", func(t *testing.T) {
		db := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "not found")
			},
		}
		store := NewThreadSummaryStore(db)

		summary, err := store.Get(ctx, "spc_1", "mth_1", "en")
		require.NoError(t, err)
		assert.Nil(t, summary)
	})

	t.Run("Upsert and Get", func(t *testing.T) {
		var executedQuery string
		db := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				executedQuery = query
				return mockResult{rowsAffected: 1}, nil
			},
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				if rec, ok := dest.(*ThreadSummaryRecord); ok {
					rec.ThreadID = "mth_1"
					rec.SpaceID = "spc_1"
					rec.Language = "en"
					rec.TLDR = "Resumen"
					rec.KeyPointsJSON = []byte(`["punto 1"]`)
					rec.ActionJSON = []byte(`["accion 1"]`)
					rec.LastMessageAt = time.Now().UTC()
					rec.MessageCount = 2
				}
				return nil
			},
		}
		store := NewThreadSummaryStore(db)

		err := store.Upsert(ctx, &mail.ThreadSummary{
			ThreadID:      "mth_1",
			SpaceID:       "spc_1",
			Language:      "en",
			TLDR:          "Resumen",
			KeyPoints:     []string{"punto 1"},
			ActionItems:   []string{"accion 1"},
			LastMessageAt: time.Now().UTC(),
			MessageCount:  2,
			FlowRunID:     new("frw_1"),
		})
		require.NoError(t, err)
		assert.Contains(t, executedQuery, "INSERT INTO mail.thread_summaries")
		assert.Contains(t, executedQuery, "ON CONFLICT (thread_id, language)")

		summary, err := store.Get(ctx, "spc_1", "mth_1", "en")
		require.NoError(t, err)
		require.NotNil(t, summary)
		assert.Equal(t, "Resumen", summary.TLDR)
		assert.Equal(t, []string{"punto 1"}, summary.KeyPoints)
		assert.Equal(t, []string{"accion 1"}, summary.ActionItems)
		assert.Equal(t, 2, summary.MessageCount)
	})
}
