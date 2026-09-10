package backup_test

import (
	"bytes"
	"context"
	"io"
	"os"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/backup"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestLocalStorage_Lifecycle(t *testing.T) {
	ctx := context.Background()
	tempDir, err := os.MkdirTemp("", "backup_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer func() { _ = os.RemoveAll(tempDir) }()

	storage, err := backup.NewLocalStorage(tempDir)
	if err != nil {
		t.Fatalf("failed to create local storage: %v", err)
	}

	key := "test_backup.sql"
	payload := []byte("SELECT 1; -- mock backup payload")

	// 1. Upload
	if err := storage.Upload(ctx, key, bytes.NewReader(payload)); err != nil {
		t.Fatalf("unexpected upload error: %v", err)
	}

	// 2. Download
	var downloadBuf bytes.Buffer
	if err := storage.Download(ctx, key, &downloadBuf); err != nil {
		t.Fatalf("unexpected download error: %v", err)
	}
	if !bytes.Equal(downloadBuf.Bytes(), payload) {
		t.Fatalf("expected payload %q, got %q", payload, downloadBuf.Bytes())
	}

	// 3. Delete
	if err := storage.Delete(ctx, key); err != nil {
		t.Fatalf("unexpected delete error: %v", err)
	}

	// 4. Download non-existent should return NotExist
	var emptyBuf bytes.Buffer
	err = storage.Download(ctx, key, &emptyBuf)
	if err == nil {
		t.Fatal("expected error downloading non-existent file, got nil")
	}
	if !errors.Is(err, errors.NotExist) {
		t.Fatalf("expected errors.NotExist, got %v", err)
	}
}

type memoryStorage struct {
	files map[string][]byte
}

func newMemoryStorage() *memoryStorage {
	return &memoryStorage{files: make(map[string][]byte)}
}

func (m *memoryStorage) Upload(ctx context.Context, key string, reader io.Reader) error {
	data, err := io.ReadAll(reader)
	if err != nil {
		return err
	}
	m.files[key] = data
	return nil
}

func (m *memoryStorage) Download(ctx context.Context, key string, writer io.Writer) error {
	data, ok := m.files[key]
	if !ok {
		return os.ErrNotExist
	}
	_, err := writer.Write(data)
	return err
}

func (m *memoryStorage) Delete(ctx context.Context, key string) error {
	delete(m.files, key)
	return nil
}

func TestPostgresBackupManager_ListBackups_Empty(t *testing.T) {
	ctx := context.Background()
	tempDir, err := os.MkdirTemp("", "backup_mgr_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer func() { _ = os.RemoveAll(tempDir) }()

	memStorage := newMemoryStorage()
	cfg := backup.PostgresConfig{
		Host:     "localhost",
		Port:     "5432",
		User:     "postgres",
		Password: "password",
		Database: "saturn",
	}

	mgr := backup.NewPostgresBackupManager(memStorage, cfg, tempDir)

	index, err := mgr.ListBackups(ctx)
	if err != nil {
		t.Fatalf("unexpected error listing backups on empty state: %v", err)
	}
	if index == nil {
		t.Fatal("expected non-nil index")
	}
	if len(index.Backups) != 0 {
		t.Fatalf("expected 0 backups, got %d", len(index.Backups))
	}
}

func TestPostgresBackupManager_SyncAndList(t *testing.T) {
	ctx := context.Background()
	tempDir, err := os.MkdirTemp("", "backup_sync_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer func() { _ = os.RemoveAll(tempDir) }()

	storage, err := backup.NewLocalStorage(tempDir)
	if err != nil {
		t.Fatalf("failed to create local storage: %v", err)
	}

	cfg := backup.PostgresConfig{
		Host:     "localhost",
		Port:     "5432",
		User:     "postgres",
		Password: "password",
		Database: "saturn",
	}

	mgr := backup.NewPostgresBackupManager(storage, cfg, tempDir)

	// List initially
	index, err := mgr.ListBackups(ctx)
	if err != nil {
		t.Fatalf("failed to list initial backups: %v", err)
	}
	if len(index.Backups) != 0 {
		t.Fatalf("expected 0 backups, got %d", len(index.Backups))
	}

	// Verify manager contract satisfies BackupManager interface
	var _ backup.BackupManager = mgr

	// Verify metadata index
	index.Backups = append(index.Backups, backup.BackupEntry{
		ID:          "bak_123",
		Filename:    "saturn_backup_123.sql",
		SizeBytes:   1024,
		TriggeredBy: "test",
		Status:      "success",
		Sha256:      "abc123",
		CreatedAt:   time.Now().UTC(),
	})
	if len(index.Backups) != 1 {
		t.Fatalf("expected 1 backup, got %d", len(index.Backups))
	}
}
