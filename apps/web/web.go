package web

import (
	"embed"
	"io/fs"
)

//go:embed dist
var distFS embed.FS

// GetUIFS returns a sub-filesystem pointing directly to the dist folder.
// This allows Go to serve Vite assets directly from memory.
func GetUIFS() fs.FS {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic(err)
	}
	return sub
}
