package storage

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
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

	t.Run("GetByID returns translated NotExist error and canonical Op", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "record not found")
			},
		}

		store := NewAccountStore(mock)
		acc, err := store.GetByID(ctx, "sp_1", "acc_nonexistent")
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
			SpaceID: "sp_1",
			Version: 2,
		}

		err := store.Update(ctx, acc)
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
			SpaceID: "sp_1",
			Version: 2,
		}

		err := store.Update(ctx, acc)
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
		err := store.Delete(ctx, "sp_1", "acc_1", finance.DeleteOptions{})
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

	t.Run("GetByID returns translated NotExist error", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "record not found")
			},
		}

		store := NewBudgetStore(mock)
		b, err := store.GetByID(ctx, "sp_1", "bgt_nonexistent")
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
			SpaceID: "sp_1",
			Version: 5,
		}

		err := store.Update(ctx, b)
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

	t.Run("GetByID returns NotExist error", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "record not found")
			},
		}

		store := NewTransactionStore(mock)
		tx, err := store.GetByID(ctx, "sp_1", "tx_nonexistent")
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
		err := store.Delete(ctx, "tx_1")
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

	t.Run("GetByID returns NotExist error", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "record not found")
			},
		}

		store := NewStatementStore(mock)
		stmt, err := store.GetByID(ctx, "sp_1", "stmt_nonexistent")
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
			SpaceID: "sp_1",
			Version: 3,
		}

		err := store.Update(ctx, stmt)
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

		err := store.UpdateLineDraft(ctx, line)
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

	t.Run("GetByID returns NotExist error", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "record not found")
			},
		}

		store := NewBorrowingStore(mock)
		b, err := store.GetByID(ctx, "sp_1", "bor_nonexistent")
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
			SpaceID: "sp_1",
			Version: 2,
		}

		err := store.Update(ctx, b)
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

	t.Run("GetByID returns NotExist error", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "record not found")
			},
		}

		store := NewInstitutionStore(mock)
		inst, err := store.GetByID(ctx, "sp_1", "inst_nonexistent")
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
			SpaceID: "sp_1",
			Version: 1,
		}

		err := store.Update(ctx, inst)
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
		rate, err := store.GetRate(ctx, finance.ExchangeRateKey{
			SpaceID:      "sp_1",
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
