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

func TestTxController_Lifecycle(t *testing.T) {
	t.Run("safe defer rollback after commit", func(t *testing.T) {
		ctrl := &TxController{}
		if err := ctrl.Commit(); err != nil {
			t.Fatalf("commit failed: %v", err)
		}
		if !ctrl.IsDone() {
			t.Errorf("expected ctrl.IsDone() to be true")
		}
		// Calling Rollback after Commit should be a safe zero-cost no-op
		if err := ctrl.Rollback(); err != nil {
			t.Errorf("expected rollback after commit to return nil, got: %v", err)
		}
	})

	t.Run("rollback marks done and aborted", func(t *testing.T) {
		ctrl := &TxController{}
		if err := ctrl.Rollback(); err != nil {
			t.Fatalf("rollback failed: %v", err)
		}
		if !ctrl.IsDone() {
			t.Errorf("expected ctrl.IsDone() to be true")
		}
		if !ctrl.IsAborted() {
			t.Errorf("expected ctrl.IsAborted() to be true")
		}
		// Subsequent commit should fail
		if err := ctrl.Commit(); err == nil {
			t.Errorf("expected error committing completed tx, got nil")
		}
	})

	t.Run("nested transaction commit", func(t *testing.T) {
		root := &TxController{}
		child := &TxController{parent: root}

		if err := child.Commit(); err != nil {
			t.Fatalf("child commit failed: %v", err)
		}
		if !child.IsDone() {
			t.Errorf("expected child to be done")
		}
		if root.IsDone() {
			t.Errorf("expected root to NOT be done yet")
		}

		if err := root.Commit(); err != nil {
			t.Fatalf("root commit failed: %v", err)
		}
		if !root.IsDone() {
			t.Errorf("expected root to be done")
		}
	})

	t.Run("nested transaction rollback aborts parent", func(t *testing.T) {
		root := &TxController{}
		child := &TxController{parent: root}

		if err := child.Rollback(); err != nil {
			t.Fatalf("child rollback failed: %v", err)
		}
		if !child.IsDone() || !child.IsAborted() {
			t.Errorf("expected child to be done and aborted")
		}
		if !root.IsAborted() {
			t.Errorf("expected root to be marked aborted by child rollback")
		}

		// Root commit must fail because a nested transaction was aborted
		err := root.Commit()
		if err == nil {
			t.Fatal("expected root commit to fail after child rollback")
		}
		if !root.IsDone() {
			t.Errorf("expected root to be marked done after failed commit")
		}
	})

	t.Run("three-level nested rollback aborts all ancestors", func(t *testing.T) {
		root := &TxController{}
		child := &TxController{parent: root}
		grandchild := &TxController{parent: child}

		if err := grandchild.Rollback(); err != nil {
			t.Fatalf("grandchild rollback failed: %v", err)
		}
		if !child.IsAborted() {
			t.Errorf("expected child to be marked aborted")
		}
		if !root.IsAborted() {
			t.Errorf("expected root to be marked aborted")
		}

		if err := child.Commit(); err == nil {
			t.Fatal("expected child commit to fail")
		}
		if err := root.Commit(); err == nil {
			t.Fatal("expected root commit to fail")
		}
	})
}

func TestContextHelpers(t *testing.T) {
	ctx := context.Background()

	if ctrl := TxControllerFromContext(ctx); ctrl != nil {
		t.Errorf("expected nil ctrl from empty context, got %v", ctrl)
	}
	if tx := TxFromContext(ctx); tx != nil {
		t.Errorf("expected nil tx from empty context, got %v", tx)
	}

	dummyTx := &Tx{}
	ctrl := &TxController{tx: dummyTx}
	txCtx := WithTxContext(ctx, ctrl)

	if gotCtrl := TxControllerFromContext(txCtx); gotCtrl != ctrl {
		t.Errorf("expected ctrl %v, got %v", ctrl, gotCtrl)
	}
	if gotTx := TxFromContext(txCtx); gotTx != dummyTx {
		t.Errorf("expected tx %v, got %v", dummyTx, gotTx)
	}

	// Once done, TxFromContext should return nil
	_ = ctrl.Commit()
	if gotTx := TxFromContext(txCtx); gotTx != nil {
		t.Errorf("expected nil tx after commit, got %v", gotTx)
	}
}

func TestTransactorHelpers(t *testing.T) {
	t.Run("nil transactor returns error", func(t *testing.T) {
		_, _, err := Begin(context.Background(), nil)
		if err == nil {
			t.Fatal("expected error for nil transactor")
		}

		err = WithTx(context.Background(), nil, func(ctx context.Context) error {
			return nil
		})
		if err == nil {
			t.Fatal("expected error for nil transactor")
		}
	})

	t.Run("nested Begin on TxController", func(t *testing.T) {
		root := &TxController{}
		ctx := WithTxContext(context.Background(), root)

		childCtx, child, err := root.Begin(ctx)
		if err != nil {
			t.Fatalf("Begin on TxController failed: %v", err)
		}
		if child.parent != root {
			t.Errorf("expected child's parent to be root")
		}
		if TxControllerFromContext(childCtx) != child {
			t.Errorf("expected childCtx to contain child controller")
		}
	})
}
