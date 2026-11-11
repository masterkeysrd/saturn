package backup

import (
	"context"
	"io"
	"os"
	"path/filepath"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// LocalStorage implements Storage for the local filesystem.
type LocalStorage struct {
	dir string
}

// NewLocalStorage creates a new LocalStorage.
func NewLocalStorage(dir string) (*LocalStorage, error) {
	const op errors.Op = "platform/backup.NewLocalStorage"

	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, errors.E(op, err)
	}
	return &LocalStorage{dir: dir}, nil
}

// Upload writes a stream atomically to a file via a temporary file in the target directory.
func (l *LocalStorage) Upload(ctx context.Context, key string, reader io.Reader) error {
	const op errors.Op = "platform/backup.LocalStorage.Upload"

	path := filepath.Join(l.dir, key)
	dir := filepath.Dir(path)

	// Create directory structure if needed
	if err := os.MkdirAll(dir, 0755); err != nil {
		return errors.E(op, err)
	}

	tmpFile, err := os.CreateTemp(dir, ".upload-*")
	if err != nil {
		return errors.E(op, err)
	}
	tmpPath := tmpFile.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmpPath)
		}
	}()

	if _, err := io.Copy(tmpFile, reader); err != nil {
		_ = tmpFile.Close()
		return errors.E(op, err)
	}
	if err := tmpFile.Chmod(0644); err != nil {
		_ = tmpFile.Close()
		return errors.E(op, err)
	}
	if err := tmpFile.Close(); err != nil {
		return errors.E(op, err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return errors.E(op, err)
	}

	cleanup = false
	return nil
}

// Download reads a file and writes to writer.
func (l *LocalStorage) Download(ctx context.Context, key string, writer io.Writer) error {
	const op errors.Op = "platform/backup.LocalStorage.Download"

	path := filepath.Join(l.dir, key)
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return errors.E(op, errors.NotExist, err)
		}
		return errors.E(op, err)
	}
	defer func() { _ = f.Close() }()

	_, err = io.Copy(writer, f)
	if err != nil {
		return errors.E(op, err)
	}
	return nil
}

// Delete removes a file.
func (l *LocalStorage) Delete(ctx context.Context, key string) error {
	const op errors.Op = "platform/backup.LocalStorage.Delete"

	path := filepath.Join(l.dir, key)
	err := os.Remove(path)
	if err != nil && !os.IsNotExist(err) {
		return errors.E(op, err)
	}
	return nil
}
