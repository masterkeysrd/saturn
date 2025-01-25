//go:build tools
// +build tools

// To install everything from this file, run:
// go generate -tags tools tools/tools.go
package main

import (
	_ "github.com/air-verse/air"
	_ "github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen"
)
