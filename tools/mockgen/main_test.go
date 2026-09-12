package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestProcessDir(t *testing.T) {
	tempDir := t.TempDir()
	sourceCode := `package sample

import "context"

// Worker does tasks.
// @Mock
type Worker interface {
	Do(ctx context.Context) error
}
`
	err := os.WriteFile(filepath.Join(tempDir, "worker.go"), []byte(sourceCode), 0644)
	require.NoError(t, err)

	count, err := processDir(tempDir, "@Mock", "mocks_test.go")
	require.NoError(t, err)
	assert.Equal(t, 1, count)

	mockFile := filepath.Join(tempDir, "mocks_test.go")
	assert.FileExists(t, mockFile)

	content, err := os.ReadFile(mockFile)
	require.NoError(t, err)
	assert.Contains(t, string(content), "WorkerMock")
}

func TestProcessRecursive(t *testing.T) {
	tempDir := t.TempDir()
	subDir := filepath.Join(tempDir, "sub")
	require.NoError(t, os.MkdirAll(subDir, 0755))

	sourceCode := `package sub

// Runner runs.
// @Mock
type Runner interface {
	Run()
}
`
	err := os.WriteFile(filepath.Join(subDir, "runner.go"), []byte(sourceCode), 0644)
	require.NoError(t, err)

	err = processRecursive(tempDir, "@Mock", "mocks_test.go")
	require.NoError(t, err)

	mockFile := filepath.Join(subDir, "mocks_test.go")
	assert.FileExists(t, mockFile)
}
