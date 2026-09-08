package db

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	platErr "github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestTranslateError(t *testing.T) {
	t.Run("nil error", func(t *testing.T) {
		if err := translateError(nil, nil); err != nil {
			t.Errorf("expected nil, got %v", err)
		}
	})

	t.Run("already platform error", func(t *testing.T) {
		orig := platErr.E(platErr.NotExist, "not found")
		if err := translateError(orig, nil); err != orig {
			t.Errorf("expected original error preserved, got %v", err)
		}
	})

	t.Run("sql.ErrNoRows translates to NotExist", func(t *testing.T) {
		err := translateError(sql.ErrNoRows, nil)
		if kind := platErr.KindOf(err); kind != platErr.NotExist {
			t.Errorf("expected KindNotExist, got %v", kind)
		}
	})

	t.Run("context canceled translates to Unavailable", func(t *testing.T) {
		err := translateError(context.Canceled, nil)
		if kind := platErr.KindOf(err); kind != platErr.Unavailable {
			t.Errorf("expected KindUnavailable, got %v", kind)
		}
	})

	t.Run("context deadline exceeded translates to Unavailable", func(t *testing.T) {
		err := translateError(context.DeadlineExceeded, nil)
		if kind := platErr.KindOf(err); kind != platErr.Unavailable {
			t.Errorf("expected KindUnavailable, got %v", kind)
		}
	})

	t.Run("custom translator invoked", func(t *testing.T) {
		customErr := errors.New("custom driver error")
		mockTranslator := func(err error) error {
			if errors.Is(err, customErr) {
				return platErr.E(platErr.Conflict, "conflict from driver")
			}
			return nil
		}

		err := translateError(customErr, mockTranslator)
		if kind := platErr.KindOf(err); kind != platErr.Conflict {
			t.Errorf("expected KindConflict, got %v", kind)
		}

		// When translator returns nil (unrecognized), should fallback to Internal
		unrecognized := errors.New("unrecognized error")
		err2 := translateError(unrecognized, mockTranslator)
		if kind := platErr.KindOf(err2); kind != platErr.Internal {
			t.Errorf("expected KindInternal, got %v", kind)
		}
	})

	t.Run("generic error without translator translates to Internal", func(t *testing.T) {
		err := translateError(errors.New("something bad happened"), nil)
		if kind := platErr.KindOf(err); kind != platErr.Internal {
			t.Errorf("expected KindInternal, got %v", kind)
		}
	})
}

func TestRegistry(t *testing.T) {
	dummyDriver := "test-driver"
	dummyTranslator := func(err error) error {
		return platErr.E(platErr.Invalid, "invalid")
	}

	RegisterTranslator(dummyDriver, dummyTranslator)
	retrieved := LookupTranslator(dummyDriver)
	if retrieved == nil {
		t.Fatal("expected translator to be registered")
	}

	res := retrieved(errors.New("any"))
	if kind := platErr.KindOf(res); kind != platErr.Invalid {
		t.Errorf("expected KindInvalid, got %v", kind)
	}
}
