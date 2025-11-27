// Package uuid provides a implementation for id generation on the foundation layer.
package uuid

import (
	"errors"
	"fmt"

	"github.com/google/uuid"
)

type Generator struct{}

func NewGenerator() *Generator {
	return &Generator{}
}

func (g *Generator) NewID() (string, error) {
	uid, err := uuid.NewV7()
	if err != nil {
		return "", fmt.Errorf("cannot generate uuid v7: %w", err)
	}
	return uid.String(), nil
}

func (g *Generator) Validate(id string) error {
	if id == "" {
		return errors.New("id is empty")
	}

	uid, err := uuid.Parse(id)
	if err != nil {
		return fmt.Errorf("invalid uuid format '%s': %w", id, err)
	}

	if uid == uuid.Nil {
		return errors.New("uuid cannot be nil (0000...)")
	}

	return nil
}
