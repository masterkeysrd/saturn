package backup

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"sync"
	"time"
)

// Storage defines the interface for uploading, downloading, and deleting files.
type Storage interface {
	Upload(ctx context.Context, key string, reader io.Reader) error
	Download(ctx context.Context, key string, writer io.Writer) error
	Delete(ctx context.Context, key string) error
}

// BackupMetadata holds metadata information for a backup snapshot.
type BackupEntry struct {
	ID          string    `json:"id"`
	Filename    string    `json:"filename"`
	SizeBytes   int64     `json:"size_bytes"`
	TriggeredBy string    `json:"triggered_by"`
	Status      string    `json:"status"`
	Sha256      string    `json:"sha256"`
	CreatedAt   time.Time `json:"created_at"`
}

// MetadataIndex represents the backups.json index file structure.
type MetadataIndex struct {
	LastUpdated time.Time     `json:"last_updated"`
	Backups     []BackupEntry `json:"backups"`
}

// BackupManager defines the contract for taking a database backup.
type BackupManager interface {
	RunBackup(ctx context.Context, triggeredBy string) (*BackupEntry, error)
	ListBackups(ctx context.Context) (*MetadataIndex, error)
}

// PostgresConfig holds credentials for running postgres commands.
type PostgresConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Database string
}

// PostgresBackupManager implements BackupManager using pg_dump.
type PostgresBackupManager struct {
	storage     Storage
	config      PostgresConfig
	localIndex  string // Path to local backups.json
	remoteIndex string // Name of index file in storage (e.g. backups.json)
	mu          sync.Mutex
}

// NewPostgresBackupManager creates a new PostgresBackupManager.
func NewPostgresBackupManager(storage Storage, config PostgresConfig, localIndexDir string) *PostgresBackupManager {
	return &PostgresBackupManager{
		storage:     storage,
		config:      config,
		localIndex:  localIndexDir + "/backups.json",
		remoteIndex: "backups.json",
	}
}

// RunBackup streams pg_dump output to storage, compresses it, and updates metadata index.
func (pm *PostgresBackupManager) RunBackup(ctx context.Context, triggeredBy string) (*BackupEntry, error) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	timestamp := time.Now().UTC().Format("20060102_150405")
	filename := fmt.Sprintf("saturn_backup_%s.sql", timestamp)

	// Create unidirectional data pipe
	pr, pw := io.Pipe()

	// Track size and hash on the fly
	hash := sha256.New()
	sizeTracker := &countingWriter{w: hash}
	tee := io.TeeReader(pr, sizeTracker)

	var cmdErr error
	go func() {
		defer pw.Close()

		// Execute pg_dump command
		cmd := exec.CommandContext(ctx, "pg_dump",
			"-h", pm.config.Host,
			"-p", pm.config.Port,
			"-U", pm.config.User,
			"-d", pm.config.Database,
		)
		cmd.Env = append(os.Environ(), "PGPASSWORD="+pm.config.Password)
		cmd.Stdout = pw // write stdout directly to pipe writer

		var errBuf bytes.Buffer
		cmd.Stderr = &errBuf

		if err := cmd.Run(); err != nil {
			cmdErr = fmt.Errorf("pg_dump error: %v, stderr: %s", err, errBuf.String())
			slog.Error("pg_dump failed", "err", cmdErr)
		}
	}()

	// Stream upload to storage
	uploadErr := pm.storage.Upload(ctx, filename, tee)

	if cmdErr != nil {
		return nil, cmdErr
	}
	if uploadErr != nil {
		return nil, fmt.Errorf("storage upload failed: %w", uploadErr)
	}

	checksum := hex.EncodeToString(hash.Sum(nil))
	size := sizeTracker.count

	entry := BackupEntry{
		ID:          "bak_" + timestamp,
		Filename:    filename,
		SizeBytes:   size,
		TriggeredBy: triggeredBy,
		Status:      "success",
		Sha256:      checksum,
		CreatedAt:   time.Now().UTC(),
	}

	// Sync metadata index
	if err := pm.syncIndex(ctx, entry); err != nil {
		slog.Error("failed to sync backup index", "err", err)
	}

	return &entry, nil
}

// syncIndex reads the index file, appends the new entry, prunes old backups, and uploads back.
func (pm *PostgresBackupManager) syncIndex(ctx context.Context, newEntry BackupEntry) error {
	var index MetadataIndex

	// Try reading local index first
	data, err := os.ReadFile(pm.localIndex)
	if err == nil {
		_ = json.Unmarshal(data, &index)
	} else {
		// If not found locally, try downloading from storage
		var buf bytes.Buffer
		if err := pm.storage.Download(ctx, pm.remoteIndex, &buf); err == nil {
			_ = json.Unmarshal(buf.Bytes(), &index)
		}
	}

	// Append new backup
	index.Backups = append(index.Backups, newEntry)
	index.LastUpdated = time.Now().UTC()

	// Apply 30-day retention pruning
	var activeBackups []BackupEntry
	cutoff := time.Now().UTC().AddDate(0, 0, -30)

	for _, b := range index.Backups {
		if b.CreatedAt.Before(cutoff) {
			slog.Info("pruning expired backup", "filename", b.Filename)
			// Delete from storage
			if err := pm.storage.Delete(ctx, b.Filename); err != nil {
				slog.Warn("failed to delete expired backup from storage", "filename", b.Filename, "err", err)
			}
		} else {
			activeBackups = append(activeBackups, b)
		}
	}
	index.Backups = activeBackups

	// Serialize index
	indexData, err := json.MarshalIndent(index, "", "  ")
	if err != nil {
		return err
	}

	// Save index locally
	if err := os.WriteFile(pm.localIndex, indexData, 0644); err != nil {
		slog.Warn("failed to write local backup index", "path", pm.localIndex, "err", err)
	}

	// Upload index to remote storage
	if err := pm.storage.Upload(ctx, pm.remoteIndex, bytes.NewReader(indexData)); err != nil {
		return fmt.Errorf("remote index sync failed: %w", err)
	}

	return nil
}

// ListBackups reads local or remote backups.json metadata index file.
func (pm *PostgresBackupManager) ListBackups(ctx context.Context) (*MetadataIndex, error) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	var index MetadataIndex

	// Try reading local index first
	data, err := os.ReadFile(pm.localIndex)
	if err == nil {
		if err := json.Unmarshal(data, &index); err == nil {
			return &index, nil
		}
	}

	// Try downloading remote index from storage
	var buf bytes.Buffer
	if err := pm.storage.Download(ctx, pm.remoteIndex, &buf); err == nil {
		if err := json.Unmarshal(buf.Bytes(), &index); err == nil {
			// Write local copy to cache
			_ = os.WriteFile(pm.localIndex, buf.Bytes(), 0644)
			return &index, nil
		}
	}

	// If not found anywhere, return empty index
	return &MetadataIndex{
		LastUpdated: time.Time{},
		Backups:     []BackupEntry{},
	}, nil
}

// countingWriter tracks bytes written to calculate size on the fly
type countingWriter struct {
	w     io.Writer
	count int64
}

func (cw *countingWriter) Write(p []byte) (n int, err error) {
	n, err = cw.w.Write(p)
	cw.count += int64(n)
	return n, err
}
