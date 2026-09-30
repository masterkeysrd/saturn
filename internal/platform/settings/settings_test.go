package settings_test

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type TestSpaceSettings struct {
	Timezone   string `json:"timezone"`
	DateFormat string `json:"date_format,omitempty"`
}

var testKey = settings.NewKey[TestSpaceSettings](settings.ScopeSpace, "test_settings")

func TestSettings_Client_Lifecycle(t *testing.T) {
	ctx := context.Background()
	store := newMemoryStore()
	client := settings.Bind(store, testKey)

	assert.Equal(t, settings.ScopeSpace, client.Key().ScopeType())
	assert.Equal(t, "test_settings", client.Key().Namespace())

	// 1. Get non-existent
	_, err := client.Get(ctx, "spc_123")
	require.Error(t, err)
	assert.True(t, errors.Is(err, errors.NotExist))

	// 2. GetOrDefault non-existent
	fallback := TestSpaceSettings{Timezone: "UTC"}
	entry, err := client.GetOrDefault(ctx, "spc_123", fallback)
	require.NoError(t, err)
	assert.Equal(t, "UTC", entry.Value.Timezone)
	assert.Equal(t, int64(0), entry.Version)
	assert.Equal(t, "spc_123", entry.Target.ScopeID())

	// 3. Save initial insert (Version == 0)
	entry.Value.Timezone = "America/Santo_Domingo"
	err = client.Save(ctx, entry)
	require.NoError(t, err)
	assert.Equal(t, int64(1), entry.Version)
	assert.False(t, entry.CreateTime.IsZero())
	assert.False(t, entry.UpdateTime.IsZero())

	// 4. Get after insert
	fetched, err := client.Get(ctx, "spc_123")
	require.NoError(t, err)
	assert.Equal(t, "America/Santo_Domingo", fetched.Value.Timezone)
	assert.Equal(t, int64(1), fetched.Version)

	// 5. Save update (Version == 1)
	fetched.Value.DateFormat = "YYYY-MM-DD"
	err = client.Save(ctx, fetched)
	require.NoError(t, err)
	assert.Equal(t, int64(2), fetched.Version)

	// 6. OCC Conflict test
	staleEntry := &settings.Entry[TestSpaceSettings]{
		Target:  testKey.For("spc_123"),
		Value:   TestSpaceSettings{Timezone: "Europe/London"},
		Version: 1, // Stale version (current is 2)
	}
	err = client.Save(ctx, staleEntry)
	require.Error(t, err)
	assert.True(t, errors.Is(err, errors.Conflict))

	// 7. Initial insert conflict (Version == 0 when already exists)
	duplicateInitial := &settings.Entry[TestSpaceSettings]{
		Target:  testKey.For("spc_123"),
		Value:   TestSpaceSettings{Timezone: "Europe/London"},
		Version: 0,
	}
	err = client.Save(ctx, duplicateInitial)
	require.Error(t, err)
	assert.True(t, errors.Is(err, errors.Conflict))

	// 8. Set (blind upsert)
	upserted, err := client.Set(ctx, "spc_123", TestSpaceSettings{Timezone: "Asia/Tokyo"})
	require.NoError(t, err)
	assert.Equal(t, "Asia/Tokyo", upserted.Value.Timezone)
	assert.Equal(t, int64(3), upserted.Version)

	// 9. Verify get after upsert
	refetched, err := client.Get(ctx, "spc_123")
	require.NoError(t, err)
	assert.Equal(t, "Asia/Tokyo", refetched.Value.Timezone)
	assert.Equal(t, int64(3), refetched.Version)

	// 10. Delete raw
	err = store.DeleteRaw(ctx, settings.ScopeSpace, "spc_123", "test_settings")
	require.NoError(t, err)

	_, err = client.Get(ctx, "spc_123")
	require.Error(t, err)
	assert.True(t, errors.Is(err, errors.NotExist))
}

func TestSettings_Standalone_Functions(t *testing.T) {
	ctx := context.Background()
	store := newMemoryStore()

	target := testKey.For("spc_999")
	assert.Equal(t, "spc_999", target.ScopeID())
	assert.Equal(t, settings.ScopeSpace, target.ScopeType())
	assert.Equal(t, "test_settings", target.Namespace())

	// Standalone Set
	entry, err := settings.Set(ctx, store, target, TestSpaceSettings{Timezone: "America/New_York"})
	require.NoError(t, err)
	assert.Equal(t, "America/New_York", entry.Value.Timezone)
	assert.Equal(t, int64(1), entry.Version)

	// Standalone Get
	fetched, err := settings.Get(ctx, store, target)
	require.NoError(t, err)
	assert.Equal(t, "America/New_York", fetched.Value.Timezone)

	// Standalone Save
	fetched.Value.Timezone = "America/Chicago"
	err = settings.Save(ctx, store, fetched)
	require.NoError(t, err)
	assert.Equal(t, int64(2), fetched.Version)

	// Standalone nil store checks
	_, err = settings.Get[TestSpaceSettings](ctx, nil, target)
	require.Error(t, err)
	err = settings.Save[TestSpaceSettings](ctx, nil, fetched)
	require.Error(t, err)
	_, err = settings.Set[TestSpaceSettings](ctx, nil, target, TestSpaceSettings{})
	require.Error(t, err)
}

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

func TestPostgresStore(t *testing.T) {
	ctx := context.Background()

	t.Run("GetRaw success", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				rec := dest.(*settings.RawRecord)
				rec.ScopeType = "space"
				rec.ScopeID = "spc_1"
				rec.Namespace = "general"
				rec.Payload = []byte(`{"timezone":"UTC"}`)
				rec.Version = 1
				return nil
			},
		}
		pg := settings.NewPostgresStore(mock)
		rec, err := pg.GetRaw(ctx, settings.ScopeSpace, "spc_1", "general")
		require.NoError(t, err)
		assert.Equal(t, "spc_1", rec.ScopeID)
		assert.Equal(t, int64(1), rec.Version)
	})

	t.Run("GetRaw not found", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "not found")
			},
		}
		pg := settings.NewPostgresStore(mock)
		_, err := pg.GetRaw(ctx, settings.ScopeSpace, "spc_1", "general")
		require.Error(t, err)
		assert.True(t, errors.Is(err, errors.NotExist))
	})

	t.Run("SaveRaw initial insert", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				out := dest.(*struct {
					Version    int64     `db:"version"`
					CreateTime time.Time `db:"create_time"`
					UpdateTime time.Time `db:"update_time"`
				})
				out.Version = 1
				return nil
			},
		}
		pg := settings.NewPostgresStore(mock)
		rec := &settings.RawRecord{
			ScopeType: "space",
			ScopeID:   "spc_1",
			Namespace: "general",
			Payload:   []byte(`{}`),
			Version:   0,
		}
		err := pg.SaveRaw(ctx, rec)
		require.NoError(t, err)
		assert.Equal(t, int64(1), rec.Version)
	})

	t.Run("SaveRaw update", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				out := dest.(*struct {
					Version    int64     `db:"version"`
					CreateTime time.Time `db:"create_time"`
					UpdateTime time.Time `db:"update_time"`
				})
				out.Version = 2
				return nil
			},
		}
		pg := settings.NewPostgresStore(mock)
		rec := &settings.RawRecord{
			ScopeType: "space",
			ScopeID:   "spc_1",
			Namespace: "general",
			Payload:   []byte(`{}`),
			Version:   1,
		}
		err := pg.SaveRaw(ctx, rec)
		require.NoError(t, err)
		assert.Equal(t, int64(2), rec.Version)
	})

	t.Run("SaveRaw update conflict", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "not found")
			},
		}
		pg := settings.NewPostgresStore(mock)
		rec := &settings.RawRecord{
			ScopeType: "space",
			ScopeID:   "spc_1",
			Namespace: "general",
			Payload:   []byte(`{}`),
			Version:   1,
		}
		err := pg.SaveRaw(ctx, rec)
		require.Error(t, err)
		assert.True(t, errors.Is(err, errors.Conflict))
	})

	t.Run("SetRaw upsert", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				out := dest.(*struct {
					Version    int64     `db:"version"`
					CreateTime time.Time `db:"create_time"`
					UpdateTime time.Time `db:"update_time"`
				})
				out.Version = 5
				return nil
			},
		}
		pg := settings.NewPostgresStore(mock)
		rec := &settings.RawRecord{
			ScopeType: "space",
			ScopeID:   "spc_1",
			Namespace: "general",
			Payload:   []byte(`{}`),
		}
		saved, err := pg.SetRaw(ctx, rec)
		require.NoError(t, err)
		assert.Equal(t, int64(5), saved.Version)
	})

	t.Run("DeleteRaw", func(t *testing.T) {
		deleted := false
		mock := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				deleted = true
				return nil, nil
			},
		}
		pg := settings.NewPostgresStore(mock)
		err := pg.DeleteRaw(ctx, settings.ScopeSpace, "spc_1", "general")
		require.NoError(t, err)
		assert.True(t, deleted)
	})
}

// memoryStore provides a test double implementing settings.Store.
type memoryStore struct {
	mu      sync.RWMutex
	records map[string]*settings.RawRecord
}

func newMemoryStore() *memoryStore {
	return &memoryStore{
		records: make(map[string]*settings.RawRecord),
	}
}

func testRecordKey(scopeType settings.ScopeType, scopeID, namespace string) string {
	return fmt.Sprintf("%s:%s:%s", scopeType, scopeID, namespace)
}

func (m *memoryStore) GetRaw(ctx context.Context, scopeType settings.ScopeType, scopeID, namespace string) (*settings.RawRecord, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	k := testRecordKey(scopeType, scopeID, namespace)
	rec, exists := m.records[k]
	if !exists {
		return nil, errors.E(errors.NotExist, "settings record not found")
	}

	payloadCopy := make([]byte, len(rec.Payload))
	copy(payloadCopy, rec.Payload)

	return &settings.RawRecord{
		ScopeType:  rec.ScopeType,
		ScopeID:    rec.ScopeID,
		Namespace:  rec.Namespace,
		Payload:    payloadCopy,
		Version:    rec.Version,
		CreateTime: rec.CreateTime,
		UpdateTime: rec.UpdateTime,
	}, nil
}

func (m *memoryStore) SaveRaw(ctx context.Context, rec *settings.RawRecord) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	k := testRecordKey(settings.ScopeType(rec.ScopeType), rec.ScopeID, rec.Namespace)
	existing, exists := m.records[k]
	now := time.Now().UTC()

	if rec.Version == 0 {
		if exists {
			return errors.E(errors.Conflict, "settings record already exists")
		}
		rec.Version = 1
		rec.CreateTime = now
		rec.UpdateTime = now

		payloadCopy := make([]byte, len(rec.Payload))
		copy(payloadCopy, rec.Payload)

		m.records[k] = &settings.RawRecord{
			ScopeType:  rec.ScopeType,
			ScopeID:    rec.ScopeID,
			Namespace:  rec.Namespace,
			Payload:    payloadCopy,
			Version:    rec.Version,
			CreateTime: rec.CreateTime,
			UpdateTime: rec.UpdateTime,
		}
		return nil
	}

	if !exists || existing.Version != rec.Version {
		return errors.E(errors.Conflict, "settings were modified concurrently or do not exist")
	}

	rec.Version++
	rec.UpdateTime = now
	rec.CreateTime = existing.CreateTime

	payloadCopy := make([]byte, len(rec.Payload))
	copy(payloadCopy, rec.Payload)

	m.records[k] = &settings.RawRecord{
		ScopeType:  rec.ScopeType,
		ScopeID:    rec.ScopeID,
		Namespace:  rec.Namespace,
		Payload:    payloadCopy,
		Version:    rec.Version,
		CreateTime: rec.CreateTime,
		UpdateTime: rec.UpdateTime,
	}

	return nil
}

func (m *memoryStore) SetRaw(ctx context.Context, rec *settings.RawRecord) (*settings.RawRecord, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	k := testRecordKey(settings.ScopeType(rec.ScopeType), rec.ScopeID, rec.Namespace)
	existing, exists := m.records[k]
	now := time.Now().UTC()
	var newVersion int64 = 1
	createTime := now

	if exists {
		newVersion = existing.Version + 1
		createTime = existing.CreateTime
	}

	payloadCopy := make([]byte, len(rec.Payload))
	copy(payloadCopy, rec.Payload)

	saved := &settings.RawRecord{
		ScopeType:  rec.ScopeType,
		ScopeID:    rec.ScopeID,
		Namespace:  rec.Namespace,
		Payload:    payloadCopy,
		Version:    newVersion,
		CreateTime: createTime,
		UpdateTime: now,
	}

	m.records[k] = saved
	return saved, nil
}

func (m *memoryStore) DeleteRaw(ctx context.Context, scopeType settings.ScopeType, scopeID, namespace string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	k := testRecordKey(scopeType, scopeID, namespace)
	delete(m.records, k)
	return nil
}
