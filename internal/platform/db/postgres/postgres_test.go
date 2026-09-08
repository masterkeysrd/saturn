package postgres

import (
	"errors"
	"testing"

	"github.com/lib/pq"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	platErr "github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestPostgresRegistration(t *testing.T) {
	translator := db.LookupTranslator("postgres")
	if translator == nil {
		t.Fatal("expected postgres translator to be registered, got nil")
	}
}

func TestTranslateError(t *testing.T) {
	t.Run("non-pq error returns nil", func(t *testing.T) {
		err := TranslateError(errors.New("some standard error"))
		if err != nil {
			t.Errorf("expected nil for non-pq error, got %v", err)
		}
	})

	t.Run("pq unique violation 23505 translates to Exist", func(t *testing.T) {
		pqErr := &pq.Error{
			Code:       "23505",
			Table:      "space",
			Constraint: "space_name_key",
			Detail:     "Key (name)=(Engineering) already exists.",
		}
		err := TranslateError(pqErr)
		if kind := platErr.KindOf(err); kind != platErr.Exist {
			t.Errorf("expected KindExist, got %v", kind)
		}
		meta := platErr.MetaOf(err)
		if meta["table"] != "space" || meta["constraint"] != "space_name_key" {
			t.Errorf("unexpected meta: %v", meta)
		}
	})

	t.Run("pq foreign key violation 23503 translates to Invalid", func(t *testing.T) {
		pqErr := &pq.Error{
			Code:       "23503",
			Constraint: "fk_owner",
			Detail:     "Key (owner_id)=(usr_1) is not present in table user.",
		}
		err := TranslateError(pqErr)
		if kind := platErr.KindOf(err); kind != platErr.Invalid {
			t.Errorf("expected KindInvalid, got %v", kind)
		}
	})

	t.Run("pq not null violation 23502 translates to Invalid", func(t *testing.T) {
		pqErr := &pq.Error{
			Code:   "23502",
			Column: "name",
		}
		err := TranslateError(pqErr)
		if kind := platErr.KindOf(err); kind != platErr.Invalid {
			t.Errorf("expected KindInvalid, got %v", kind)
		}
	})

	t.Run("pq check violation 23514 translates to Invalid", func(t *testing.T) {
		pqErr := &pq.Error{
			Code:       "23514",
			Constraint: "positive_balance",
		}
		err := TranslateError(pqErr)
		if kind := platErr.KindOf(err); kind != platErr.Invalid {
			t.Errorf("expected KindInvalid, got %v", kind)
		}
	})

	t.Run("pq serialization failure 40001 translates to Conflict", func(t *testing.T) {
		pqErr := &pq.Error{
			Code: "40001",
		}
		err := TranslateError(pqErr)
		if kind := platErr.KindOf(err); kind != platErr.Conflict {
			t.Errorf("expected KindConflict, got %v", kind)
		}
	})

	t.Run("pq deadlock 40P01 translates to Conflict", func(t *testing.T) {
		pqErr := &pq.Error{
			Code: "40P01",
		}
		err := TranslateError(pqErr)
		if kind := platErr.KindOf(err); kind != platErr.Conflict {
			t.Errorf("expected KindConflict, got %v", kind)
		}
	})

	t.Run("pq query canceled 57014 translates to Unavailable", func(t *testing.T) {
		pqErr := &pq.Error{
			Code: "57014",
		}
		err := TranslateError(pqErr)
		if kind := platErr.KindOf(err); kind != platErr.Unavailable {
			t.Errorf("expected KindUnavailable, got %v", kind)
		}
	})

	t.Run("pq connection error 08006 translates to Unavailable", func(t *testing.T) {
		pqErr := &pq.Error{
			Code: "08006",
		}
		err := TranslateError(pqErr)
		if kind := platErr.KindOf(err); kind != platErr.Unavailable {
			t.Errorf("expected KindUnavailable, got %v", kind)
		}
	})

	t.Run("unhandled pq error translates to Internal", func(t *testing.T) {
		pqErr := &pq.Error{
			Code:    "99999",
			Message: "unknown error",
		}
		err := TranslateError(pqErr)
		if kind := platErr.KindOf(err); kind != platErr.Internal {
			t.Errorf("expected KindInternal, got %v", kind)
		}
	})
}
