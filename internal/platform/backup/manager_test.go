package backup

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json/v2"
	stderrors "errors"
	"io"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestPostgresBackupManager_RunBackup(t *testing.T) {
	testCfg := PostgresConfig{
		Host:     "saturn-db",
		Port:     "5432",
		User:     "saturn_prod",
		Password: "secret",
		Database: "saturn_prod",
	}

	t.Run("upload failure unblocks large pipe write and terminates dump without leaking", func(t *testing.T) {
		tempDir := t.TempDir()
		var dumpExited atomic.Bool

		storage := &StorageMock{
			UploadFunc: func(ctx context.Context, key string, reader io.Reader) error {
				// Mirror the exact AWS S3 PutObject regression: fail immediately
				// without reading or closing reader!
				return stderrors.New("unseekable stream rejected by PutObject")
			},
		}

		mgr := NewPostgresBackupManager(storage, testCfg, tempDir)
		mgr.dumpFunc = func(ctx context.Context, cfg PostgresConfig, stdout, stderr io.Writer) error {
			defer dumpExited.Store(true)

			// Write 2 MiB (> 64 KiB OS pipe buffer) so stdout.Write would block
			// forever if RunBackup failed to close the pipe reader.
			chunk := bytes.Repeat([]byte("COPY finance.statement TO stdout;\n"), 1024)
			for range 64 {
				if _, err := stdout.Write(chunk); err != nil {
					return err
				}
			}

			// Even if writes succeeded, block until context is canceled.
			<-ctx.Done()
			return ctx.Err()
		}

		done := make(chan error, 1)
		go func() {
			_, err := mgr.RunBackup(context.Background(), "scheduler")
			done <- err
		}()

		select {
		case err := <-done:
			if err == nil {
				t.Fatal("expected error from RunBackup when Upload fails, got nil")
			}
			if !errors.Is(err, errors.Internal) {
				t.Errorf("expected errors.Internal, got %v", err)
			}
			if !strings.Contains(err.Error(), "storage upload failed") {
				t.Errorf("expected storage upload failure message, got %v", err)
			}
			if !dumpExited.Load() {
				t.Fatal("expected dump goroutine to have exited before RunBackup returned")
			}
		case <-time.After(2 * time.Second):
			t.Fatal("RunBackup deadlocked when Storage.Upload returned early without draining pipe")
		}
	})

	t.Run("pg_dump failure mid-stream aborts upload so partial dump is not stored", func(t *testing.T) {
		tempDir := t.TempDir()
		storedObjects := make(map[string][]byte)

		storage := &StorageMock{
			UploadFunc: func(ctx context.Context, key string, reader io.Reader) error {
				data, err := io.ReadAll(reader)
				if err != nil {
					return errors.E(errors.Op("mock.Upload"), err)
				}
				storedObjects[key] = data
				return nil
			},
		}

		mgr := NewPostgresBackupManager(storage, testCfg, tempDir)
		mgr.dumpFunc = func(ctx context.Context, cfg PostgresConfig, stdout, stderr io.Writer) error {
			_, _ = stdout.Write([]byte("-- partial SQL header\n"))
			_, _ = stderr.Write([]byte("pg_dump: error: connection to server was lost"))
			return stderrors.New("exit status 1")
		}

		entry, err := mgr.RunBackup(context.Background(), "scheduler")
		if err == nil {
			t.Fatalf("expected error when pg_dump fails, got entry %+v", entry)
		}
		if !strings.Contains(err.Error(), "pg_dump error") {
			t.Errorf("expected pg_dump error details, got %v", err)
		}
		if len(storedObjects) != 0 {
			t.Fatalf("expected 0 stored objects on failed pg_dump, got %d", len(storedObjects))
		}
	})

	t.Run("backup timeout cancels hung pg_dump process", func(t *testing.T) {
		tempDir := t.TempDir()

		storage := &StorageMock{
			UploadFunc: func(ctx context.Context, key string, reader io.Reader) error {
				_, err := io.ReadAll(reader)
				return err
			},
		}

		mgr := NewPostgresBackupManager(storage, testCfg, tempDir)
		mgr.timeout = 50 * time.Millisecond
		mgr.dumpFunc = func(ctx context.Context, cfg PostgresConfig, stdout, stderr io.Writer) error {
			<-ctx.Done()
			return ctx.Err()
		}

		_, err := mgr.RunBackup(context.Background(), "scheduler")
		if err == nil {
			t.Fatal("expected timeout error from hung dumpFunc, got nil")
		}
	})

	t.Run("successful backup streams SQL, computes sha256, syncs index, and prunes expired snapshots", func(t *testing.T) {
		tempDir := t.TempDir()
		sqlPayload := []byte("-- PostgreSQL dump\nCREATE TABLE test (id int);\n")
		wantSum := sha256.Sum256(sqlPayload)
		wantHex := hex.EncodeToString(wantSum[:])

		// Seed local backups.json with one expired (40 days old) and one recent backup.
		seedIndex := MetadataIndex{
			LastUpdated: time.Now().UTC().Add(-24 * time.Hour),
			Backups: []BackupEntry{
				{
					ID:        "bak_expired",
					Filename:  "saturn_backup_expired.sql",
					CreatedAt: time.Now().UTC().AddDate(0, 0, -40),
				},
				{
					ID:        "bak_recent",
					Filename:  "saturn_backup_recent.sql",
					CreatedAt: time.Now().UTC().AddDate(0, 0, -5),
				},
			},
		}
		seedBytes, err := json.Marshal(seedIndex)
		if err != nil {
			t.Fatalf("failed to marshal seed index: %v", err)
		}
		if err := os.WriteFile(tempDir+"/backups.json", seedBytes, 0644); err != nil {
			t.Fatalf("failed to write seed index: %v", err)
		}

		uploaded := make(map[string][]byte)
		var deleted []string

		storage := &StorageMock{
			UploadFunc: func(ctx context.Context, key string, reader io.Reader) error {
				data, readErr := io.ReadAll(reader)
				if readErr != nil {
					return readErr
				}
				uploaded[key] = data
				return nil
			},
			DeleteFunc: func(ctx context.Context, key string) error {
				deleted = append(deleted, key)
				return nil
			},
		}

		mgr := NewPostgresBackupManager(storage, testCfg, tempDir)
		mgr.dumpFunc = func(ctx context.Context, cfg PostgresConfig, stdout, stderr io.Writer) error {
			_, writeErr := stdout.Write(sqlPayload)
			return writeErr
		}

		entry, err := mgr.RunBackup(context.Background(), "manual")
		if err != nil {
			t.Fatalf("RunBackup() unexpected error: %v", err)
		}

		if entry.SizeBytes != int64(len(sqlPayload)) {
			t.Errorf("entry.SizeBytes = %d, want %d", entry.SizeBytes, len(sqlPayload))
		}
		if entry.Sha256 != wantHex {
			t.Errorf("entry.Sha256 = %q, want %q", entry.Sha256, wantHex)
		}
		if !bytes.Equal(uploaded[entry.Filename], sqlPayload) {
			t.Errorf("uploaded SQL payload mismatch")
		}
		if len(deleted) != 1 || deleted[0] != "saturn_backup_expired.sql" {
			t.Errorf("deleted backups = %v, want [saturn_backup_expired.sql]", deleted)
		}

		index, err := mgr.ListBackups(context.Background())
		if err != nil {
			t.Fatalf("ListBackups() unexpected error: %v", err)
		}
		if len(index.Backups) != 2 {
			t.Fatalf("len(index.Backups) = %d, want 2 (recent + new)", len(index.Backups))
		}
	})
}
