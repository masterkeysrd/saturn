package errors

import (
	"database/sql"
	"errors"
)

func IsNotExists(err error) bool {
	return errors.Is(err, sql.ErrNoRows)
}
