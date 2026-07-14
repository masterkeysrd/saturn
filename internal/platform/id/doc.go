// Package id provides a pluggable ID generation system backed by KSUID.
//
// The package exposes a Generator interface with Generate and Validate methods,
// a global Default generator initialized via sync/atomic.Value, and top-level
// convenience functions (Generate, Validate) that delegate to the default.
//
// Use SetDefault to inject a custom generator — ideal for deterministic testing.
package id
