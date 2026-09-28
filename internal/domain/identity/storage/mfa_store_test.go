package storage

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/lib/pq"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

func TestMFAFactorStore(t *testing.T) {
	ctx := context.Background()

	t.Run("CreateFactor calls Exec", func(t *testing.T) {
		called := false
		mock := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				called = true
				return nil, nil
			},
		}

		store := NewMFAFactorStore(mock)
		factor := &identity.MFAFactor{
			ID:        "mfa_1",
			UserID:    "usr_1",
			Type:      identity.MFAFactorTypeTOTP,
			Name:      "Authenticator",
			Config:    &identity.TOTPConfig{EncryptedSecret: "secret"},
			CreatedAt: time.Now(),
		}

		err := store.CreateFactor(ctx, factor)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !called {
			t.Fatal("expected Exec to be called")
		}
	})

	t.Run("GetFactorByID calls Get", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				record, ok := dest.(*mfaFactorDB)
				if !ok {
					t.Fatalf("expected *mfaFactorDB, got %T", dest)
				}
				record.ID = "mfa_1"
				record.UserID = "usr_1"
				record.Type = "totp"
				record.Name = "Authenticator"
				record.Config = []byte(`{"encrypted_secret":"secret"}`)
				return nil
			},
		}

		store := NewMFAFactorStore(mock)
		factor, err := store.GetFactorByID(ctx, "mfa_1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if factor.ID != "mfa_1" || factor.Name != "Authenticator" {
			t.Errorf("unexpected factor: %+v", factor)
		}
		if factor.TOTPConfig() == nil || factor.TOTPConfig().EncryptedSecret != "secret" {
			t.Errorf("expected TOTPConfig with secret, got: %+v", factor.Config)
		}
	})

	t.Run("ListFactorsByUserID calls Select", func(t *testing.T) {
		mock := &mockDB{
			selectFn: func(ctx context.Context, dest any, query string, args ...any) error {
				ptr, ok := dest.(*[]mfaFactorDB)
				if !ok {
					t.Fatalf("expected *[]mfaFactorDB, got %T", dest)
				}
				*ptr = []mfaFactorDB{
					{ID: "mfa_1", UserID: "usr_1", Type: "totp", Name: "Phone"},
				}
				return nil
			},
		}

		store := NewMFAFactorStore(mock)
		factors, err := store.ListFactorsByUserID(ctx, "usr_1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(factors) != 1 || factors[0].ID != "mfa_1" {
			t.Errorf("unexpected factors: %+v", factors)
		}
	})

	t.Run("UpdateFactor calls ExecOne", func(t *testing.T) {
		called := false
		mock := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				called = true
				return nil
			},
		}

		store := NewMFAFactorStore(mock)
		err := store.UpdateFactor(ctx, &identity.MFAFactor{ID: "mfa_1"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !called {
			t.Fatal("expected ExecOne to be called")
		}
	})

	t.Run("DeleteFactor calls Exec", func(t *testing.T) {
		called := false
		mock := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				called = true
				return nil, nil
			},
		}

		store := NewMFAFactorStore(mock)
		err := store.DeleteFactor(ctx, "mfa_1", time.Now())
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !called {
			t.Fatal("expected Exec to be called")
		}
	})

	t.Run("SetPrimaryFactor calls Exec and ExecOne", func(t *testing.T) {
		execCalled := false
		execOneCalled := false
		mock := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				execCalled = true
				return nil, nil
			},
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				execOneCalled = true
				return nil
			},
		}

		store := NewMFAFactorStore(mock)
		err := store.SetPrimaryFactor(ctx, "usr_1", "mfa_1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !execCalled || !execOneCalled {
			t.Fatal("expected both Exec and ExecOne to be called")
		}
	})

	t.Run("GetRecovery calls Get", func(t *testing.T) {
		mock := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				record, ok := dest.(*mfaRecoveryDB)
				if !ok {
					t.Fatalf("expected *mfaRecoveryDB, got %T", dest)
				}
				record.UserID = "usr_1"
				record.BackupCodes = pq.StringArray{"hash1", "hash2"}
				return nil
			},
		}

		store := NewMFAFactorStore(mock)
		recovery, err := store.GetRecovery(ctx, "usr_1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if recovery.UserID != "usr_1" || len(recovery.BackupCodes) != 2 {
			t.Errorf("unexpected recovery: %+v", recovery)
		}
	})

	t.Run("UpsertRecovery calls Exec", func(t *testing.T) {
		called := false
		mock := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				called = true
				return nil, nil
			},
		}

		store := NewMFAFactorStore(mock)
		err := store.UpsertRecovery(ctx, &identity.MFARecovery{
			UserID:      "usr_1",
			BackupCodes: []string{"hash1"},
			UpdatedAt:   time.Now(),
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !called {
			t.Fatal("expected Exec to be called")
		}
	})
}
