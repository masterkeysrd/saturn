package errors

import (
	"database/sql"
	"errors"
)

func New(text string) error {
	return errors.New(text)
}

func IsNotExists(err error) bool {
	return errors.Is(err, sql.ErrNoRows)
}
