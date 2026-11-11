package backup

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json/jsontext"
	"encoding/json/v2"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/log"
)

const defaultBackupTimeout = 15 * time.Minute

// Storage defines the interface for uploading, downloading, and deleting files.
//
// @Mock
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
//
// @Mock
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

type dumpRunnerFunc func(ctx context.Context, cfg PostgresConfig, stdout, stderr io.Writer) error

// PostgresBackupManager implements BackupManager using pg_dump.
type PostgresBackupManager struct {
	storage     Storage
	config      PostgresConfig
	localIndex  string // Path to local backups.json
	remoteIndex string // Name of index file in storage (e.g. backups.json)
	timeout     time.Duration
	dumpFunc    dumpRunnerFunc
	mu          sync.Mutex
}

// NewPostgresBackupManager creates a new PostgresBackupManager.
func NewPostgresBackupManager(storage Storage, config PostgresConfig, localIndexDir string) *PostgresBackupManager {
	return &PostgresBackupManager{
		storage:     storage,
		config:      config,
		localIndex:  localIndexDir + "/backups.json",
		remoteIndex: "backups.json",
		timeout:     defaultBackupTimeout,
		dumpFunc:    defaultPgDump,
	}
}

func defaultPgDump(ctx context.Context, cfg PostgresConfig, stdout, stderr io.Writer) error {
	cmd := exec.CommandContext(ctx, "pg_dump",
		"-h", cfg.Host,
		"-p", cfg.Port,
		"-U", cfg.User,
		"-d", cfg.Database,
	)
	cmd.Env = append(os.Environ(),
		"PGPASSWORD="+cfg.Password,
		"PGAPPNAME=saturn-backup",
	)
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	cmd.WaitDelay = 5 * time.Second
	return cmd.Run()
}

// RunBackup streams pg_dump output to storage and updates the metadata index.
func (pm *PostgresBackupManager) RunBackup(ctx context.Context, triggeredBy string) (*BackupEntry, error) {
	const op errors.Op = "platform/backup.RunBackup"

	pm.mu.Lock()
	defer pm.mu.Unlock()

	log.Info(ctx, "database backup started",
		log.String("triggered_by", triggeredBy),
		log.String("database", pm.config.Database),
		log.String("host", pm.config.Host),
	)

	timeout := pm.timeout
	if timeout <= 0 {
		timeout = defaultBackupTimeout
	}
	backupCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	dumpFn := pm.dumpFunc
	if dumpFn == nil {
		dumpFn = defaultPgDump
	}

	timestamp := time.Now().UTC().Format("20060102_150405")
	filename := fmt.Sprintf("saturn_backup_%s.sql", timestamp)

	// Create unidirectional data pipe
	pr, pw := io.Pipe()

	// Track size and hash on the fly
	hash := sha256.New()
	sizeTracker := &countingWriter{w: hash}
	tee := io.TeeReader(pr, sizeTracker)

	doneCh := make(chan error, 1)
	go func() {
		var errBuf bytes.Buffer
		var runErr error
		if err := dumpFn(backupCtx, pm.config, pw, &errBuf); err != nil {
			runErr = fmt.Errorf("pg_dump error: %w, stderr: %s", err, strings.TrimSpace(errBuf.String()))
			log.Error(backupCtx, "database backup pg_dump failed",
				log.String("database", pm.config.Database),
				log.Err(runErr),
			)
		}
		// Propagate any pg_dump failure to the pipe reader so storage.Upload
		// aborts rather than persisting a truncated backup as successful.
		_ = pw.CloseWithError(runErr)
		doneCh <- runErr
	}()

	// Stream upload to storage
	uploadErr := pm.storage.Upload(backupCtx, filename, tee)
	if uploadErr != nil {
		// Unblock any pending pipe writes and terminate pg_dump immediately.
		_ = pr.CloseWithError(uploadErr)
		cancel()
	} else {
		_ = pr.Close()
	}

	// Always wait for the pg_dump goroutine/process to exit before returning
	// or releasing pm.mu so child processes and DB connections cannot leak.
	cmdErr := <-doneCh

	if uploadErr != nil && cmdErr != nil {
		if errors.Is(uploadErr, cmdErr) {
			return nil, errors.E(op, errors.Internal, cmdErr)
		}
		log.Error(ctx, "database backup upload failed",
			log.String("filename", filename),
			log.Err(uploadErr),
		)
		return nil, errors.E(op, errors.Internal, fmt.Errorf("storage upload failed: %w", uploadErr))
	}
	if cmdErr != nil {
		return nil, errors.E(op, errors.Internal, cmdErr)
	}
	if uploadErr != nil {
		log.Error(ctx, "database backup upload failed",
			log.String("filename", filename),
			log.Err(uploadErr),
		)
		return nil, errors.E(op, errors.Internal, fmt.Errorf("storage upload failed: %w", uploadErr))
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

	log.Info(ctx, "database backup completed successfully",
		log.String("id", entry.ID),
		log.String("filename", filename),
		log.Int64("size_bytes", size),
		log.String("sha256", checksum),
		log.String("triggered_by", triggeredBy),
	)

	// Sync metadata index
	if err := pm.syncIndex(ctx, entry); err != nil {
		log.Error(ctx, "failed to sync backup index", log.Err(err))
	}

	return &entry, nil
}

// syncIndex reads the index file, appends the new entry, prunes old backups, and uploads back.
func (pm *PostgresBackupManager) syncIndex(ctx context.Context, newEntry BackupEntry) error {
	const op errors.Op = "platform/backup.syncIndex"

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
			log.Info(ctx, "pruning expired backup", log.String("filename", b.Filename))
			// Delete from storage
			if err := pm.storage.Delete(ctx, b.Filename); err != nil {
				log.Warn(ctx, "failed to delete expired backup from storage", log.String("filename", b.Filename), log.Err(err))
			}
		} else {
			activeBackups = append(activeBackups, b)
		}
	}
	index.Backups = activeBackups

	// Serialize index
	indexData, err := json.Marshal(index, jsontext.WithIndent("  "))
	if err != nil {
		return errors.E(op, errors.Internal, err)
	}

	// Save index locally
	if err := os.WriteFile(pm.localIndex, indexData, 0644); err != nil {
		log.Warn(ctx, "failed to write local backup index", log.String("path", pm.localIndex), log.Err(err))
	}

	// Upload index to remote storage
	if err := pm.storage.Upload(ctx, pm.remoteIndex, bytes.NewReader(indexData)); err != nil {
		return errors.E(op, errors.Internal, fmt.Errorf("remote index sync failed: %w", err))
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
