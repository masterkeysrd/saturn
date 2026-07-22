package backup

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// LocalStorage implements Storage for the local filesystem.
type LocalStorage struct {
	dir string
}

// NewLocalStorage creates a new LocalStorage.
func NewLocalStorage(dir string) (*LocalStorage, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("create backup directory: %w", err)
	}
	return &LocalStorage{dir: dir}, nil
}

// Upload writes a stream to a file.
func (l *LocalStorage) Upload(ctx context.Context, key string, reader io.Reader) error {
	path := filepath.Join(l.dir, key)

	// Create directory structure if needed
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}

	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = io.Copy(f, reader)
	return err
}

// Download reads a file and writes to writer.
func (l *LocalStorage) Download(ctx context.Context, key string, writer io.Writer) error {
	path := filepath.Join(l.dir, key)
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = io.Copy(writer, f)
	return err
}

// Delete removes a file.
func (l *LocalStorage) Delete(ctx context.Context, key string) error {
	path := filepath.Join(l.dir, key)
	err := os.Remove(path)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
