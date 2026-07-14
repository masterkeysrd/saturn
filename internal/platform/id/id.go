package id

import (
	"fmt"
	"sync/atomic"

	"github.com/segmentio/ksuid"
)

// Generator defines the interface for generating and validating IDs.
type Generator interface {
	// Generate creates a new KSUID with the given prefix.
	// The prefix is embedded in the returned string for identification.
	Generate(prefix string) (string, error)

	// Validate checks if the given ID is a valid KSUID with the expected prefix.
	Validate(id, prefix string) error
}

// Default is the global default ID generator.
// Set it to a custom implementation in tests for deterministic ID generation.
var Default atomic.Value

func init() {
	Default.Store(NewDefaultGenerator())
}

// NewDefaultGenerator returns the default KSUID-based ID generator.
func NewDefaultGenerator() Generator {
	return &defaultGenerator{}
}

// SetDefault replaces the global default ID generator.
// Typically used in tests to inject a deterministic generator.
func SetDefault(gen Generator) {
	Default.Store(gen)
}

// GetDefault returns the current default ID generator.
func GetDefault() Generator {
	gen, _ := Default.Load().(Generator)
	if gen == nil {
		return NewDefaultGenerator()
	}
	return gen
}

// Generate creates a new KSUID with the given prefix using the default generator.
func Generate(prefix string) (string, error) {
	return GetDefault().Generate(prefix)
}

// Validate checks that the ID is a valid KSUID with the expected prefix using the default generator.
func Validate(id, prefix string) error {
	return GetDefault().Validate(id, prefix)
}

// defaultGenerator implements Generator using KSUID.
type defaultGenerator struct{}

// Generate creates a new KSUID and prefixes it with the given prefix.
func (g *defaultGenerator) Generate(prefix string) (string, error) {
	id := ksuid.New().String()
	return prefix + id, nil
}

// Validate checks that the ID is a valid KSUID with the expected prefix.
func (g *defaultGenerator) Validate(id, prefix string) error {
	if len(id) <= len(prefix) {
		return fmt.Errorf("invalid ID: too short for prefix %q", prefix)
	}
	if id[:len(prefix)] != prefix {
		return fmt.Errorf("invalid ID: expected prefix %q, got %q", prefix, id[:len(prefix)])
	}
	_, err := ksuid.Parse(id[len(prefix):])
	if err != nil {
		return fmt.Errorf("invalid ID: not a valid KSUID")
	}
	return nil
}
