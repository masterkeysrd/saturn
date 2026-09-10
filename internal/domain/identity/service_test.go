package identity

import (
	"context"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/password"
)

type mockUserStore struct {
	createFn               func(ctx context.Context, user *User) error
	getByIDFn              func(ctx context.Context, id UserID) (*User, error)
	getByEmailFn           func(ctx context.Context, email string) (*User, error)
	getByUsernameFn        func(ctx context.Context, username string) (*User, error)
	updateFn               func(ctx context.Context, user *User) error
	deleteFn               func(ctx context.Context, id UserID) error
	getUsersFn             func(ctx context.Context, filter *ListUsersFilter) (*paging.Page[*User], error)
	getAuthVersionFn       func(ctx context.Context, id UserID) (int64, error)
	incrementAuthVersionFn func(ctx context.Context, id UserID) (int64, error)
	updateLockoutStateFn   func(ctx context.Context, req UpdateLockoutRequest) error
}

func (m *mockUserStore) Create(ctx context.Context, user *User) error {
	if m.createFn != nil {
		return m.createFn(ctx, user)
	}
	return nil
}

func (m *mockUserStore) GetByID(ctx context.Context, id UserID) (*User, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, nil
}

func (m *mockUserStore) GetByEmail(ctx context.Context, email string) (*User, error) {
	if m.getByEmailFn != nil {
		return m.getByEmailFn(ctx, email)
	}
	return nil, nil
}

func (m *mockUserStore) GetByUsername(ctx context.Context, username string) (*User, error) {
	if m.getByUsernameFn != nil {
		return m.getByUsernameFn(ctx, username)
	}
	return nil, nil
}

func (m *mockUserStore) Update(ctx context.Context, user *User) error {
	if m.updateFn != nil {
		return m.updateFn(ctx, user)
	}
	return nil
}

func (m *mockUserStore) Delete(ctx context.Context, id UserID) error {
	if m.deleteFn != nil {
		return m.deleteFn(ctx, id)
	}
	return nil
}

func (m *mockUserStore) GetUsers(ctx context.Context, filter *ListUsersFilter) (*paging.Page[*User], error) {
	if m.getUsersFn != nil {
		return m.getUsersFn(ctx, filter)
	}
	return nil, nil
}

func (m *mockUserStore) GetAuthVersion(ctx context.Context, id UserID) (int64, error) {
	if m.getAuthVersionFn != nil {
		return m.getAuthVersionFn(ctx, id)
	}
	return 0, nil
}

func (m *mockUserStore) IncrementAuthVersion(ctx context.Context, id UserID) (int64, error) {
	if m.incrementAuthVersionFn != nil {
		return m.incrementAuthVersionFn(ctx, id)
	}
	return 1, nil
}

func (m *mockUserStore) UpdateLockoutState(ctx context.Context, req UpdateLockoutRequest) error {
	if m.updateLockoutStateFn != nil {
		return m.updateLockoutStateFn(ctx, req)
	}
	return nil
}

type mockCredentialStore struct {
	createFn    func(ctx context.Context, cred *Credential) error
	getFn       func(ctx context.Context, userID UserID, authType string) (*Credential, error)
	updateFn    func(ctx context.Context, cred *Credential) error
	deleteFn    func(ctx context.Context, userID UserID, authType string) error
	getByUserFn func(ctx context.Context, userID UserID) ([]*Credential, error)
}

func (m *mockCredentialStore) Create(ctx context.Context, cred *Credential) error {
	if m.createFn != nil {
		return m.createFn(ctx, cred)
	}
	return nil
}

func (m *mockCredentialStore) GetByUserIDAndAuthType(ctx context.Context, userID UserID, authType string) (*Credential, error) {
	if m.getFn != nil {
		return m.getFn(ctx, userID, authType)
	}
	return nil, nil
}

func (m *mockCredentialStore) Update(ctx context.Context, cred *Credential) error {
	if m.updateFn != nil {
		return m.updateFn(ctx, cred)
	}
	return nil
}

func (m *mockCredentialStore) Delete(ctx context.Context, userID UserID, authType string) error {
	if m.deleteFn != nil {
		return m.deleteFn(ctx, userID, authType)
	}
	return nil
}

func (m *mockCredentialStore) GetByUserID(ctx context.Context, userID UserID) ([]*Credential, error) {
	if m.getByUserFn != nil {
		return m.getByUserFn(ctx, userID)
	}
	return nil, nil
}

type mockHasher struct {
	verifyFn func(encodedHash, raw string) (bool, error)
}

func (m *mockHasher) Verify(encodedHash, raw string) (bool, error) {
	if m.verifyFn != nil {
		return m.verifyFn(encodedHash, raw)
	}
	return false, nil
}

func TestService_CreateUser(t *testing.T) {
	ctx := context.Background()

	t.Run("fails when email already exists", func(t *testing.T) {
		uStore := &mockUserStore{
			getByEmailFn: func(ctx context.Context, email string) (*User, error) {
				return &User{ID: "usr_existing", Email: email}, nil
			},
		}

		svc := NewService(Dependencies{UserStore: uStore})
		err := svc.CreateUser(ctx, &User{Email: "existing@example.com", Username: "newuser"})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if errors.KindOf(err) != errors.Exist {
			t.Errorf("expected KindExist, got %v", errors.KindOf(err))
		}
		if errors.CodeOf(err) != UserExists {
			t.Errorf("expected UserExists, got %v", errors.CodeOf(err))
		}
	})

	t.Run("fails when username already exists", func(t *testing.T) {
		uStore := &mockUserStore{
			getByEmailFn: func(ctx context.Context, email string) (*User, error) {
				return nil, errors.E(errors.NotExist, "not found")
			},
			getByUsernameFn: func(ctx context.Context, username string) (*User, error) {
				return &User{ID: "usr_existing", Username: username}, nil
			},
		}

		svc := NewService(Dependencies{UserStore: uStore})
		err := svc.CreateUser(ctx, &User{Email: "new@example.com", Username: "existinguser"})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if errors.KindOf(err) != errors.Exist {
			t.Errorf("expected KindExist, got %v", errors.KindOf(err))
		}
		if errors.CodeOf(err) != UserExists {
			t.Errorf("expected UserExists, got %v", errors.CodeOf(err))
		}
	})

	t.Run("succeeds when user is new", func(t *testing.T) {
		uStore := &mockUserStore{
			getByEmailFn: func(ctx context.Context, email string) (*User, error) {
				return nil, errors.E(errors.NotExist, "not found")
			},
			getByUsernameFn: func(ctx context.Context, username string) (*User, error) {
				return nil, errors.E(errors.NotExist, "not found")
			},
			createFn: func(ctx context.Context, user *User) error {
				return nil
			},
		}

		svc := NewService(Dependencies{UserStore: uStore})
		err := svc.CreateUser(ctx, &User{Email: "new@example.com", Username: "newuser"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestService_GetUserByID(t *testing.T) {
	ctx := context.Background()

	t.Run("returns NotFound when user does not exist", func(t *testing.T) {
		uStore := &mockUserStore{
			getByIDFn: func(ctx context.Context, id UserID) (*User, error) {
				return nil, errors.E(errors.NotExist, "user not found")
			},
		}

		svc := NewService(Dependencies{UserStore: uStore})
		u, err := svc.GetUserByID(ctx, "usr_missing")
		if u != nil {
			t.Errorf("expected nil user, got %v", u)
		}
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if errors.KindOf(err) != errors.NotExist {
			t.Errorf("expected KindNotExist, got %v", errors.KindOf(err))
		}
		if errors.CodeOf(err) != NotFound {
			t.Errorf("expected NotFound, got %v", errors.CodeOf(err))
		}
	})
}

func TestService_UpdateUser_OptimisticLocking(t *testing.T) {
	ctx := context.Background()

	t.Run("maps store conflict to VersionMismatch", func(t *testing.T) {
		uStore := &mockUserStore{
			updateFn: func(ctx context.Context, user *User) error {
				return errors.E(errors.Conflict, "version mismatch")
			},
		}

		svc := NewService(Dependencies{UserStore: uStore})
		err := svc.UpdateUser(ctx, &User{ID: "usr_1", Version: 1})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if errors.KindOf(err) != errors.Conflict {
			t.Errorf("expected KindConflict, got %v", errors.KindOf(err))
		}
		if errors.CodeOf(err) != VersionMismatch {
			t.Errorf("expected VersionMismatch, got %v", errors.CodeOf(err))
		}
	})
}

func TestService_Authenticate(t *testing.T) {
	ctx := context.Background()

	t.Run("returns PermissionDenied when account is pending approval", func(t *testing.T) {
		uStore := &mockUserStore{
			getByEmailFn: func(ctx context.Context, email string) (*User, error) {
				return &User{
					ID:     "usr_1",
					Email:  email,
					Status: UserStatusPendingApproval,
				}, nil
			},
		}

		svc := NewService(Dependencies{UserStore: uStore})
		u, err := svc.Authenticate(ctx, "pending@example.com", "password123")
		if u != nil {
			t.Errorf("expected nil user, got %v", u)
		}
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if errors.KindOf(err) != errors.Permission {
			t.Errorf("expected KindPermission, got %v", errors.KindOf(err))
		}
		if errors.CodeOf(err) != AccountPending {
			t.Errorf("expected AccountPending, got %v", errors.CodeOf(err))
		}
	})

	t.Run("returns Unauthenticated when password is invalid", func(t *testing.T) {
		uStore := &mockUserStore{
			getByEmailFn: func(ctx context.Context, email string) (*User, error) {
				return &User{
					ID:     "usr_1",
					Email:  email,
					Status: UserStatusActive,
				}, nil
			},
		}
		cStore := &mockCredentialStore{
			getFn: func(ctx context.Context, userID UserID, authType string) (*Credential, error) {
				return &Credential{
					UserID:     userID,
					AuthType:   authType,
					SecretData: "hash",
				}, nil
			},
		}
		hasher := &mockHasher{
			verifyFn: func(encodedHash, raw string) (bool, error) {
				return false, password.ErrPasswordMismatch
			},
		}

		svc := NewService(Dependencies{
			UserStore:       uStore,
			CredentialStore: cStore,
			Hasher:          hasher,
		})
		u, err := svc.Authenticate(ctx, "user@example.com", "wrongpass")
		if u != nil {
			t.Errorf("expected nil user, got %v", u)
		}
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if errors.KindOf(err) != errors.Unauthenticated {
			t.Errorf("expected KindUnauthenticated, got %v", errors.KindOf(err))
		}
		if errors.CodeOf(err) != InvalidCredentials {
			t.Errorf("expected InvalidCredentials, got %v", errors.CodeOf(err))
		}
	})

	t.Run("returns Unauthenticated and logs when hasher returns unexpected error", func(t *testing.T) {
		uStore := &mockUserStore{
			getByEmailFn: func(ctx context.Context, email string) (*User, error) {
				return &User{
					ID:     "usr_1",
					Email:  email,
					Status: UserStatusActive,
				}, nil
			},
		}
		cStore := &mockCredentialStore{
			getFn: func(ctx context.Context, userID UserID, authType string) (*Credential, error) {
				return &Credential{
					UserID:     userID,
					AuthType:   authType,
					SecretData: "corrupted_hash",
				}, nil
			},
		}
		hasher := &mockHasher{
			verifyFn: func(encodedHash, raw string) (bool, error) {
				return false, password.ErrInvalidHash
			},
		}

		svc := NewService(Dependencies{
			UserStore:       uStore,
			CredentialStore: cStore,
			Hasher:          hasher,
		})
		u, err := svc.Authenticate(ctx, "user@example.com", "anypass")
		if u != nil {
			t.Errorf("expected nil user, got %v", u)
		}
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if errors.KindOf(err) != errors.Unauthenticated {
			t.Errorf("expected KindUnauthenticated, got %v", errors.KindOf(err))
		}
		if errors.CodeOf(err) != InvalidCredentials {
			t.Errorf("expected InvalidCredentials, got %v", errors.CodeOf(err))
		}
	})

	t.Run("returns user when credentials are valid", func(t *testing.T) {
		uStore := &mockUserStore{
			getByEmailFn: func(ctx context.Context, email string) (*User, error) {
				return &User{
					ID:     "usr_1",
					Email:  email,
					Status: UserStatusActive,
				}, nil
			},
		}
		cStore := &mockCredentialStore{
			getFn: func(ctx context.Context, userID UserID, authType string) (*Credential, error) {
				return &Credential{
					UserID:     userID,
					AuthType:   authType,
					SecretData: "hash",
				}, nil
			},
		}
		hasher := &mockHasher{
			verifyFn: func(encodedHash, raw string) (bool, error) {
				return false, nil
			},
		}

		svc := NewService(Dependencies{
			UserStore:       uStore,
			CredentialStore: cStore,
			Hasher:          hasher,
		})
		u, err := svc.Authenticate(ctx, "user@example.com", "correctpass")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if u == nil || u.ID != "usr_1" {
			t.Errorf("expected user with ID usr_1, got %v", u)
		}
	})
}
