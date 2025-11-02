package id

import (
	"errors"
	"fmt"

	"github.com/google/uuid"
)

func New[T ~string]() (T, error) {
	uid, err := uuid.NewV7()
	if err != nil {
		return "", fmt.Errorf("cannot generate new uuid: %w", err)
	}

	return T(uid.String()), nil
}

func Validate[T ~string](id T) error {
	if id == "" {
		return errors.New("id is empty")
	}

	uid, err := uuid.Parse(string(id))
	if err != nil {
		return fmt.Errorf("cannot parse uuid: %w", err)
	}

	if uid == uuid.Nil {
		return fmt.Errorf("uuid is nil")
	}

	return nil
}
