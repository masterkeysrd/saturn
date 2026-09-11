//go:build integration

package driver

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/masterkeysrd/saturn/apis/saturn"
	backupv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/backup/v1"
)

// BackupDriver provides driver actions for database backups.
type BackupDriver struct {
	driver *Driver
}

// TriggerBackupOptions specifies options for triggering a manual database backup.
type TriggerBackupOptions struct {
	Token           string
	Unauthenticated bool
}

// ListBackupsOptions specifies options for listing database backups.
type ListBackupsOptions struct {
	Token           string
	Unauthenticated bool
}

// VerifyBackupOptions specifies options for verifying a backup file on disk.
type VerifyBackupOptions struct {
	Entry *backupv1.BackupEntry
}

// GetBackupContentOptions specifies options for retrieving backup file content.
type GetBackupContentOptions struct {
	Filename string
}

func (b *BackupDriver) client(tb testing.TB, token string, unauthenticated bool) *backupv1.Client {
	tb.Helper()
	if unauthenticated {
		return backupv1.NewClient(saturn.Config{
			BaseURL:    b.driver.env.ServerURL,
			HTTPClient: b.driver.httpClient,
		})
	}
	if token == "" {
		token = b.driver.env.getAdminToken(tb)
	}
	return backupv1.NewClient(saturn.Config{
		BaseURL:     b.driver.env.ServerURL,
		AccessToken: token,
		HTTPClient:  b.driver.httpClient,
	})
}

// TriggerBackup initiates a manual backup run.
func (b *BackupDriver) TriggerBackup(tb testing.TB, opts TriggerBackupOptions) (*backupv1.BackupEntry, error) {
	tb.Helper()
	client := b.client(tb, opts.Token, opts.Unauthenticated)
	resp, err := client.TriggerBackup(tb.Context(), &backupv1.TriggerBackupRequest{})
	if err != nil {
		return nil, err
	}
	return resp.GetBackup(), nil
}

// ListBackups retrieves the database backup index.
func (b *BackupDriver) ListBackups(tb testing.TB, opts ListBackupsOptions) (*backupv1.ListBackupsResponse, error) {
	tb.Helper()
	client := b.client(tb, opts.Token, opts.Unauthenticated)
	return client.ListBackups(tb.Context(), &backupv1.ListBackupsRequest{})
}

// BackupDir returns the local directory where backup snapshots and index are stored.
func (b *BackupDriver) BackupDir() string {
	return b.driver.env.BackupDir
}

// VerifyBackup verifies that the backup file exists on disk, matches size, and has correct sha256 checksum.
func (b *BackupDriver) VerifyBackup(tb testing.TB, opts VerifyBackupOptions) error {
	tb.Helper()
	if opts.Entry == nil {
		return fmt.Errorf("verify backup: entry is nil")
	}

	filePath := filepath.Join(b.BackupDir(), opts.Entry.GetFilename())
	info, err := os.Stat(filePath)
	if err != nil {
		return fmt.Errorf("verify backup file exists: %w", err)
	}

	if info.Size() != opts.Entry.GetSizeBytes() {
		return fmt.Errorf("backup file size mismatch: got %d, want %d", info.Size(), opts.Entry.GetSizeBytes())
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("read backup file: %w", err)
	}

	hash := sha256.Sum256(data)
	actualHash := hex.EncodeToString(hash[:])
	if actualHash != opts.Entry.GetSha256() {
		return fmt.Errorf("backup sha256 checksum mismatch: got %s, want %s", actualHash, opts.Entry.GetSha256())
	}

	return nil
}

// GetBackupContent reads and returns the raw content of a backup file from storage.
func (b *BackupDriver) GetBackupContent(tb testing.TB, opts GetBackupContentOptions) ([]byte, error) {
	tb.Helper()
	filePath := filepath.Join(b.BackupDir(), opts.Filename)
	return os.ReadFile(filePath)
}
