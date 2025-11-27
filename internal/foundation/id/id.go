// Package id provides functionality to generate ids
package id

import (
	"errors"
	"sync"
)

// Generator defines the contract for ID mechanics.
type Generator interface {
	NewID() (string, error)
	Validate(string) error
}

var (
	// Default to a panic generator. This forces you to wire it up in main.go,
	// ensuring you never accidentally run without a configured ID strategy.
	globalGen Generator = &panicGenerator{}
	mu        sync.RWMutex
)

// SetGenerator is the "One and Forget" configuration point.
func SetGenerator(g Generator) {
	mu.Lock()
	defer mu.Unlock()
	globalGen = g
}

func New[T ~string]() (T, error) {
	mu.RLock()
	defer mu.RUnlock()

	// Delegates purely to the injected implementation
	val, err := globalGen.NewID()
	if err != nil {
		return "", err
	}
	return T(val), nil
}

func Validate[T ~string](id T) error {
	mu.RLock()
	defer mu.RUnlock()

	if id == "" {
		return errors.New("id is empty")
	}

	// Delegates purely to the injected implementation
	return globalGen.Validate(string(id))
}

type panicGenerator struct{}

func (p *panicGenerator) NewID() (string, error) {
	panic("id generator not configured: call id.SetGenerator() in main.go")
}

func (p *panicGenerator) Validate(s string) error {
	panic("id generator not configured: call id.SetGenerator() in main.go")
}
