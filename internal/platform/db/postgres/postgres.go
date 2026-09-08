package postgres

import (
	"fmt"
	"strings"

	"github.com/lib/pq"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func init() {
	db.RegisterTranslator("postgres", TranslateError)
}

// TranslateError translates pq.Error instances into Saturn platform errors.
// Returns nil if the error is not recognized as a Postgres driver error.
func TranslateError(err error) error {
	var pqErr *pq.Error
	if !errors.As(err, &pqErr) {
		return nil
	}

	meta := errors.Meta{
		"table":      pqErr.Table,
		"constraint": pqErr.Constraint,
		"column":     pqErr.Column,
		"detail":     pqErr.Detail,
	}
	for k, v := range meta {
		if v == "" {
			delete(meta, k)
		}
	}

	switch pqErr.Code {
	case "23505": // unique_violation
		msg := "record already exists"
		if pqErr.Detail != "" {
			msg = pqErr.Detail
		}
		return errors.E(errors.Exist, meta, msg)
	case "23503": // foreign_key_violation
		msg := "foreign key constraint violation"
		if pqErr.Detail != "" {
			msg = pqErr.Detail
		}
		return errors.E(errors.Invalid, meta, msg)
	case "23502": // not_null_violation
		return errors.E(errors.Invalid, meta, fmt.Sprintf("column %q cannot be null", pqErr.Column))
	case "23514": // check_violation
		return errors.E(errors.Invalid, meta, fmt.Sprintf("check constraint %q violated", pqErr.Constraint))
	case "40001": // serialization_failure
		return errors.E(errors.Conflict, meta, "transaction serialization failure, retryable")
	case "40P01": // deadlock_detected
		return errors.E(errors.Conflict, meta, "deadlock detected, retryable")
	case "57014": // query_canceled / statement_timeout
		return errors.E(errors.Unavailable, meta, "query canceled or timed out")
	}

	if strings.HasPrefix(string(pqErr.Code), "08") {
		return errors.E(errors.Unavailable, meta, "database connection error")
	}

	return errors.E(errors.Internal, meta, pqErr.Message)
}
