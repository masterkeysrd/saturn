package storage

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

type mockDB struct {
	getFn     func(ctx context.Context, dest any, query string, args ...any) error
	selectFn  func(ctx context.Context, dest any, query string, args ...any) error
	execFn    func(ctx context.Context, query string, args ...any) (sql.Result, error)
	execOneFn func(ctx context.Context, query string, args ...any) error
	rebindFn  func(query string) string
}

func (m *mockDB) Get(ctx context.Context, dest any, query string, args ...any) error {
	if m.getFn != nil {
		return m.getFn(ctx, dest, query, args...)
	}
	return nil
}

func (m *mockDB) Select(ctx context.Context, dest any, query string, args ...any) error {
	if m.selectFn != nil {
		return m.selectFn(ctx, dest, query, args...)
	}
	return nil
}

func (m *mockDB) Exec(ctx context.Context, query string, args ...any) (sql.Result, error) {
	if m.execFn != nil {
		return m.execFn(ctx, query, args...)
	}
	return nil, nil
}

func (m *mockDB) ExecOne(ctx context.Context, query string, args ...any) error {
	if m.execOneFn != nil {
		return m.execOneFn(ctx, query, args...)
	}
	return nil
}

func (m *mockDB) Rebind(query string) string {
	if m.rebindFn != nil {
		return m.rebindFn(query)
	}
	return query
}

func TestAccountStore(t *testing.T) {
	ctx := context.Background()
	rCtx := finance.NewContext("sp_1", "user_1", time.UTC, "USD")

	t.Run("GetByID returns translated NotExist error and canonical Op", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "record not found")
			},
		}

		store := NewAccountStore(mock)
		acc, err := store.GetByID(ctx, rCtx, "acc_nonexistent")
		if acc != nil {
			t.Errorf("expected nil account, got %v", acc)
		}
		if !errors.Is(err, errors.NotExist) {
			t.Errorf("expected NotExist error, got %v", err)
		}
		if e, ok := err.(*errors.Error); !ok || e.Op != "domain/finance/storage.GetByID" {
			t.Errorf("expected op domain/finance/storage.GetByID, got %v", err)
		}
	})

	t.Run("Update version mismatch returns Conflict and canonical Op", func(t *testing.T) {
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				return errors.E(errors.NotExist, "no rows affected")
			},
		}

		store := NewAccountStore(mock)
		acc := &finance.Account{
			ID:      "acc_1",
			Version: 2,
		}

		err := store.Update(ctx, rCtx, acc)
		if !errors.Is(err, errors.Conflict) {
			t.Errorf("expected Conflict error, got %v", err)
		}
		if code := errors.CodeOf(err); code != finance.AccountVersionMismatch {
			t.Errorf("expected code %v, got %v", finance.AccountVersionMismatch, code)
		}
		if e, ok := err.(*errors.Error); !ok || e.Op != "domain/finance/storage.Update" {
			t.Errorf("expected op domain/finance/storage.Update, got %v", err)
		}
	})

	t.Run("Update success increments version", func(t *testing.T) {
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				return nil
			},
		}

		store := NewAccountStore(mock)
		acc := &finance.Account{
			ID:      "acc_1",
			Version: 2,
		}

		err := store.Update(ctx, rCtx, acc)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if acc.Version != 3 {
			t.Errorf("expected version 3, got %d", acc.Version)
		}
	})

	t.Run("Delete returns NotExist when row not found", func(t *testing.T) {
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				return errors.E(errors.NotExist, "no rows affected")
			},
		}

		store := NewAccountStore(mock)
		err := store.Delete(ctx, rCtx, "acc_1", finance.DeleteOptions{})
		if !errors.Is(err, errors.NotExist) {
			t.Errorf("expected NotExist error, got %v", err)
		}
		if e, ok := err.(*errors.Error); !ok || e.Op != "domain/finance/storage.Delete" {
			t.Errorf("expected op domain/finance/storage.Delete, got %v", err)
		}
	})
}

func TestBudgetStore(t *testing.T) {
	ctx := context.Background()
	rCtx := finance.NewContext("sp_1", "user_1", time.UTC, "USD")

	t.Run("GetByID returns translated NotExist error", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "record not found")
			},
		}

		store := NewBudgetStore(mock)
		b, err := store.GetByID(ctx, rCtx, "bgt_nonexistent")
		if b != nil {
			t.Errorf("expected nil budget, got %v", b)
		}
		if !errors.Is(err, errors.NotExist) {
			t.Errorf("expected NotExist error, got %v", err)
		}
		if e, ok := err.(*errors.Error); !ok || e.Op != "domain/finance/storage.GetByID" {
			t.Errorf("expected op domain/finance/storage.GetByID, got %v", err)
		}
	})

	t.Run("Update version mismatch returns Conflict", func(t *testing.T) {
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				return errors.E(errors.NotExist, "no rows affected")
			},
		}

		store := NewBudgetStore(mock)
		b := &finance.Budget{
			ID:      "bgt_1",
			Version: 5,
		}

		err := store.Update(ctx, rCtx, b)
		if !errors.Is(err, errors.Conflict) {
			t.Errorf("expected Conflict error, got %v", err)
		}
		if code := errors.CodeOf(err); code != finance.BudgetVersionMismatch {
			t.Errorf("expected code %v, got %v", finance.BudgetVersionMismatch, code)
		}
		if e, ok := err.(*errors.Error); !ok || e.Op != "domain/finance/storage.Update" {
			t.Errorf("expected op domain/finance/storage.Update, got %v", err)
		}
	})
}

func TestTransactionStore(t *testing.T) {
	ctx := context.Background()
	rCtx := finance.NewContext("sp_1", "user_1", time.UTC, "USD")

	t.Run("GetByID returns NotExist error", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "record not found")
			},
		}

		store := NewTransactionStore(mock)
		tx, err := store.GetByID(ctx, rCtx, "tx_nonexistent")
		if tx != nil {
			t.Errorf("expected nil transaction, got %v", tx)
		}
		if !errors.Is(err, errors.NotExist) {
			t.Errorf("expected NotExist error, got %v", err)
		}
		if e, ok := err.(*errors.Error); !ok || e.Op != "domain/finance/storage.GetTransactionByID" {
			t.Errorf("expected op domain/finance/storage.GetTransactionByID, got %v", err)
		}
	})

	t.Run("Delete returns NotExist when transaction not found", func(t *testing.T) {
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				return errors.E(errors.NotExist, "no rows affected")
			},
		}

		store := NewTransactionStore(mock)
		err := store.Delete(ctx, rCtx, "tx_1")
		if !errors.Is(err, errors.NotExist) {
			t.Errorf("expected NotExist error, got %v", err)
		}
		if e, ok := err.(*errors.Error); !ok || e.Op != "domain/finance/storage.DeleteTransaction" {
			t.Errorf("expected op domain/finance/storage.DeleteTransaction, got %v", err)
		}
	})
}

func TestStatementStore(t *testing.T) {
	ctx := context.Background()
	rCtx := finance.NewContext("sp_1", "user_1", time.UTC, "USD")

	t.Run("GetByID returns NotExist error", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "record not found")
			},
		}

		store := NewStatementStore(mock)
		stmt, err := store.GetByID(ctx, rCtx, "stmt_nonexistent")
		if stmt != nil {
			t.Errorf("expected nil statement, got %v", stmt)
		}
		if !errors.Is(err, errors.NotExist) {
			t.Errorf("expected NotExist error, got %v", err)
		}
		if e, ok := err.(*errors.Error); !ok || e.Op != "domain/finance/storage.GetStatementByID" {
			t.Errorf("expected op domain/finance/storage.GetStatementByID, got %v", err)
		}
	})

	t.Run("Update version mismatch returns Conflict", func(t *testing.T) {
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				return errors.E(errors.NotExist, "no rows affected")
			},
		}

		store := NewStatementStore(mock)
		stmt := &finance.Statement{
			ID:      "stmt_1",
			Version: 3,
		}

		err := store.Update(ctx, rCtx, stmt)
		if !errors.Is(err, errors.Conflict) {
			t.Errorf("expected Conflict error, got %v", err)
		}
		if code := errors.CodeOf(err); code != finance.StatementVersionMismatch {
			t.Errorf("expected code %v, got %v", finance.StatementVersionMismatch, code)
		}
		if e, ok := err.(*errors.Error); !ok || e.Op != "domain/finance/storage.UpdateStatement" {
			t.Errorf("expected op domain/finance/storage.UpdateStatement, got %v", err)
		}
	})

	t.Run("UpdateLineDraft version mismatch returns Conflict", func(t *testing.T) {
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				return errors.E(errors.NotExist, "no rows affected")
			},
		}

		store := NewStatementStore(mock)
		line := &finance.StatementLine{
			ID:      "line_1",
			Version: 2,
		}

		err := store.UpdateLineDraft(ctx, rCtx, line)
		if !errors.Is(err, errors.Conflict) {
			t.Errorf("expected Conflict error, got %v", err)
		}
		if code := errors.CodeOf(err); code != finance.VersionMismatch {
			t.Errorf("expected code %v, got %v", finance.VersionMismatch, code)
		}
		if e, ok := err.(*errors.Error); !ok || e.Op != "domain/finance/storage.UpdateStatementLineDraft" {
			t.Errorf("expected op domain/finance/storage.UpdateStatementLineDraft, got %v", err)
		}
	})
}

func TestBorrowingStore(t *testing.T) {
	ctx := context.Background()
	rCtx := finance.NewContext("sp_1", "user_1", time.UTC, "USD")

	t.Run("GetByID returns NotExist error", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "record not found")
			},
		}

		store := NewBorrowingStore(mock)
		b, err := store.GetByID(ctx, rCtx, "bor_nonexistent")
		if b != nil {
			t.Errorf("expected nil borrowing, got %v", b)
		}
		if !errors.Is(err, errors.NotExist) {
			t.Errorf("expected NotExist error, got %v", err)
		}
		if e, ok := err.(*errors.Error); !ok || e.Op != "domain/finance/storage.GetByID" {
			t.Errorf("expected op domain/finance/storage.GetByID, got %v", err)
		}
	})

	t.Run("Update version mismatch returns Conflict", func(t *testing.T) {
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				return errors.E(errors.NotExist, "no rows affected")
			},
		}

		store := NewBorrowingStore(mock)
		b := &finance.Borrowing{
			ID:      "bor_1",
			Version: 2,
		}

		err := store.Update(ctx, rCtx, b)
		if !errors.Is(err, errors.Conflict) {
			t.Errorf("expected Conflict error, got %v", err)
		}
		if code := errors.CodeOf(err); code != finance.BorrowingVersionMismatch {
			t.Errorf("expected code %v, got %v", finance.BorrowingVersionMismatch, code)
		}
		if e, ok := err.(*errors.Error); !ok || e.Op != "domain/finance/storage.Update" {
			t.Errorf("expected op domain/finance/storage.Update, got %v", err)
		}
	})
}

func TestInstitutionStore(t *testing.T) {
	ctx := context.Background()
	rCtx := finance.NewContext("sp_1", "user_1", time.UTC, "USD")

	t.Run("GetByID returns NotExist error", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "record not found")
			},
		}

		store := NewInstitutionStore(mock)
		inst, err := store.GetByID(ctx, rCtx, "inst_nonexistent")
		if inst != nil {
			t.Errorf("expected nil institution, got %v", inst)
		}
		if !errors.Is(err, errors.NotExist) {
			t.Errorf("expected NotExist error, got %v", err)
		}
		if e, ok := err.(*errors.Error); !ok || e.Op != "domain/finance/storage.GetInstitutionByID" {
			t.Errorf("expected op domain/finance/storage.GetInstitutionByID, got %v", err)
		}
	})

	t.Run("Update version mismatch returns Conflict", func(t *testing.T) {
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				return errors.E(errors.NotExist, "no rows affected")
			},
		}

		store := NewInstitutionStore(mock)
		inst := &finance.Institution{
			ID:      "inst_1",
			Version: 1,
		}

		err := store.Update(ctx, rCtx, inst)
		if !errors.Is(err, errors.Conflict) {
			t.Errorf("expected Conflict error, got %v", err)
		}
		if code := errors.CodeOf(err); code != finance.InstitutionVersionMismatch {
			t.Errorf("expected code %v, got %v", finance.InstitutionVersionMismatch, code)
		}
		if e, ok := err.(*errors.Error); !ok || e.Op != "domain/finance/storage.UpdateInstitution" {
			t.Errorf("expected op domain/finance/storage.UpdateInstitution, got %v", err)
		}
	})
}

func TestExchangeRateStore(t *testing.T) {
	ctx := context.Background()

	t.Run("GetRate returns NotExist error", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "record not found")
			},
		}

		store := NewExchangeRateStore(mock)
		rCtx := finance.NewContext("sp_1", "usr_1", time.UTC, "USD")
		rate, err := store.GetRate(ctx, rCtx, finance.ExchangeRateKey{
			FromCurrency: "USD",
			ToCurrency:   "EUR",
			RateDate:     time.Now(),
		})
		if rate != nil {
			t.Errorf("expected nil rate, got %v", rate)
		}
		if !errors.Is(err, errors.NotExist) {
			t.Errorf("expected NotExist error, got %v", err)
		}
		if e, ok := err.(*errors.Error); !ok || e.Op != "domain/finance/storage.GetRate" {
			t.Errorf("expected op domain/finance/storage.GetRate, got %v", err)
		}
	})
}

func TestStatementStore_LineSpaceScoping(t *testing.T) {
	ctx := context.Background()
	rCtx := finance.NewContext("sp_1", "user_1", time.UTC, "USD")

	t.Run("ListLines enforces space_id via statement EXISTS", func(t *testing.T) {
		var capturedQuery string
		var capturedArgs []any
		mock := &mockDB{
			selectFn: func(ctx context.Context, dest any, query string, args ...any) error {
				capturedQuery = query
				capturedArgs = args
				return nil
			},
		}
		store := NewStatementStore(mock)
		_, err := store.ListLines(ctx, rCtx, "stmt_1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.Contains(capturedQuery, "EXISTS (SELECT 1 FROM finance.statement s WHERE s.id = finance.statement_line.statement_id AND s.space_id =") {
			t.Errorf("expected space_id EXISTS predicate in query, got %s", capturedQuery)
		}
		if len(capturedArgs) != 2 || capturedArgs[1] != "sp_1" {
			t.Errorf("expected sp_1 in args, got %v", capturedArgs)
		}
	})

	t.Run("GetLineByID enforces space_id via statement EXISTS", func(t *testing.T) {
		var capturedQuery string
		var capturedArgs []any
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				capturedQuery = query
				capturedArgs = args
				return errors.E(errors.NotExist, "not found")
			},
		}
		store := NewStatementStore(mock)
		_, _ = store.GetLineByID(ctx, rCtx, "line_1")
		if !strings.Contains(capturedQuery, "EXISTS (SELECT 1 FROM finance.statement s WHERE s.id = finance.statement_line.statement_id AND s.space_id =") {
			t.Errorf("expected space_id EXISTS predicate in query, got %s", capturedQuery)
		}
		if len(capturedArgs) != 2 || capturedArgs[1] != "sp_1" {
			t.Errorf("expected sp_1 in args, got %v", capturedArgs)
		}
	})

	t.Run("UpdateLineDraft enforces space_id via statement EXISTS", func(t *testing.T) {
		var capturedQuery string
		var capturedArgs []any
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				capturedQuery = query
				capturedArgs = args
				return nil
			},
		}
		store := NewStatementStore(mock)
		err := store.UpdateLineDraft(ctx, rCtx, &finance.StatementLine{ID: "line_1", Version: 1})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.Contains(capturedQuery, "EXISTS (SELECT 1 FROM finance.statement s WHERE s.id = finance.statement_line.statement_id AND s.space_id =") {
			t.Errorf("expected space_id EXISTS predicate in query, got %s", capturedQuery)
		}
		foundSpace := false
		for _, a := range capturedArgs {
			if a == "sp_1" {
				foundSpace = true
			}
		}
		if !foundSpace {
			t.Errorf("expected sp_1 in args, got %v", capturedArgs)
		}
	})
}

func TestTransferStore_KeysetPagination(t *testing.T) {
	ctx := context.Background()
	rCtx := finance.NewContext("sp_1", "user_1", time.UTC, "USD")

	var capturedQuery string
	var capturedArgs []any
	mock := &mockDB{
		selectFn: func(ctx context.Context, dest any, query string, args ...any) error {
			capturedQuery = query
			capturedArgs = args
			return nil
		},
	}

	cursor := paging.Cursor{
		SortValue: "2026-08-01T10:00:00.123456Z",
		ID:        "trf_10",
	}.Encode()

	store := NewTransferStore(mock)
	_, _, err := store.ListBySpace(ctx, rCtx, 10, cursor)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(capturedQuery, `"transfer_date" <`) || !strings.Contains(capturedQuery, `"id" <`) {
		t.Errorf("expected composite (transfer_date, id) keyset pagination in query, got %s", capturedQuery)
	}
	if len(capturedArgs) < 4 {
		t.Errorf("expected cursor args in query, got %v", capturedArgs)
	}
}
