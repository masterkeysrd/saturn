package uuid

import (
	"errors"
	"fmt"

	"github.com/google/uuid"
)

// New generates a new UUID.
func New() (string, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return "", fmt.Errorf("could not generate new UUID: %w", err)
	}

	return id.String(), nil
}

func Validate[T ~string](id T) error {
	s := string(id)
	if s == "" {
		return errors.New("id is empty")
	}

	if len(s) != 36 {
		return errors.New("id is not a valid UUID")
	}

	if string(s) == uuid.Nil.String() {
		return errors.New("id is nil UUID")
	}

	if err := uuid.Validate(s); err != nil {
		return fmt.Errorf("id is not a valid UUID: %w", err)
	}

	return nil
}
