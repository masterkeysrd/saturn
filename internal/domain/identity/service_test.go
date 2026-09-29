package identity

import (
	"context"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/crypto"
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

type mockSessionStore struct {
	createFn                func(ctx context.Context, session *Session) error
	getByIDFn               func(ctx context.Context, id SessionID) (*Session, error)
	getByRefreshTokenHashFn func(ctx context.Context, hash []byte) (*Session, error)
	updateFn                func(ctx context.Context, session *Session) error
	listActiveSessionsFn    func(ctx context.Context, userID UserID) ([]*Session, error)
	revokeFamilyFn          func(ctx context.Context, familyID TokenFamilyID, now time.Time) error
	revokeAllForUserFn      func(ctx context.Context, userID UserID, now time.Time) error
	revokeByDeviceIDFn      func(ctx context.Context, deviceID DeviceID, now time.Time) error
}

func (m *mockSessionStore) Create(ctx context.Context, session *Session) error {
	if m.createFn != nil {
		return m.createFn(ctx, session)
	}
	return nil
}

func (m *mockSessionStore) GetByID(ctx context.Context, id SessionID) (*Session, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, nil
}

func (m *mockSessionStore) GetByRefreshTokenHash(ctx context.Context, hash []byte) (*Session, error) {
	if m.getByRefreshTokenHashFn != nil {
		return m.getByRefreshTokenHashFn(ctx, hash)
	}
	return nil, nil
}

func (m *mockSessionStore) Update(ctx context.Context, session *Session) error {
	if m.updateFn != nil {
		return m.updateFn(ctx, session)
	}
	return nil
}

func (m *mockSessionStore) ListActiveSessions(ctx context.Context, userID UserID) ([]*Session, error) {
	if m.listActiveSessionsFn != nil {
		return m.listActiveSessionsFn(ctx, userID)
	}
	return nil, nil
}

func (m *mockSessionStore) RevokeFamily(ctx context.Context, familyID TokenFamilyID, now time.Time) error {
	if m.revokeFamilyFn != nil {
		return m.revokeFamilyFn(ctx, familyID, now)
	}
	return nil
}

func (m *mockSessionStore) RevokeAllForUser(ctx context.Context, userID UserID, now time.Time) error {
	if m.revokeAllForUserFn != nil {
		return m.revokeAllForUserFn(ctx, userID, now)
	}
	return nil
}

func (m *mockSessionStore) RevokeByDeviceID(ctx context.Context, deviceID DeviceID, now time.Time) error {
	if m.revokeByDeviceIDFn != nil {
		return m.revokeByDeviceIDFn(ctx, deviceID, now)
	}
	return nil
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

func TestService_RotateSession(t *testing.T) {
	ctx := context.Background()
	now := time.Now()

	t.Run("fails with SessionNotFound when token hash does not match", func(t *testing.T) {
		sStore := &mockSessionStore{
			getByRefreshTokenHashFn: func(ctx context.Context, hash []byte) (*Session, error) {
				return nil, errors.E(errors.NotExist, "not found")
			},
		}

		svc := NewService(Dependencies{SessionStore: sStore})
		res, err := svc.RotateSession(ctx, &RotateSessionRequest{
			RefreshTokenHash: []byte("unknown_hash"),
			SuccessorHash:    []byte("new_hash"),
			ExpiresAt:        now.Add(time.Hour),
		})
		if res != nil {
			t.Errorf("expected nil session, got %v", res)
		}
		if errors.CodeOf(err) != SessionNotFound {
			t.Errorf("expected SessionNotFound, got %v", errors.CodeOf(err))
		}
	})

	t.Run("detects reuse attack and revokes family when session already replaced", func(t *testing.T) {
		familyRevoked := false
		replacedAt := now.Add(-5 * time.Minute)
		sStore := &mockSessionStore{
			getByRefreshTokenHashFn: func(ctx context.Context, hash []byte) (*Session, error) {
				return &Session{
					ID:            "ses_old",
					TokenFamilyID: "tfm_compromised",
					ReplacedAt:    &replacedAt,
				}, nil
			},
			revokeFamilyFn: func(ctx context.Context, familyID TokenFamilyID, n time.Time) error {
				if familyID == "tfm_compromised" {
					familyRevoked = true
				}
				return nil
			},
		}

		svc := NewService(Dependencies{SessionStore: sStore})
		res, err := svc.RotateSession(ctx, &RotateSessionRequest{
			RefreshTokenHash: []byte("used_hash"),
			SuccessorHash:    []byte("new_hash"),
			ExpiresAt:        now.Add(time.Hour),
		})
		if res != nil {
			t.Errorf("expected nil session, got %v", res)
		}
		if errors.CodeOf(err) != SessionReused {
			t.Errorf("expected SessionReused, got %v", errors.CodeOf(err))
		}
		if !familyRevoked {
			t.Error("expected token family to be revoked on reuse attack")
		}
	})

	t.Run("fails when session is already revoked", func(t *testing.T) {
		revokedAt := now.Add(-10 * time.Minute)
		sStore := &mockSessionStore{
			getByRefreshTokenHashFn: func(ctx context.Context, hash []byte) (*Session, error) {
				return &Session{
					ID:            "ses_1",
					TokenFamilyID: "tfm_1",
					RevokedAt:     &revokedAt,
				}, nil
			},
		}

		svc := NewService(Dependencies{SessionStore: sStore})
		res, err := svc.RotateSession(ctx, &RotateSessionRequest{
			RefreshTokenHash: []byte("hash"),
			SuccessorHash:    []byte("new_hash"),
			ExpiresAt:        now.Add(time.Hour),
		})
		if res != nil {
			t.Errorf("expected nil session, got %v", res)
		}
		if errors.CodeOf(err) != SessionRevoked {
			t.Errorf("expected SessionRevoked, got %v", errors.CodeOf(err))
		}
	})

	t.Run("fails when session is expired", func(t *testing.T) {
		sStore := &mockSessionStore{
			getByRefreshTokenHashFn: func(ctx context.Context, hash []byte) (*Session, error) {
				return &Session{
					ID:            "ses_1",
					TokenFamilyID: "tfm_1",
					ExpiresAt:     now.Add(-time.Minute),
				}, nil
			},
		}

		svc := NewService(Dependencies{SessionStore: sStore})
		res, err := svc.RotateSession(ctx, &RotateSessionRequest{
			RefreshTokenHash: []byte("hash"),
			SuccessorHash:    []byte("new_hash"),
			ExpiresAt:        now.Add(time.Hour),
		})
		if res != nil {
			t.Errorf("expected nil session, got %v", res)
		}
		if errors.CodeOf(err) != SessionExpired {
			t.Errorf("expected SessionExpired, got %v", errors.CodeOf(err))
		}
	})

	t.Run("rotates successfully and persists old and successor", func(t *testing.T) {
		oldUpdated := false
		successorCreated := false

		sStore := &mockSessionStore{
			getByRefreshTokenHashFn: func(ctx context.Context, hash []byte) (*Session, error) {
				return &Session{
					ID:                "ses_1",
					UserID:            "usr_1",
					TokenFamilyID:     "tfm_1",
					ExpiresAt:         now.Add(time.Hour),
					AbsoluteExpiresAt: now.Add(24 * time.Hour),
				}, nil
			},
			updateFn: func(ctx context.Context, session *Session) error {
				if session.ID == "ses_1" && session.IsReplaced() {
					oldUpdated = true
				}
				return nil
			},
			createFn: func(ctx context.Context, session *Session) error {
				if session.UserID == "usr_1" && session.TokenFamilyID == "tfm_1" && *session.ParentSessionID == "ses_1" {
					successorCreated = true
				}
				return nil
			},
		}

		svc := NewService(Dependencies{SessionStore: sStore})
		successor, err := svc.RotateSession(ctx, &RotateSessionRequest{
			RefreshTokenHash: []byte("hash"),
			SuccessorHash:    []byte("new_hash"),
			ExpiresAt:        now.Add(2 * time.Hour),
			UserAgent:        "test-agent",
			IPAddress:        "127.0.0.1",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if successor == nil {
			t.Fatal("expected successor session, got nil")
		}
		if !oldUpdated {
			t.Error("expected old session to be updated with replaced status")
		}
		if !successorCreated {
			t.Error("expected successor session to be created")
		}
	})
}

func TestService_RevokeSessionByID(t *testing.T) {
	ctx := context.Background()
	now := time.Now()

	t.Run("fails when session does not belong to user", func(t *testing.T) {
		sStore := &mockSessionStore{
			getByIDFn: func(ctx context.Context, id SessionID) (*Session, error) {
				return &Session{
					ID:     id,
					UserID: "usr_other",
				}, nil
			},
		}

		svc := NewService(Dependencies{SessionStore: sStore})
		err := svc.RevokeSessionByID(ctx, "ses_1", "usr_attacker")
		if err == nil {
			t.Fatal("expected permission error, got nil")
		}
		if errors.KindOf(err) != errors.Permission {
			t.Errorf("expected KindPermission, got %v", errors.KindOf(err))
		}
	})

	t.Run("revokes and updates when session belongs to user", func(t *testing.T) {
		updated := false
		sStore := &mockSessionStore{
			getByIDFn: func(ctx context.Context, id SessionID) (*Session, error) {
				return &Session{
					ID:     id,
					UserID: "usr_1",
				}, nil
			},
			updateFn: func(ctx context.Context, session *Session) error {
				if session.ID == "ses_1" && session.IsRevoked() {
					updated = true
				}
				return nil
			},
		}

		svc := NewService(Dependencies{SessionStore: sStore})
		err := svc.RevokeSessionByID(ctx, "ses_1", "usr_1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !updated {
			t.Error("expected session to be marked revoked and updated")
		}
	})

	t.Run("is idempotent when already revoked", func(t *testing.T) {
		revokedAt := now.Add(-time.Hour)
		updated := false
		sStore := &mockSessionStore{
			getByIDFn: func(ctx context.Context, id SessionID) (*Session, error) {
				return &Session{
					ID:        id,
					UserID:    "usr_1",
					RevokedAt: &revokedAt,
				}, nil
			},
			updateFn: func(ctx context.Context, session *Session) error {
				updated = true
				return nil
			},
		}

		svc := NewService(Dependencies{SessionStore: sStore})
		err := svc.RevokeSessionByID(ctx, "ses_1", "usr_1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if updated {
			t.Error("expected no update call when already revoked")
		}
	})
	t.Run("revokes linked device when session has device_id", func(t *testing.T) {
		devID := DeviceID("dev_123")
		deviceRevoked := false
		sStore := &mockSessionStore{
			getByIDFn: func(ctx context.Context, id SessionID) (*Session, error) {
				return &Session{
					ID:       id,
					UserID:   "usr_1",
					DeviceID: &devID,
				}, nil
			},
			updateFn: func(ctx context.Context, session *Session) error {
				return nil
			},
		}
		dStore := &DeviceStoreMock{
			RevokeDeviceFunc: func(ctx context.Context, id DeviceID, revokedAt time.Time) error {
				if id == "dev_123" {
					deviceRevoked = true
				}
				return nil
			},
		}

		svc := NewService(Dependencies{SessionStore: sStore, DeviceStore: dStore})
		err := svc.RevokeSessionByID(ctx, "ses_1", "usr_1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !deviceRevoked {
			t.Error("expected linked device to be revoked when session is revoked by ID")
		}
	})
}

func TestService_RevokeSessionByHash(t *testing.T) {
	ctx := context.Background()

	t.Run("finds session and revokes family", func(t *testing.T) {
		familyRevoked := false
		sStore := &mockSessionStore{
			getByRefreshTokenHashFn: func(ctx context.Context, hash []byte) (*Session, error) {
				return &Session{
					ID:            "ses_1",
					TokenFamilyID: "tfm_1",
				}, nil
			},
			revokeFamilyFn: func(ctx context.Context, familyID TokenFamilyID, now time.Time) error {
				if familyID == "tfm_1" {
					familyRevoked = true
				}
				return nil
			},
		}

		svc := NewService(Dependencies{SessionStore: sStore})
		err := svc.RevokeSessionByHash(ctx, []byte("hash"))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !familyRevoked {
			t.Error("expected token family to be revoked")
		}
	})

	t.Run("revokes linked device when session has device_id", func(t *testing.T) {
		devID := DeviceID("dev_123")
		deviceRevoked := false
		sStore := &mockSessionStore{
			getByRefreshTokenHashFn: func(ctx context.Context, hash []byte) (*Session, error) {
				return &Session{
					ID:            "ses_1",
					TokenFamilyID: "tfm_1",
					DeviceID:      &devID,
				}, nil
			},
			revokeFamilyFn: func(ctx context.Context, familyID TokenFamilyID, now time.Time) error {
				return nil
			},
		}
		dStore := &DeviceStoreMock{
			RevokeDeviceFunc: func(ctx context.Context, id DeviceID, revokedAt time.Time) error {
				if id == "dev_123" {
					deviceRevoked = true
				}
				return nil
			},
		}

		svc := NewService(Dependencies{SessionStore: sStore, DeviceStore: dStore})
		err := svc.RevokeSessionByHash(ctx, []byte("hash"))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !deviceRevoked {
			t.Error("expected linked device to be revoked when session is revoked by hash")
		}
	})
}

func TestService_RevokeAllSessions(t *testing.T) {
	ctx := context.Background()

	t.Run("revokes all sessions and all devices for user", func(t *testing.T) {
		authVersionIncremented := false
		sessionsRevoked := false
		devicesRevoked := false

		uStore := &mockUserStore{
			incrementAuthVersionFn: func(ctx context.Context, id UserID) (int64, error) {
				if id == "usr_1" {
					authVersionIncremented = true
				}
				return 2, nil
			},
		}
		sStore := &mockSessionStore{
			revokeAllForUserFn: func(ctx context.Context, userID UserID, now time.Time) error {
				if userID == "usr_1" {
					sessionsRevoked = true
				}
				return nil
			},
		}
		dStore := &DeviceStoreMock{
			RevokeAllByUserIDFunc: func(ctx context.Context, userID UserID, revokedAt time.Time) error {
				if userID == "usr_1" {
					devicesRevoked = true
				}
				return nil
			},
		}

		svc := NewService(Dependencies{UserStore: uStore, SessionStore: sStore, DeviceStore: dStore})
		v, err := svc.RevokeAllSessions(ctx, "usr_1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if v != 2 {
			t.Errorf("expected version 2, got %d", v)
		}
		if !authVersionIncremented {
			t.Error("expected auth version to be incremented")
		}
		if !sessionsRevoked {
			t.Error("expected sessions to be revoked for user")
		}
		if !devicesRevoked {
			t.Error("expected devices to be revoked for user")
		}
	})
}

func TestService_ListActiveSessions(t *testing.T) {
	ctx := context.Background()

	t.Run("delegates to session store ListActiveSessions", func(t *testing.T) {
		sStore := &mockSessionStore{
			listActiveSessionsFn: func(ctx context.Context, userID UserID) ([]*Session, error) {
				return []*Session{
					{ID: "ses_1", UserID: userID},
				}, nil
			},
		}

		svc := NewService(Dependencies{SessionStore: sStore})
		sessions, err := svc.ListActiveSessions(ctx, "usr_1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(sessions) != 1 || sessions[0].ID != "ses_1" {
			t.Errorf("unexpected sessions: %+v", sessions)
		}
	})
}

func TestService_Credentials(t *testing.T) {
	ctx := context.Background()

	t.Run("CreateCredential", func(t *testing.T) {
		tests := []struct {
			name        string
			cred        *Credential
			setupStore  func(m *CredentialStoreProviderMock)
			expectedErr bool
			expectKind  errors.Kind
		}{
			{
				name: "Credential already exists",
				cred: &Credential{UserID: "usr_1", AuthType: "password"},
				setupStore: func(m *CredentialStoreProviderMock) {
					m.GetByUserIDAndAuthTypeFunc = func(ctx context.Context, userID UserID, authType string) (*Credential, error) {
						return &Credential{UserID: userID, AuthType: authType}, nil
					}
				},
				expectedErr: true,
				expectKind:  errors.Exist,
			},
			{
				name: "Store create failure",
				cred: &Credential{UserID: "usr_1", AuthType: "password"},
				setupStore: func(m *CredentialStoreProviderMock) {
					m.GetByUserIDAndAuthTypeFunc = func(ctx context.Context, userID UserID, authType string) (*Credential, error) {
						return nil, errors.E(errors.NotExist)
					}
					m.CreateFunc = func(ctx context.Context, credential *Credential) error {
						return errors.New("db error")
					}
				},
				expectedErr: true,
			},
			{
				name: "Successful creation",
				cred: &Credential{UserID: "usr_1", AuthType: "password"},
				setupStore: func(m *CredentialStoreProviderMock) {
					m.GetByUserIDAndAuthTypeFunc = func(ctx context.Context, userID UserID, authType string) (*Credential, error) {
						return nil, errors.E(errors.NotExist)
					}
					m.CreateFunc = func(ctx context.Context, credential *Credential) error {
						return nil
					}
				},
				expectedErr: false,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				cStore := &CredentialStoreProviderMock{}
				if tc.setupStore != nil {
					tc.setupStore(cStore)
				}
				svc := NewService(Dependencies{CredentialStore: cStore})
				err := svc.CreateCredential(ctx, tc.cred)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if tc.expectKind != 0 && errors.KindOf(err) != tc.expectKind {
						t.Errorf("expected kind %v, got %v", tc.expectKind, errors.KindOf(err))
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			})
		}
	})

	t.Run("UpdateCredential", func(t *testing.T) {
		tests := []struct {
			name        string
			cred        *Credential
			setupStore  func(m *CredentialStoreProviderMock)
			expectedErr bool
		}{
			{
				name: "Store update error",
				cred: &Credential{UserID: "usr_1"},
				setupStore: func(m *CredentialStoreProviderMock) {
					m.UpdateFunc = func(ctx context.Context, credential *Credential) error {
						return errors.New("db error")
					}
				},
				expectedErr: true,
			},
			{
				name: "Successful update",
				cred: &Credential{UserID: "usr_1"},
				setupStore: func(m *CredentialStoreProviderMock) {
					m.UpdateFunc = func(ctx context.Context, credential *Credential) error {
						return nil
					}
				},
				expectedErr: false,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				cStore := &CredentialStoreProviderMock{}
				if tc.setupStore != nil {
					tc.setupStore(cStore)
				}
				svc := NewService(Dependencies{CredentialStore: cStore})
				err := svc.UpdateCredential(ctx, tc.cred)
				if tc.expectedErr && err == nil {
					t.Fatal("expected error, got nil")
				}
				if !tc.expectedErr && err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			})
		}
	})

	t.Run("GetCredentialByUserIDAndAuthType", func(t *testing.T) {
		tests := []struct {
			name        string
			userID      UserID
			authType    string
			setupStore  func(m *CredentialStoreProviderMock)
			expectedErr bool
			expectKind  errors.Kind
		}{
			{
				name:     "Success",
				userID:   "usr_1",
				authType: "password",
				setupStore: func(m *CredentialStoreProviderMock) {
					m.GetByUserIDAndAuthTypeFunc = func(ctx context.Context, userID UserID, authType string) (*Credential, error) {
						return &Credential{UserID: userID, AuthType: authType}, nil
					}
				},
				expectedErr: false,
			},
			{
				name:     "Not found",
				userID:   "usr_1",
				authType: "password",
				setupStore: func(m *CredentialStoreProviderMock) {
					m.GetByUserIDAndAuthTypeFunc = func(ctx context.Context, userID UserID, authType string) (*Credential, error) {
						return nil, errors.E(errors.NotExist)
					}
				},
				expectedErr: true,
				expectKind:  errors.NotExist,
			},
			{
				name:     "Store error",
				userID:   "usr_1",
				authType: "password",
				setupStore: func(m *CredentialStoreProviderMock) {
					m.GetByUserIDAndAuthTypeFunc = func(ctx context.Context, userID UserID, authType string) (*Credential, error) {
						return nil, errors.New("db error")
					}
				},
				expectedErr: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				cStore := &CredentialStoreProviderMock{}
				if tc.setupStore != nil {
					tc.setupStore(cStore)
				}
				svc := NewService(Dependencies{CredentialStore: cStore})
				cred, err := svc.GetCredentialByUserIDAndAuthType(ctx, tc.userID, tc.authType)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if tc.expectKind != 0 && errors.KindOf(err) != tc.expectKind {
						t.Errorf("expected kind %v, got %v", tc.expectKind, errors.KindOf(err))
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if cred == nil || cred.UserID != tc.userID {
					t.Errorf("unexpected credential: %+v", cred)
				}
			})
		}
	})
}

func TestService_UserManagement(t *testing.T) {
	ctx := context.Background()

	t.Run("GetUserByID", func(t *testing.T) {
		tests := []struct {
			name        string
			id          UserID
			setupStore  func(m *UserStoreProviderMock)
			expectedErr bool
			expectKind  errors.Kind
		}{
			{
				name: "Success",
				id:   "usr_1",
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return &User{ID: id}, nil
					}
				},
				expectedErr: false,
			},
			{
				name: "Not found",
				id:   "usr_not_found",
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return nil, errors.E(errors.NotExist)
					}
				},
				expectedErr: true,
				expectKind:  errors.NotExist,
			},
			{
				name: "Generic error",
				id:   "usr_err",
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return nil, errors.New("db error")
					}
				},
				expectedErr: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				uStore := &UserStoreProviderMock{}
				if tc.setupStore != nil {
					tc.setupStore(uStore)
				}
				svc := NewService(Dependencies{UserStore: uStore})
				u, err := svc.GetUserByID(ctx, tc.id)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if tc.expectKind != 0 && errors.KindOf(err) != tc.expectKind {
						t.Errorf("expected kind %v, got %v", tc.expectKind, errors.KindOf(err))
					}
					return
				}
				if err != nil || u == nil {
					t.Fatalf("unexpected result: u=%v, err=%v", u, err)
				}
			})
		}
	})

	t.Run("UpdateUser", func(t *testing.T) {
		tests := []struct {
			name        string
			setupStore  func(m *UserStoreProviderMock)
			expectedErr bool
			expectKind  errors.Kind
		}{
			{
				name: "Success",
				setupStore: func(m *UserStoreProviderMock) {
					m.UpdateFunc = func(ctx context.Context, user *User) error {
						return nil
					}
				},
				expectedErr: false,
			},
			{
				name: "Conflict / VersionMismatch",
				setupStore: func(m *UserStoreProviderMock) {
					m.UpdateFunc = func(ctx context.Context, user *User) error {
						return errors.E(errors.Conflict)
					}
				},
				expectedErr: true,
				expectKind:  errors.Conflict,
			},
			{
				name: "Store error",
				setupStore: func(m *UserStoreProviderMock) {
					m.UpdateFunc = func(ctx context.Context, user *User) error {
						return errors.New("db error")
					}
				},
				expectedErr: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				uStore := &UserStoreProviderMock{}
				if tc.setupStore != nil {
					tc.setupStore(uStore)
				}
				svc := NewService(Dependencies{UserStore: uStore})
				err := svc.UpdateUser(ctx, &User{ID: "usr_1"})
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if tc.expectKind != 0 && errors.KindOf(err) != tc.expectKind {
						t.Errorf("expected kind %v, got %v", tc.expectKind, errors.KindOf(err))
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			})
		}
	})

	t.Run("ListUsers", func(t *testing.T) {
		tests := []struct {
			name             string
			filter           ListUsersFilter
			setupStore       func(m *UserStoreProviderMock)
			expectedPageSize int32
			expectedErr      bool
		}{
			{
				name:   "Default PageSize when 0",
				filter: ListUsersFilter{PageSize: 0},
				setupStore: func(m *UserStoreProviderMock) {
					m.GetUsersFunc = func(ctx context.Context, filter *ListUsersFilter) (*paging.Page[*User], error) {
						return &paging.Page[*User]{Items: []*User{{ID: "usr_1"}}}, nil
					}
				},
				expectedPageSize: 20,
				expectedErr:      false,
			},
			{
				name:   "Default PageSize when > 100",
				filter: ListUsersFilter{PageSize: 200},
				setupStore: func(m *UserStoreProviderMock) {
					m.GetUsersFunc = func(ctx context.Context, filter *ListUsersFilter) (*paging.Page[*User], error) {
						return &paging.Page[*User]{Items: []*User{{ID: "usr_1"}}}, nil
					}
				},
				expectedPageSize: 20,
				expectedErr:      false,
			},
			{
				name:   "Store error",
				filter: ListUsersFilter{PageSize: 10},
				setupStore: func(m *UserStoreProviderMock) {
					m.GetUsersFunc = func(ctx context.Context, filter *ListUsersFilter) (*paging.Page[*User], error) {
						return nil, errors.New("db error")
					}
				},
				expectedPageSize: 10,
				expectedErr:      true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				var capturedFilter ListUsersFilter
				uStore := &UserStoreProviderMock{}
				if tc.setupStore != nil {
					tc.setupStore(uStore)
					origGetUsers := uStore.GetUsersFunc
					uStore.GetUsersFunc = func(ctx context.Context, filter *ListUsersFilter) (*paging.Page[*User], error) {
						capturedFilter = *filter
						return origGetUsers(ctx, filter)
					}
				}
				svc := NewService(Dependencies{UserStore: uStore})
				page, err := svc.ListUsers(ctx, &tc.filter)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil || page == nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if capturedFilter.PageSize != tc.expectedPageSize {
					t.Errorf("expected page size %d, got %d", tc.expectedPageSize, capturedFilter.PageSize)
				}
			})
		}
	})

	t.Run("ApproveUser", func(t *testing.T) {
		tests := []struct {
			name        string
			userID      UserID
			setupStore  func(m *UserStoreProviderMock)
			expectedErr bool
			expectCode  errors.Code
		}{
			{
				name:   "User not found",
				userID: "usr_not_found",
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return nil, errors.E(errors.NotExist)
					}
				},
				expectedErr: true,
			},
			{
				name:   "User not in pending state",
				userID: "usr_active",
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return &User{ID: id, Status: UserStatusActive}, nil
					}
				},
				expectedErr: true,
				expectCode:  AccountPending,
			},
			{
				name:   "Update failure",
				userID: "usr_pending",
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return &User{ID: id, Status: UserStatusPendingApproval}, nil
					}
					m.UpdateFunc = func(ctx context.Context, user *User) error {
						return errors.New("db error")
					}
				},
				expectedErr: true,
			},
			{
				name:   "Success",
				userID: "usr_pending",
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return &User{ID: id, Status: UserStatusPendingApproval}, nil
					}
					m.UpdateFunc = func(ctx context.Context, user *User) error {
						return nil
					}
				},
				expectedErr: false,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				uStore := &UserStoreProviderMock{}
				if tc.setupStore != nil {
					tc.setupStore(uStore)
				}
				svc := NewService(Dependencies{UserStore: uStore})
				u, err := svc.ApproveUser(ctx, tc.userID)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if tc.expectCode != "" && errors.CodeOf(err) != tc.expectCode {
						t.Errorf("expected code %v, got %v", tc.expectCode, errors.CodeOf(err))
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if u.Status != UserStatusActive {
					t.Errorf("expected status %s, got %s", UserStatusActive, u.Status)
				}
			})
		}
	})

	t.Run("RejectUser", func(t *testing.T) {
		tests := []struct {
			name        string
			userID      UserID
			setupStore  func(m *UserStoreProviderMock)
			expectedErr bool
			expectCode  errors.Code
		}{
			{
				name:   "User not found",
				userID: "usr_not_found",
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return nil, errors.E(errors.NotExist)
					}
				},
				expectedErr: true,
			},
			{
				name:   "User not in pending state",
				userID: "usr_active",
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return &User{ID: id, Status: UserStatusActive}, nil
					}
				},
				expectedErr: true,
				expectCode:  AccountPending,
			},
			{
				name:   "Update failure",
				userID: "usr_pending",
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return &User{ID: id, Status: UserStatusPendingApproval}, nil
					}
					m.UpdateFunc = func(ctx context.Context, user *User) error {
						return errors.New("db error")
					}
				},
				expectedErr: true,
			},
			{
				name:   "Success",
				userID: "usr_pending",
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return &User{ID: id, Status: UserStatusPendingApproval}, nil
					}
					m.UpdateFunc = func(ctx context.Context, user *User) error {
						return nil
					}
				},
				expectedErr: false,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				uStore := &UserStoreProviderMock{}
				if tc.setupStore != nil {
					tc.setupStore(uStore)
				}
				svc := NewService(Dependencies{UserStore: uStore})
				u, err := svc.RejectUser(ctx, tc.userID)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if tc.expectCode != "" && errors.CodeOf(err) != tc.expectCode {
						t.Errorf("expected code %v, got %v", tc.expectCode, errors.CodeOf(err))
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if u.Status != UserStatusInactive {
					t.Errorf("expected status %s, got %s", UserStatusInactive, u.Status)
				}
			})
		}
	})

	t.Run("UpdateUserRole", func(t *testing.T) {
		tests := []struct {
			name        string
			userID      UserID
			role        AccessLevel
			setupStore  func(m *UserStoreProviderMock)
			expectedErr bool
			expectKind  errors.Kind
		}{
			{
				name:   "User not found",
				userID: "usr_not_found",
				role:   AccessLevelAdmin,
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return nil, errors.E(errors.NotExist)
					}
				},
				expectedErr: true,
			},
			{
				name:   "Invalid access level",
				userID: "usr_1",
				role:   "superadmin",
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return &User{ID: id}, nil
					}
				},
				expectedErr: true,
				expectKind:  errors.Invalid,
			},
			{
				name:   "Update error",
				userID: "usr_1",
				role:   AccessLevelAdmin,
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return &User{ID: id}, nil
					}
					m.UpdateFunc = func(ctx context.Context, user *User) error {
						return errors.New("db error")
					}
				},
				expectedErr: true,
			},
			{
				name:   "Success to admin",
				userID: "usr_1",
				role:   AccessLevelAdmin,
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return &User{ID: id, AccessLevel: AccessLevelUser}, nil
					}
					m.UpdateFunc = func(ctx context.Context, user *User) error {
						return nil
					}
				},
				expectedErr: false,
			},
			{
				name:   "Success to user",
				userID: "usr_1",
				role:   AccessLevelUser,
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return &User{ID: id, AccessLevel: AccessLevelAdmin}, nil
					}
					m.UpdateFunc = func(ctx context.Context, user *User) error {
						return nil
					}
				},
				expectedErr: false,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				uStore := &UserStoreProviderMock{}
				if tc.setupStore != nil {
					tc.setupStore(uStore)
				}
				svc := NewService(Dependencies{UserStore: uStore})
				u, err := svc.UpdateUserRole(ctx, tc.userID, tc.role)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if tc.expectKind != 0 && errors.KindOf(err) != tc.expectKind {
						t.Errorf("expected kind %v, got %v", tc.expectKind, errors.KindOf(err))
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if u.AccessLevel != tc.role {
					t.Errorf("expected role %s, got %s", tc.role, u.AccessLevel)
				}
			})
		}
	})

	t.Run("GetUserByEmail and GetUserByUsername", func(t *testing.T) {
		tests := []struct {
			name        string
			email       string
			username    string
			byEmail     bool
			setupStore  func(m *UserStoreProviderMock)
			expectedErr bool
			expectKind  errors.Kind
		}{
			{
				name:    "Email found",
				email:   "user@example.com",
				byEmail: true,
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByEmailFunc = func(ctx context.Context, email string) (*User, error) {
						return &User{ID: "usr_1", Email: email}, nil
					}
				},
				expectedErr: false,
			},
			{
				name:    "Email not found",
				email:   "missing@example.com",
				byEmail: true,
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByEmailFunc = func(ctx context.Context, email string) (*User, error) {
						return nil, errors.E(errors.NotExist)
					}
				},
				expectedErr: true,
				expectKind:  errors.NotExist,
			},
			{
				name:    "Email store error",
				email:   "err@example.com",
				byEmail: true,
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByEmailFunc = func(ctx context.Context, email string) (*User, error) {
						return nil, errors.New("db error")
					}
				},
				expectedErr: true,
			},
			{
				name:     "Username found",
				username: "myuser",
				byEmail:  false,
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByUsernameFunc = func(ctx context.Context, username string) (*User, error) {
						return &User{ID: "usr_1", Username: username}, nil
					}
				},
				expectedErr: false,
			},
			{
				name:     "Username not found",
				username: "missinguser",
				byEmail:  false,
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByUsernameFunc = func(ctx context.Context, username string) (*User, error) {
						return nil, errors.E(errors.NotExist)
					}
				},
				expectedErr: true,
				expectKind:  errors.NotExist,
			},
			{
				name:     "Username store error",
				username: "erruser",
				byEmail:  false,
				setupStore: func(m *UserStoreProviderMock) {
					m.GetByUsernameFunc = func(ctx context.Context, username string) (*User, error) {
						return nil, errors.New("db error")
					}
				},
				expectedErr: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				uStore := &UserStoreProviderMock{}
				if tc.setupStore != nil {
					tc.setupStore(uStore)
				}
				svc := NewService(Dependencies{UserStore: uStore})
				var u *User
				var err error
				if tc.byEmail {
					u, err = svc.GetUserByEmail(ctx, tc.email)
				} else {
					u, err = svc.GetUserByUsername(ctx, tc.username)
				}
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if tc.expectKind != 0 && errors.KindOf(err) != tc.expectKind {
						t.Errorf("expected kind %v, got %v", tc.expectKind, errors.KindOf(err))
					}
					return
				}
				if err != nil || u == nil {
					t.Fatalf("unexpected error: %v", err)
				}
			})
		}
	})

	t.Run("GetAuthVersion", func(t *testing.T) {
		uStore := &UserStoreProviderMock{
			GetAuthVersionFunc: func(ctx context.Context, id UserID) (int64, error) {
				return 42, nil
			},
		}
		svc := NewService(Dependencies{UserStore: uStore})
		v, err := svc.GetAuthVersion(ctx, "usr_1")
		if err != nil || v != 42 {
			t.Fatalf("expected 42, got %d (err: %v)", v, err)
		}
	})
}

func TestService_Authenticate_EdgeCases(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name        string
		identifier  string
		password    string
		setup       func(u *UserStoreProviderMock, c *CredentialStoreProviderMock, h *HasherMock)
		expectedErr bool
		expectCode  errors.Code
	}{
		{
			name:       "Account suspended",
			identifier: "suspended@example.com",
			password:   "pass",
			setup: func(u *UserStoreProviderMock, c *CredentialStoreProviderMock, h *HasherMock) {
				u.GetByEmailFunc = func(ctx context.Context, email string) (*User, error) {
					return &User{ID: "usr_1", Email: email, Status: UserStatusSuspended}, nil
				}
			},
			expectedErr: true,
			expectCode:  AccountSuspended,
		},
		{
			name:       "Account inactive",
			identifier: "inactive@example.com",
			password:   "pass",
			setup: func(u *UserStoreProviderMock, c *CredentialStoreProviderMock, h *HasherMock) {
				u.GetByEmailFunc = func(ctx context.Context, email string) (*User, error) {
					return &User{ID: "usr_1", Email: email, Status: UserStatusInactive}, nil
				}
			},
			expectedErr: true,
			expectCode:  AccountInactive,
		},
		{
			name:       "Username fallback authentication success",
			identifier: "john_doe",
			password:   "CorrectPass123!",
			setup: func(u *UserStoreProviderMock, c *CredentialStoreProviderMock, h *HasherMock) {
				u.GetByEmailFunc = func(ctx context.Context, email string) (*User, error) {
					return nil, errors.E(errors.NotExist)
				}
				u.GetByUsernameFunc = func(ctx context.Context, username string) (*User, error) {
					return &User{ID: "usr_1", Username: username, Status: UserStatusActive}, nil
				}
				c.GetByUserIDAndAuthTypeFunc = func(ctx context.Context, userID UserID, authType string) (*Credential, error) {
					return &Credential{UserID: userID, SecretData: "hash"}, nil
				}
				h.VerifyFunc = func(encodedHash, raw string) (bool, error) {
					return false, nil
				}
			},
			expectedErr: false,
		},
		{
			name:       "User not found anywhere",
			identifier: "nonexistent",
			password:   "pass",
			setup: func(u *UserStoreProviderMock, c *CredentialStoreProviderMock, h *HasherMock) {
				u.GetByEmailFunc = func(ctx context.Context, email string) (*User, error) {
					return nil, errors.E(errors.NotExist)
				}
				u.GetByUsernameFunc = func(ctx context.Context, username string) (*User, error) {
					return nil, errors.E(errors.NotExist)
				}
			},
			expectedErr: true,
			expectCode:  InvalidCredentials,
		},
		{
			name:       "Email lookup error non-NotExist",
			identifier: "error@example.com",
			password:   "pass",
			setup: func(u *UserStoreProviderMock, c *CredentialStoreProviderMock, h *HasherMock) {
				u.GetByEmailFunc = func(ctx context.Context, email string) (*User, error) {
					return nil, errors.New("db error")
				}
			},
			expectedErr: true,
		},
		{
			name:       "Missing password credential",
			identifier: "user@example.com",
			password:   "pass",
			setup: func(u *UserStoreProviderMock, c *CredentialStoreProviderMock, h *HasherMock) {
				u.GetByEmailFunc = func(ctx context.Context, email string) (*User, error) {
					return &User{ID: "usr_1", Email: email, Status: UserStatusActive}, nil
				}
				c.GetByUserIDAndAuthTypeFunc = func(ctx context.Context, userID UserID, authType string) (*Credential, error) {
					return nil, errors.New("no cred")
				}
			},
			expectedErr: true,
			expectCode:  InvalidCredentials,
		},
		{
			name:       "Hasher internal error",
			identifier: "user@example.com",
			password:   "pass",
			setup: func(u *UserStoreProviderMock, c *CredentialStoreProviderMock, h *HasherMock) {
				u.GetByEmailFunc = func(ctx context.Context, email string) (*User, error) {
					return &User{ID: "usr_1", Email: email, Status: UserStatusActive}, nil
				}
				c.GetByUserIDAndAuthTypeFunc = func(ctx context.Context, userID UserID, authType string) (*Credential, error) {
					return &Credential{UserID: userID, SecretData: "hash"}, nil
				}
				h.VerifyFunc = func(encodedHash, raw string) (bool, error) {
					return false, errors.New("crypto failure")
				}
			},
			expectedErr: true,
			expectCode:  InvalidCredentials,
		},
		{
			name:       "Password mismatch",
			identifier: "user@example.com",
			password:   "wrongpass",
			setup: func(u *UserStoreProviderMock, c *CredentialStoreProviderMock, h *HasherMock) {
				u.GetByEmailFunc = func(ctx context.Context, email string) (*User, error) {
					return &User{ID: "usr_1", Email: email, Status: UserStatusActive}, nil
				}
				c.GetByUserIDAndAuthTypeFunc = func(ctx context.Context, userID UserID, authType string) (*Credential, error) {
					return &Credential{UserID: userID, SecretData: "hash"}, nil
				}
				h.VerifyFunc = func(encodedHash, raw string) (bool, error) {
					return false, password.ErrPasswordMismatch
				}
			},
			expectedErr: true,
			expectCode:  InvalidCredentials,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			uStore := &UserStoreProviderMock{}
			cStore := &CredentialStoreProviderMock{}
			hasher := &HasherMock{}
			if tc.setup != nil {
				tc.setup(uStore, cStore, hasher)
			}
			svc := NewService(Dependencies{UserStore: uStore, CredentialStore: cStore, Hasher: hasher})
			u, err := svc.Authenticate(ctx, tc.identifier, tc.password)
			if tc.expectedErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tc.expectCode != "" && errors.CodeOf(err) != tc.expectCode {
					t.Errorf("expected code %v, got %v", tc.expectCode, errors.CodeOf(err))
				}
				return
			}
			if err != nil || u == nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestService_SessionsAndEvents(t *testing.T) {
	ctx := context.Background()

	t.Run("CreateSession", func(t *testing.T) {
		tests := []struct {
			name        string
			setupStore  func(m *SessionStoreProviderMock)
			expectedErr bool
		}{
			{
				name: "Success",
				setupStore: func(m *SessionStoreProviderMock) {
					m.CreateFunc = func(ctx context.Context, session *Session) error {
						return nil
					}
				},
				expectedErr: false,
			},
			{
				name: "Store create failure",
				setupStore: func(m *SessionStoreProviderMock) {
					m.CreateFunc = func(ctx context.Context, session *Session) error {
						return errors.New("db error")
					}
				},
				expectedErr: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				sStore := &SessionStoreProviderMock{}
				if tc.setupStore != nil {
					tc.setupStore(sStore)
				}
				svc := NewService(Dependencies{SessionStore: sStore})
				ses, err := svc.CreateSession(ctx, &CreateSessionRequest{
					UserID:           "usr_1",
					RefreshTokenHash: []byte("hash"),
					ExpiresAt:        time.Now().Add(time.Hour),
				})
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil || ses == nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if ses.UserID != "usr_1" || ses.ID == "" || ses.TokenFamilyID == "" {
					t.Errorf("invalid session created: %+v", ses)
				}
			})
		}
	})

	t.Run("UpdateLockoutState", func(t *testing.T) {
		tests := []struct {
			name        string
			setupStore  func(m *UserStoreProviderMock)
			expectedErr bool
		}{
			{
				name: "Success",
				setupStore: func(m *UserStoreProviderMock) {
					m.UpdateLockoutStateFunc = func(ctx context.Context, req UpdateLockoutRequest) error {
						return nil
					}
				},
				expectedErr: false,
			},
			{
				name: "Store failure",
				setupStore: func(m *UserStoreProviderMock) {
					m.UpdateLockoutStateFunc = func(ctx context.Context, req UpdateLockoutRequest) error {
						return errors.New("db error")
					}
				},
				expectedErr: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				uStore := &UserStoreProviderMock{}
				if tc.setupStore != nil {
					tc.setupStore(uStore)
				}
				svc := NewService(Dependencies{UserStore: uStore})
				err := svc.UpdateLockoutState(ctx, UpdateLockoutRequest{UserID: "usr_1", Attempts: 3})
				if tc.expectedErr && err == nil {
					t.Fatal("expected error, got nil")
				}
				if !tc.expectedErr && err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			})
		}
	})

	t.Run("CreateSecurityEvent and ListSecurityEvents", func(t *testing.T) {
		tests := []struct {
			name        string
			setupStore  func(m *SecurityEventStoreMock)
			expectedErr bool
		}{
			{
				name: "Success",
				setupStore: func(m *SecurityEventStoreMock) {
					m.CreateFunc = func(ctx context.Context, event *SecurityEvent) error {
						return nil
					}
					m.ListFunc = func(ctx context.Context, filter SecurityEventFilter) (*paging.Page[*SecurityEvent], error) {
						return &paging.Page[*SecurityEvent]{Items: []*SecurityEvent{{ID: "evt_1"}}}, nil
					}
				},
				expectedErr: false,
			},
			{
				name: "Store error",
				setupStore: func(m *SecurityEventStoreMock) {
					m.CreateFunc = func(ctx context.Context, event *SecurityEvent) error {
						return errors.New("db error")
					}
					m.ListFunc = func(ctx context.Context, filter SecurityEventFilter) (*paging.Page[*SecurityEvent], error) {
						return nil, errors.New("db error")
					}
				},
				expectedErr: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				secStore := &SecurityEventStoreMock{}
				if tc.setupStore != nil {
					tc.setupStore(secStore)
				}
				svc := NewService(Dependencies{SecurityEventStore: secStore})
				err := svc.CreateSecurityEvent(ctx, &SecurityEvent{ID: "evt_1"})
				if tc.expectedErr && err == nil {
					t.Fatal("expected create error, got nil")
				}
				if !tc.expectedErr && err != nil {
					t.Fatalf("unexpected create error: %v", err)
				}

				page, err := svc.ListSecurityEvents(ctx, SecurityEventFilter{})
				if tc.expectedErr && err == nil {
					t.Fatal("expected list error, got nil")
				}
				if !tc.expectedErr {
					if err != nil || page == nil || len(page.Items) != 1 {
						t.Fatalf("unexpected list result: page=%v, err=%v", page, err)
					}
				}
			})
		}
	})
}

func TestService_MFA(t *testing.T) {
	ctx := context.Background()

	t.Run("HasActiveMFA", func(t *testing.T) {
		tests := []struct {
			name           string
			mStore         *MFAFactorStoreMock
			expectedActive bool
			expectedCount  int
			expectedErr    bool
		}{
			{
				name:           "Nil MFAStore",
				mStore:         nil,
				expectedActive: false,
				expectedCount:  0,
				expectedErr:    false,
			},
			{
				name: "Store error",
				mStore: &MFAFactorStoreMock{
					ListFactorsByUserIDFunc: func(ctx context.Context, userID UserID) ([]*MFAFactor, error) {
						return nil, errors.New("db error")
					},
				},
				expectedErr: true,
			},
			{
				name: "No factors",
				mStore: &MFAFactorStoreMock{
					ListFactorsByUserIDFunc: func(ctx context.Context, userID UserID) ([]*MFAFactor, error) {
						return []*MFAFactor{}, nil
					},
				},
				expectedActive: false,
				expectedCount:  0,
				expectedErr:    false,
			},
			{
				name: "Has factors",
				mStore: &MFAFactorStoreMock{
					ListFactorsByUserIDFunc: func(ctx context.Context, userID UserID) ([]*MFAFactor, error) {
						return []*MFAFactor{{ID: "mfa_1"}}, nil
					},
				},
				expectedActive: true,
				expectedCount:  1,
				expectedErr:    false,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				var deps Dependencies
				if tc.mStore != nil {
					deps.MFAStore = tc.mStore
				}
				svc := NewService(deps)
				active, factors, err := svc.HasActiveMFA(ctx, "usr_1")
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if active != tc.expectedActive || len(factors) != tc.expectedCount {
					t.Errorf("expected active=%v, count=%d, got active=%v, count=%d", tc.expectedActive, tc.expectedCount, active, len(factors))
				}
			})
		}
	})

	t.Run("SetupTOTP", func(t *testing.T) {
		tests := []struct {
			name        string
			req         SetupTOTPRequest
			setup       func(u *UserStoreProviderMock, m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock)
			missingDeps bool
			expectedErr bool
			expectName  string
		}{
			{
				name:        "Missing dependencies",
				req:         SetupTOTPRequest{UserID: "usr_1"},
				missingDeps: true,
				expectedErr: true,
			},
			{
				name: "User not found",
				req:  SetupTOTPRequest{UserID: "usr_unknown"},
				setup: func(u *UserStoreProviderMock, m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					u.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return nil, errors.E(errors.NotExist)
					}
				},
				expectedErr: true,
			},
			{
				name: "GenerateSecret error",
				req:  SetupTOTPRequest{UserID: "usr_1"},
				setup: func(u *UserStoreProviderMock, m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					u.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return &User{ID: id, Email: "user@example.com"}, nil
					}
					totp.GenerateSecretFunc = func() (string, error) {
						return "", errors.New("entropy error")
					}
				},
				expectedErr: true,
			},
			{
				name: "Encrypt error",
				req:  SetupTOTPRequest{UserID: "usr_1"},
				setup: func(u *UserStoreProviderMock, m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					u.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return &User{ID: id, Email: "user@example.com"}, nil
					}
					totp.GenerateSecretFunc = func() (string, error) {
						return "SECRET", nil
					}
					c.EncryptFunc = func(plaintext string) (string, error) {
						return "", errors.New("encrypt error")
					}
				},
				expectedErr: true,
			},
			{
				name: "CreateFactor store error",
				req:  SetupTOTPRequest{UserID: "usr_1"},
				setup: func(u *UserStoreProviderMock, m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					u.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return &User{ID: id, Email: "user@example.com"}, nil
					}
					totp.GenerateSecretFunc = func() (string, error) { return "SECRET", nil }
					c.EncryptFunc = func(plaintext string) (string, error) { return "ENC", nil }
					m.CreateFactorFunc = func(ctx context.Context, factor *MFAFactor) error {
						return errors.New("db error")
					}
				},
				expectedErr: true,
			},
			{
				name: "Success with email account name",
				req:  SetupTOTPRequest{UserID: "usr_1", Name: "Phone"},
				setup: func(u *UserStoreProviderMock, m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					u.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return &User{ID: id, Email: "user@example.com", Username: "u1"}, nil
					}
					totp.GenerateSecretFunc = func() (string, error) { return "SECRET", nil }
					c.EncryptFunc = func(plaintext string) (string, error) { return "ENC", nil }
					m.CreateFactorFunc = func(ctx context.Context, factor *MFAFactor) error { return nil }
				},
				expectedErr: false,
				expectName:  "user@example.com",
			},
			{
				name: "Success with username account name fallback",
				req:  SetupTOTPRequest{UserID: "usr_1", Name: "Phone"},
				setup: func(u *UserStoreProviderMock, m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					u.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return &User{ID: id, Username: "u1"}, nil
					}
					totp.GenerateSecretFunc = func() (string, error) { return "SECRET", nil }
					c.EncryptFunc = func(plaintext string) (string, error) { return "ENC", nil }
					m.CreateFactorFunc = func(ctx context.Context, factor *MFAFactor) error { return nil }
				},
				expectedErr: false,
				expectName:  "u1",
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				if tc.missingDeps {
					svc := NewService(Dependencies{})
					_, err := svc.SetupTOTP(ctx, tc.req)
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}

				uStore := &UserStoreProviderMock{}
				mStore := &MFAFactorStoreMock{}
				cipher := &CipherMock{}
				totp := &TOTPProviderMock{}
				if tc.setup != nil {
					tc.setup(uStore, mStore, cipher, totp)
				}
				svc := NewService(Dependencies{
					UserStore: uStore,
					MFAStore:  mStore,
					Cipher:    cipher,
					TOTP:      totp,
				})
				res, err := svc.SetupTOTP(ctx, tc.req)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res.AccountName != tc.expectName {
					t.Errorf("expected account name %s, got %s", tc.expectName, res.AccountName)
				}
			})
		}
	})

	t.Run("ConfirmTOTP", func(t *testing.T) {
		tests := []struct {
			name        string
			req         ConfirmTOTPRequest
			setup       func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock)
			missingDeps bool
			expectedErr bool
			expectCode  errors.Code
			expectCodes int
		}{
			{
				name:        "Missing dependencies",
				missingDeps: true,
				expectedErr: true,
			},
			{
				name: "Factor not found",
				req:  ConfirmTOTPRequest{UserID: "usr_1", FactorID: "mfa_1"},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return nil, errors.E(errors.NotExist)
					}
				},
				expectedErr: true,
				expectCode:  MFANotFound,
			},
			{
				name: "Factor belongs to different user",
				req:  ConfirmTOTPRequest{UserID: "usr_1", FactorID: "mfa_1"},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return &MFAFactor{ID: id, UserID: "usr_other"}, nil
					}
				},
				expectedErr: true,
			},
			{
				name: "Factor config not TOTPConfig",
				req:  ConfirmTOTPRequest{UserID: "usr_1", FactorID: "mfa_1"},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return &MFAFactor{ID: id, UserID: "usr_1", Config: dummyOtherConfig{}}, nil
					}
				},
				expectedErr: true,
			},
			{
				name: "Decrypt secret error",
				req:  ConfirmTOTPRequest{UserID: "usr_1", FactorID: "mfa_1"},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return &MFAFactor{ID: id, UserID: "usr_1", Config: &TOTPConfig{EncryptedSecret: "enc"}}, nil
					}
					c.DecryptFunc = func(ciphertext string) (string, error) {
						return "", errors.New("decrypt error")
					}
				},
				expectedErr: true,
			},
			{
				name: "Invalid verification code",
				req:  ConfirmTOTPRequest{UserID: "usr_1", FactorID: "mfa_1", Code: "bad"},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return &MFAFactor{ID: id, UserID: "usr_1", Config: &TOTPConfig{EncryptedSecret: "enc"}}, nil
					}
					c.DecryptFunc = func(ciphertext string) (string, error) { return "SECRET", nil }
					totp.ValidateCodeFunc = func(secret, code string, t time.Time) bool { return false }
				},
				expectedErr: true,
				expectCode:  MFAInvalidCode,
			},
			{
				name: "Success with initial backup codes generation",
				req:  ConfirmTOTPRequest{UserID: "usr_1", FactorID: "mfa_1", Code: "123456"},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return &MFAFactor{ID: id, UserID: "usr_1", Config: &TOTPConfig{EncryptedSecret: "enc"}}, nil
					}
					c.DecryptFunc = func(ciphertext string) (string, error) { return "SECRET", nil }
					totp.ValidateCodeFunc = func(secret, code string, t time.Time) bool { return true }
					m.ListFactorsByUserIDFunc = func(ctx context.Context, userID UserID) ([]*MFAFactor, error) {
						return []*MFAFactor{}, nil
					}
					m.UpdateFactorFunc = func(ctx context.Context, factor *MFAFactor) error { return nil }
					m.GetRecoveryFunc = func(ctx context.Context, userID UserID) (*MFARecovery, error) {
						return nil, errors.E(errors.NotExist)
					}
					totp.GenerateBackupCodesFunc = func() ([]string, []string, error) {
						return []string{"C1", "C2"}, []string{"H1", "H2"}, nil
					}
					m.UpsertRecoveryFunc = func(ctx context.Context, recovery *MFARecovery) error { return nil }
				},
				expectedErr: false,
				expectCodes: 2,
			},
			{
				name: "Success when recovery codes already exist",
				req:  ConfirmTOTPRequest{UserID: "usr_1", FactorID: "mfa_1", Code: "123456"},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return &MFAFactor{ID: id, UserID: "usr_1", Config: &TOTPConfig{EncryptedSecret: "enc"}}, nil
					}
					c.DecryptFunc = func(ciphertext string) (string, error) { return "SECRET", nil }
					totp.ValidateCodeFunc = func(secret, code string, t time.Time) bool { return true }
					m.ListFactorsByUserIDFunc = func(ctx context.Context, userID UserID) ([]*MFAFactor, error) {
						return []*MFAFactor{{ID: "existing"}}, nil
					}
					m.UpdateFactorFunc = func(ctx context.Context, factor *MFAFactor) error { return nil }
					m.GetRecoveryFunc = func(ctx context.Context, userID UserID) (*MFARecovery, error) {
						return &MFARecovery{BackupCodes: []string{"H1"}}, nil
					}
				},
				expectedErr: false,
				expectCodes: 0,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				if tc.missingDeps {
					svc := NewService(Dependencies{})
					_, err := svc.ConfirmTOTP(ctx, tc.req)
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}

				mStore := &MFAFactorStoreMock{}
				cipher := &CipherMock{}
				totp := &TOTPProviderMock{}
				if tc.setup != nil {
					tc.setup(mStore, cipher, totp)
				}
				svc := NewService(Dependencies{MFAStore: mStore, Cipher: cipher, TOTP: totp})
				codes, err := svc.ConfirmTOTP(ctx, tc.req)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if tc.expectCode != "" && errors.CodeOf(err) != tc.expectCode {
						t.Errorf("expected code %v, got %v", tc.expectCode, errors.CodeOf(err))
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if len(codes) != tc.expectCodes {
					t.Errorf("expected %d codes, got %d", tc.expectCodes, len(codes))
				}
			})
		}
	})

	t.Run("ListMFAFactors", func(t *testing.T) {
		tests := []struct {
			name                 string
			setup                func(m *MFAFactorStoreMock)
			missingDeps          bool
			expectedFactorsCount int
			expectedHasBackup    bool
			expectedRemaining    int
			expectedErr          bool
		}{
			{
				name:        "Missing store",
				missingDeps: true,
				expectedErr: false,
			},
			{
				name: "Store list factors error",
				setup: func(m *MFAFactorStoreMock) {
					m.ListFactorsByUserIDFunc = func(ctx context.Context, userID UserID) ([]*MFAFactor, error) {
						return nil, errors.New("db error")
					}
				},
				expectedErr: true,
			},
			{
				name: "Success with factors and backup codes",
				setup: func(m *MFAFactorStoreMock) {
					m.ListFactorsByUserIDFunc = func(ctx context.Context, userID UserID) ([]*MFAFactor, error) {
						return []*MFAFactor{{ID: "mfa_1"}}, nil
					}
					m.GetRecoveryFunc = func(ctx context.Context, userID UserID) (*MFARecovery, error) {
						return &MFARecovery{BackupCodes: []string{"C1", "C2"}}, nil
					}
				},
				expectedFactorsCount: 1,
				expectedHasBackup:    true,
				expectedRemaining:    2,
				expectedErr:          false,
			},
			{
				name: "Success without backup codes",
				setup: func(m *MFAFactorStoreMock) {
					m.ListFactorsByUserIDFunc = func(ctx context.Context, userID UserID) ([]*MFAFactor, error) {
						return []*MFAFactor{{ID: "mfa_1"}}, nil
					}
					m.GetRecoveryFunc = func(ctx context.Context, userID UserID) (*MFARecovery, error) {
						return nil, errors.E(errors.NotExist)
					}
				},
				expectedFactorsCount: 1,
				expectedHasBackup:    false,
				expectedRemaining:    0,
				expectedErr:          false,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				if tc.missingDeps {
					svc := NewService(Dependencies{})
					summary, err := svc.ListMFAFactors(ctx, "usr_1")
					if err != nil || summary == nil || len(summary.Factors) != 0 {
						t.Fatalf("unexpected summary for missing store: %+v (err: %v)", summary, err)
					}
					return
				}
				mStore := &MFAFactorStoreMock{}
				if tc.setup != nil {
					tc.setup(mStore)
				}
				svc := NewService(Dependencies{MFAStore: mStore})
				summary, err := svc.ListMFAFactors(ctx, "usr_1")
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if len(summary.Factors) != tc.expectedFactorsCount || summary.HasBackupCodes != tc.expectedHasBackup || summary.RemainingBackupCodes != tc.expectedRemaining {
					t.Errorf("unexpected summary: %+v", summary)
				}
			})
		}
	})

	t.Run("DeleteMFAFactor", func(t *testing.T) {
		tests := []struct {
			name        string
			req         DeleteMFAFactorRequest
			setup       func(m *MFAFactorStoreMock)
			missingDeps bool
			expectedErr bool
			expectCode  errors.Code
		}{
			{
				name:        "Missing store",
				missingDeps: true,
				expectedErr: true,
			},
			{
				name: "Factor not found",
				req:  DeleteMFAFactorRequest{UserID: "usr_1", FactorID: "mfa_1"},
				setup: func(m *MFAFactorStoreMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return nil, errors.E(errors.NotExist)
					}
				},
				expectedErr: true,
				expectCode:  MFANotFound,
			},
			{
				name: "Wrong user",
				req:  DeleteMFAFactorRequest{UserID: "usr_1", FactorID: "mfa_1"},
				setup: func(m *MFAFactorStoreMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return &MFAFactor{ID: id, UserID: "usr_other"}, nil
					}
				},
				expectedErr: true,
			},
			{
				name: "Delete store error",
				req:  DeleteMFAFactorRequest{UserID: "usr_1", FactorID: "mfa_1"},
				setup: func(m *MFAFactorStoreMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return &MFAFactor{ID: id, UserID: "usr_1"}, nil
					}
					m.DeleteFactorFunc = func(ctx context.Context, id MFAFactorID, now time.Time) error {
						return errors.New("db error")
					}
				},
				expectedErr: true,
			},
			{
				name: "Primary promotion success",
				req:  DeleteMFAFactorRequest{UserID: "usr_1", FactorID: "mfa_1"},
				setup: func(m *MFAFactorStoreMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return &MFAFactor{ID: id, UserID: "usr_1", IsPrimary: true}, nil
					}
					m.DeleteFactorFunc = func(ctx context.Context, id MFAFactorID, now time.Time) error { return nil }
					m.ListFactorsByUserIDFunc = func(ctx context.Context, userID UserID) ([]*MFAFactor, error) {
						return []*MFAFactor{{ID: "mfa_2"}}, nil
					}
					m.SetPrimaryFactorFunc = func(ctx context.Context, userID UserID, factorID MFAFactorID) error {
						return nil
					}
				},
				expectedErr: false,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				if tc.missingDeps {
					svc := NewService(Dependencies{})
					if err := svc.DeleteMFAFactor(ctx, tc.req); err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				mStore := &MFAFactorStoreMock{}
				if tc.setup != nil {
					tc.setup(mStore)
				}
				svc := NewService(Dependencies{MFAStore: mStore})
				err := svc.DeleteMFAFactor(ctx, tc.req)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if tc.expectCode != "" && errors.CodeOf(err) != tc.expectCode {
						t.Errorf("expected code %v, got %v", tc.expectCode, errors.CodeOf(err))
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			})
		}
	})

	t.Run("SetPrimaryMFAFactor", func(t *testing.T) {
		rev := time.Now()
		tests := []struct {
			name        string
			req         SetPrimaryMFAFactorRequest
			setup       func(m *MFAFactorStoreMock)
			missingDeps bool
			expectedErr bool
			expectCode  errors.Code
		}{
			{
				name:        "Missing store",
				missingDeps: true,
				expectedErr: true,
			},
			{
				name: "Factor not found",
				req:  SetPrimaryMFAFactorRequest{UserID: "usr_1", FactorID: "mfa_1"},
				setup: func(m *MFAFactorStoreMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return nil, errors.E(errors.NotExist)
					}
				},
				expectedErr: true,
				expectCode:  MFANotFound,
			},
			{
				name: "Wrong user",
				req:  SetPrimaryMFAFactorRequest{UserID: "usr_1", FactorID: "mfa_1"},
				setup: func(m *MFAFactorStoreMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return &MFAFactor{ID: id, UserID: "usr_other"}, nil
					}
				},
				expectedErr: true,
			},
			{
				name: "Inactive factor",
				req:  SetPrimaryMFAFactorRequest{UserID: "usr_1", FactorID: "mfa_1"},
				setup: func(m *MFAFactorStoreMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return &MFAFactor{ID: id, UserID: "usr_1", RevokedAt: &rev}, nil
					}
				},
				expectedErr: true,
			},
			{
				name: "Success",
				req:  SetPrimaryMFAFactorRequest{UserID: "usr_1", FactorID: "mfa_1"},
				setup: func(m *MFAFactorStoreMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return &MFAFactor{ID: id, UserID: "usr_1"}, nil
					}
					m.SetPrimaryFactorFunc = func(ctx context.Context, userID UserID, factorID MFAFactorID) error {
						return nil
					}
				},
				expectedErr: false,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				if tc.missingDeps {
					svc := NewService(Dependencies{})
					if err := svc.SetPrimaryMFAFactor(ctx, tc.req); err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				mStore := &MFAFactorStoreMock{}
				if tc.setup != nil {
					tc.setup(mStore)
				}
				svc := NewService(Dependencies{MFAStore: mStore})
				err := svc.SetPrimaryMFAFactor(ctx, tc.req)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if tc.expectCode != "" && errors.CodeOf(err) != tc.expectCode {
						t.Errorf("expected code %v, got %v", tc.expectCode, errors.CodeOf(err))
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			})
		}
	})

	t.Run("RegenerateBackupCodes", func(t *testing.T) {
		tests := []struct {
			name        string
			req         RegenerateBackupCodesRequest
			setup       func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock)
			missingDeps bool
			expectedErr bool
			expectCode  errors.Code
		}{
			{
				name:        "Missing dependencies",
				missingDeps: true,
				expectedErr: true,
			},
			{
				name: "No active factors",
				req:  RegenerateBackupCodesRequest{UserID: "usr_1"},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.ListFactorsByUserIDFunc = func(ctx context.Context, userID UserID) ([]*MFAFactor, error) {
						return []*MFAFactor{}, nil
					}
				},
				expectedErr: true,
			},
			{
				name: "Invalid verification code",
				req:  RegenerateBackupCodesRequest{UserID: "usr_1", VerificationCode: "wrong"},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.ListFactorsByUserIDFunc = func(ctx context.Context, userID UserID) ([]*MFAFactor, error) {
						return []*MFAFactor{{Type: MFAFactorTypeTOTP, Config: &TOTPConfig{EncryptedSecret: "enc"}}}, nil
					}
					c.DecryptFunc = func(ciphertext string) (string, error) { return "SECRET", nil }
					totp.ValidateCodeFunc = func(secret, code string, t time.Time) bool { return false }
				},
				expectedErr: true,
				expectCode:  MFAInvalidCode,
			},
			{
				name: "Success",
				req:  RegenerateBackupCodesRequest{UserID: "usr_1", VerificationCode: "123456"},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.ListFactorsByUserIDFunc = func(ctx context.Context, userID UserID) ([]*MFAFactor, error) {
						return []*MFAFactor{{Type: MFAFactorTypeTOTP, Config: &TOTPConfig{EncryptedSecret: "enc"}}}, nil
					}
					c.DecryptFunc = func(ciphertext string) (string, error) { return "SECRET", nil }
					totp.ValidateCodeFunc = func(secret, code string, t time.Time) bool { return true }
					totp.GenerateBackupCodesFunc = func() ([]string, []string, error) {
						return []string{"B1", "B2"}, []string{"H1", "H2"}, nil
					}
					m.UpsertRecoveryFunc = func(ctx context.Context, recovery *MFARecovery) error { return nil }
				},
				expectedErr: false,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				if tc.missingDeps {
					svc := NewService(Dependencies{})
					_, err := svc.RegenerateBackupCodes(ctx, tc.req)
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				mStore := &MFAFactorStoreMock{}
				cipher := &CipherMock{}
				totp := &TOTPProviderMock{}
				if tc.setup != nil {
					tc.setup(mStore, cipher, totp)
				}
				svc := NewService(Dependencies{MFAStore: mStore, Cipher: cipher, TOTP: totp})
				codes, err := svc.RegenerateBackupCodes(ctx, tc.req)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if tc.expectCode != "" && errors.CodeOf(err) != tc.expectCode {
						t.Errorf("expected code %v, got %v", tc.expectCode, errors.CodeOf(err))
					}
					return
				}
				if err != nil || len(codes) != 2 {
					t.Fatalf("unexpected codes: %v (err: %v)", codes, err)
				}
			})
		}
	})

	t.Run("VerifyMFAAssertion", func(t *testing.T) {
		rev := time.Now()
		tests := []struct {
			name        string
			req         VerifyMFAAssertionRequest
			setup       func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock)
			missingDeps bool
			expectedErr bool
			expectCode  errors.Code
		}{
			{
				name:        "Missing dependencies",
				missingDeps: true,
				expectedErr: true,
			},
			{
				name: "Backup code: missing code",
				req:  VerifyMFAAssertionRequest{FactorID: "recovery", BackupCode: ""},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
				},
				expectedErr: true,
				expectCode:  MFAInvalidCode,
			},
			{
				name: "Backup code: no recovery codes",
				req:  VerifyMFAAssertionRequest{FactorID: "recovery", BackupCode: "B1"},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.GetRecoveryFunc = func(ctx context.Context, userID UserID) (*MFARecovery, error) {
						return nil, errors.E(errors.NotExist)
					}
				},
				expectedErr: true,
				expectCode:  MFAInvalidCode,
			},
			{
				name: "Backup code: invalid code",
				req:  VerifyMFAAssertionRequest{FactorID: "recovery", BackupCode: "B1"},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.GetRecoveryFunc = func(ctx context.Context, userID UserID) (*MFARecovery, error) {
						return &MFARecovery{BackupCodes: []string{"H1"}}, nil
					}
					totp.ValidateAndConsumeBackupCodeFunc = func(input string, hashedCodes []string) ([]string, bool) {
						return hashedCodes, false
					}
				},
				expectedErr: true,
				expectCode:  MFAInvalidCode,
			},
			{
				name: "Backup code: success",
				req:  VerifyMFAAssertionRequest{FactorID: "recovery", BackupCode: "B1"},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.GetRecoveryFunc = func(ctx context.Context, userID UserID) (*MFARecovery, error) {
						return &MFARecovery{BackupCodes: []string{"H1"}}, nil
					}
					totp.ValidateAndConsumeBackupCodeFunc = func(input string, hashedCodes []string) ([]string, bool) {
						return []string{}, true
					}
					m.UpsertRecoveryFunc = func(ctx context.Context, recovery *MFARecovery) error { return nil }
				},
				expectedErr: false,
			},
			{
				name: "TOTP: missing factor ID",
				req:  VerifyMFAAssertionRequest{FactorID: ""},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
				},
				expectedErr: true,
			},
			{
				name: "TOTP: factor not found",
				req:  VerifyMFAAssertionRequest{FactorID: "mfa_1", TOTPCode: "123456"},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return nil, errors.E(errors.NotExist)
					}
				},
				expectedErr: true,
				expectCode:  MFANotFound,
			},
			{
				name: "TOTP: wrong user",
				req:  VerifyMFAAssertionRequest{UserID: "usr_1", FactorID: "mfa_1", TOTPCode: "123456"},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return &MFAFactor{ID: id, UserID: "usr_other"}, nil
					}
				},
				expectedErr: true,
			},
			{
				name: "TOTP: inactive factor",
				req:  VerifyMFAAssertionRequest{UserID: "usr_1", FactorID: "mfa_1", TOTPCode: "123456"},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return &MFAFactor{ID: id, UserID: "usr_1", RevokedAt: &rev}, nil
					}
				},
				expectedErr: true,
			},
			{
				name: "TOTP: bad config",
				req:  VerifyMFAAssertionRequest{UserID: "usr_1", FactorID: "mfa_1", TOTPCode: "123456"},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return &MFAFactor{ID: id, UserID: "usr_1", Config: dummyOtherConfig{}}, nil
					}
				},
				expectedErr: true,
			},
			{
				name: "TOTP: decrypt error",
				req:  VerifyMFAAssertionRequest{UserID: "usr_1", FactorID: "mfa_1", TOTPCode: "123456"},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return &MFAFactor{ID: id, UserID: "usr_1", Config: &TOTPConfig{EncryptedSecret: "enc"}}, nil
					}
					c.DecryptFunc = func(ciphertext string) (string, error) {
						return "", errors.New("decrypt error")
					}
				},
				expectedErr: true,
			},
			{
				name: "TOTP: invalid code",
				req:  VerifyMFAAssertionRequest{UserID: "usr_1", FactorID: "mfa_1", TOTPCode: "wrong"},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return &MFAFactor{ID: id, UserID: "usr_1", Config: &TOTPConfig{EncryptedSecret: "enc"}}, nil
					}
					c.DecryptFunc = func(ciphertext string) (string, error) { return "SECRET", nil }
					totp.ValidateCodeFunc = func(secret, code string, t time.Time) bool { return false }
				},
				expectedErr: true,
				expectCode:  MFAInvalidCode,
			},
			{
				name: "TOTP: success",
				req:  VerifyMFAAssertionRequest{UserID: "usr_1", FactorID: "mfa_1", TOTPCode: "123456"},
				setup: func(m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.GetFactorByIDFunc = func(ctx context.Context, id MFAFactorID) (*MFAFactor, error) {
						return &MFAFactor{ID: id, UserID: "usr_1", Config: &TOTPConfig{EncryptedSecret: "enc"}}, nil
					}
					c.DecryptFunc = func(ciphertext string) (string, error) { return "SECRET", nil }
					totp.ValidateCodeFunc = func(secret, code string, t time.Time) bool { return true }
					m.UpdateFactorFunc = func(ctx context.Context, factor *MFAFactor) error { return nil }
				},
				expectedErr: false,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				if tc.missingDeps {
					svc := NewService(Dependencies{})
					if err := svc.VerifyMFAAssertion(ctx, tc.req); err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				mStore := &MFAFactorStoreMock{}
				cipher := &CipherMock{}
				totp := &TOTPProviderMock{}
				if tc.setup != nil {
					tc.setup(mStore, cipher, totp)
				}
				svc := NewService(Dependencies{MFAStore: mStore, Cipher: cipher, TOTP: totp})
				err := svc.VerifyMFAAssertion(ctx, tc.req)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if tc.expectCode != "" && errors.CodeOf(err) != tc.expectCode {
						t.Errorf("expected code %v, got %v", tc.expectCode, errors.CodeOf(err))
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			})
		}
	})
}

func TestService_Device(t *testing.T) {
	ctx := context.Background()
	now := time.Now()

	t.Run("CreateDevice", func(t *testing.T) {
		tests := []struct {
			name        string
			req         CreateDeviceRequest
			setup       func(d *DeviceStoreMock, chg *AuthChallengeStoreMock, v *DeviceVerifierMock, m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock)
			missingDeps bool
			expectedErr bool
			expectCode  errors.Code
		}{
			{
				name:        "Missing dependencies",
				missingDeps: true,
				expectedErr: true,
			},
			{
				name: "Missing UserID",
				req:  CreateDeviceRequest{},
				setup: func(d *DeviceStoreMock, chg *AuthChallengeStoreMock, v *DeviceVerifierMock, m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
				},
				expectedErr: true,
				expectCode:  InvalidUserID,
			},
			{
				name: "Active MFA requires TOTP code",
				req: CreateDeviceRequest{
					UserID:     "usr_1",
					DeviceName: "Phone",
					PublicKey:  []byte("pk"),
					Algorithm:  "ES256",
					Challenge:  "chg_1",
					Signature:  []byte("sig"),
					Now:        now,
				},
				setup: func(d *DeviceStoreMock, chg *AuthChallengeStoreMock, v *DeviceVerifierMock, m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.ListFactorsByUserIDFunc = func(ctx context.Context, userID UserID) ([]*MFAFactor, error) {
						return []*MFAFactor{{Type: MFAFactorTypeTOTP, Config: &TOTPConfig{EncryptedSecret: "enc"}}}, nil
					}
				},
				expectedErr: true,
				expectCode:  MFARequired,
			},
			{
				name: "Challenge consumption fails",
				req: CreateDeviceRequest{
					UserID:     "usr_1",
					DeviceName: "Phone",
					PublicKey:  []byte("pk"),
					Algorithm:  "ES256",
					Challenge:  "chg_stale",
					Signature:  []byte("sig"),
					Now:        now,
				},
				setup: func(d *DeviceStoreMock, chg *AuthChallengeStoreMock, v *DeviceVerifierMock, m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.ListFactorsByUserIDFunc = func(ctx context.Context, userID UserID) ([]*MFAFactor, error) {
						return []*MFAFactor{}, nil
					}
					chg.ConsumeChallengeFunc = func(ctx context.Context, nonce string, now time.Time) (bool, error) {
						return false, nil
					}
				},
				expectedErr: true,
				expectCode:  DeviceInvalidChallenge,
			},
			{
				name: "Signature verification fails",
				req: CreateDeviceRequest{
					UserID:     "usr_1",
					DeviceName: "Phone",
					PublicKey:  []byte("pk"),
					Algorithm:  "ES256",
					Challenge:  "chg_1",
					Signature:  []byte("badsig"),
					Now:        now,
				},
				setup: func(d *DeviceStoreMock, chg *AuthChallengeStoreMock, v *DeviceVerifierMock, m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.ListFactorsByUserIDFunc = func(ctx context.Context, userID UserID) ([]*MFAFactor, error) {
						return []*MFAFactor{}, nil
					}
					chg.ConsumeChallengeFunc = func(ctx context.Context, nonce string, now time.Time) (bool, error) {
						return true, nil
					}
					v.VerifyAssertionFunc = func(params crypto.VerifyAssertionParams) error {
						return errors.New("bad sig")
					}
				},
				expectedErr: true,
				expectCode:  DeviceInvalidSignature,
			},
			{
				name: "Success with active MFA and valid TOTP code",
				req: CreateDeviceRequest{
					UserID:     "usr_1",
					DeviceName: "Phone",
					PublicKey:  []byte("pk"),
					Algorithm:  "ES256",
					Challenge:  "chg_1",
					Signature:  []byte("sig"),
					TOTPCode:   "123456",
					Now:        now,
				},
				setup: func(d *DeviceStoreMock, chg *AuthChallengeStoreMock, v *DeviceVerifierMock, m *MFAFactorStoreMock, c *CipherMock, totp *TOTPProviderMock) {
					m.ListFactorsByUserIDFunc = func(ctx context.Context, userID UserID) ([]*MFAFactor, error) {
						return []*MFAFactor{{Type: MFAFactorTypeTOTP, Config: &TOTPConfig{EncryptedSecret: "enc"}}}, nil
					}
					c.DecryptFunc = func(ciphertext string) (string, error) { return "SECRET", nil }
					totp.ValidateCodeFunc = func(secret, code string, t time.Time) bool { return true }
					chg.ConsumeChallengeFunc = func(ctx context.Context, nonce string, now time.Time) (bool, error) {
						return true, nil
					}
					v.VerifyAssertionFunc = func(params crypto.VerifyAssertionParams) error { return nil }
					d.CreateDeviceFunc = func(ctx context.Context, device *Device) error { return nil }
				},
				expectedErr: false,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				if tc.missingDeps {
					svc := NewService(Dependencies{})
					_, err := svc.CreateDevice(ctx, tc.req)
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}

				dStore := &DeviceStoreMock{}
				chgStore := &AuthChallengeStoreMock{}
				verifier := &DeviceVerifierMock{}
				mStore := &MFAFactorStoreMock{}
				cipher := &CipherMock{}
				totp := &TOTPProviderMock{}
				if tc.setup != nil {
					tc.setup(dStore, chgStore, verifier, mStore, cipher, totp)
				}
				svc := NewService(Dependencies{
					DeviceStore:    dStore,
					ChallengeStore: chgStore,
					DeviceVerifier: verifier,
					MFAStore:       mStore,
					Cipher:         cipher,
					TOTP:           totp,
				})
				dev, err := svc.CreateDevice(ctx, tc.req)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if tc.expectCode != "" && errors.CodeOf(err) != tc.expectCode {
						t.Errorf("expected code %v, got %v", tc.expectCode, errors.CodeOf(err))
					}
					return
				}
				if err != nil || dev == nil {
					t.Fatalf("unexpected error: %v (dev: %v)", err, dev)
				}
			})
		}
	})

	t.Run("ListDevices", func(t *testing.T) {
		tests := []struct {
			name        string
			setupStore  func(d *DeviceStoreMock)
			missingDeps bool
			expectedErr bool
		}{
			{
				name:        "Missing store",
				missingDeps: true,
				expectedErr: true,
			},
			{
				name: "Store error",
				setupStore: func(d *DeviceStoreMock) {
					d.ListDevicesByUserIDFunc = func(ctx context.Context, userID UserID) ([]*Device, error) {
						return nil, errors.New("db error")
					}
				},
				expectedErr: true,
			},
			{
				name: "Success",
				setupStore: func(d *DeviceStoreMock) {
					d.ListDevicesByUserIDFunc = func(ctx context.Context, userID UserID) ([]*Device, error) {
						return []*Device{{ID: "dev_1"}}, nil
					}
				},
				expectedErr: false,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				if tc.missingDeps {
					svc := NewService(Dependencies{})
					_, err := svc.ListDevices(ctx, "usr_1")
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				dStore := &DeviceStoreMock{}
				if tc.setupStore != nil {
					tc.setupStore(dStore)
				}
				svc := NewService(Dependencies{DeviceStore: dStore})
				devices, err := svc.ListDevices(ctx, "usr_1")
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil || len(devices) != 1 {
					t.Fatalf("unexpected result: devices=%v, err=%v", devices, err)
				}
			})
		}
	})

	t.Run("RevokeDevice", func(t *testing.T) {
		rev := time.Now()
		tests := []struct {
			name        string
			setup       func(d *DeviceStoreMock, s *SessionStoreProviderMock)
			missingDeps bool
			expectedErr bool
			expectCode  errors.Code
		}{
			{
				name:        "Missing deps",
				missingDeps: true,
				expectedErr: true,
			},
			{
				name: "Device not found",
				setup: func(d *DeviceStoreMock, s *SessionStoreProviderMock) {
					d.GetDeviceByIDFunc = func(ctx context.Context, id DeviceID) (*Device, error) {
						return nil, errors.E(errors.NotExist)
					}
				},
				expectedErr: true,
				expectCode:  DeviceNotFound,
			},
			{
				name: "Wrong user",
				setup: func(d *DeviceStoreMock, s *SessionStoreProviderMock) {
					d.GetDeviceByIDFunc = func(ctx context.Context, id DeviceID) (*Device, error) {
						return &Device{ID: id, UserID: "usr_other"}, nil
					}
				},
				expectedErr: true,
				expectCode:  DeviceNotFound,
			},
			{
				name: "Already revoked",
				setup: func(d *DeviceStoreMock, s *SessionStoreProviderMock) {
					d.GetDeviceByIDFunc = func(ctx context.Context, id DeviceID) (*Device, error) {
						return &Device{ID: id, UserID: "usr_1", RevokedAt: &rev}, nil
					}
				},
				expectedErr: false,
			},
			{
				name: "Success",
				setup: func(d *DeviceStoreMock, s *SessionStoreProviderMock) {
					d.GetDeviceByIDFunc = func(ctx context.Context, id DeviceID) (*Device, error) {
						return &Device{ID: id, UserID: "usr_1"}, nil
					}
					d.RevokeDeviceFunc = func(ctx context.Context, id DeviceID, revokedAt time.Time) error {
						return nil
					}
					s.RevokeByDeviceIDFunc = func(ctx context.Context, deviceID DeviceID, now time.Time) error {
						return nil
					}
				},
				expectedErr: false,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				if tc.missingDeps {
					svc := NewService(Dependencies{})
					if err := svc.RevokeDevice(ctx, "usr_1", "dev_1"); err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				dStore := &DeviceStoreMock{}
				sStore := &SessionStoreProviderMock{}
				if tc.setup != nil {
					tc.setup(dStore, sStore)
				}
				svc := NewService(Dependencies{DeviceStore: dStore, SessionStore: sStore})
				err := svc.RevokeDevice(ctx, "usr_1", "dev_1")
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if tc.expectCode != "" && errors.CodeOf(err) != tc.expectCode {
						t.Errorf("expected code %v, got %v", tc.expectCode, errors.CodeOf(err))
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			})
		}
	})

	t.Run("VerifyDeviceAssertion", func(t *testing.T) {
		rev := now
		oldUsed := now.Add(-35 * 24 * time.Hour)
		tests := []struct {
			name        string
			req         VerifyDeviceAssertionRequest
			setup       func(d *DeviceStoreMock, chg *AuthChallengeStoreMock, v *DeviceVerifierMock, u *UserStoreProviderMock)
			missingDeps bool
			expectedErr bool
			expectCode  errors.Code
		}{
			{
				name:        "Missing dependencies",
				missingDeps: true,
				expectedErr: true,
			},
			{
				name: "Device not found",
				req:  VerifyDeviceAssertionRequest{DeviceID: "dev_1", Now: now},
				setup: func(d *DeviceStoreMock, chg *AuthChallengeStoreMock, v *DeviceVerifierMock, u *UserStoreProviderMock) {
					d.GetDeviceByIDFunc = func(ctx context.Context, id DeviceID) (*Device, error) {
						return nil, errors.E(errors.NotExist)
					}
				},
				expectedErr: true,
				expectCode:  DeviceNotFound,
			},
			{
				name: "Device revoked",
				req:  VerifyDeviceAssertionRequest{DeviceID: "dev_1", Now: now},
				setup: func(d *DeviceStoreMock, chg *AuthChallengeStoreMock, v *DeviceVerifierMock, u *UserStoreProviderMock) {
					d.GetDeviceByIDFunc = func(ctx context.Context, id DeviceID) (*Device, error) {
						return &Device{ID: id, UserID: "usr_1", RevokedAt: &rev}, nil
					}
				},
				expectedErr: true,
				expectCode:  DeviceRevoked,
			},
			{
				name: "Device expired (60-day limit)",
				req:  VerifyDeviceAssertionRequest{DeviceID: "dev_1", Now: now},
				setup: func(d *DeviceStoreMock, chg *AuthChallengeStoreMock, v *DeviceVerifierMock, u *UserStoreProviderMock) {
					d.GetDeviceByIDFunc = func(ctx context.Context, id DeviceID) (*Device, error) {
						return &Device{ID: id, UserID: "usr_1", ExpiresAt: now.Add(-time.Hour)}, nil
					}
				},
				expectedErr: true,
				expectCode:  DeviceExpired,
			},
			{
				name: "Device inactive (30-day limit)",
				req:  VerifyDeviceAssertionRequest{DeviceID: "dev_1", Now: now},
				setup: func(d *DeviceStoreMock, chg *AuthChallengeStoreMock, v *DeviceVerifierMock, u *UserStoreProviderMock) {
					d.GetDeviceByIDFunc = func(ctx context.Context, id DeviceID) (*Device, error) {
						return &Device{
							ID:         id,
							UserID:     "usr_1",
							CreatedAt:  now.Add(-40 * 24 * time.Hour),
							ExpiresAt:  now.Add(20 * 24 * time.Hour),
							LastUsedAt: &oldUsed,
						}, nil
					}
				},
				expectedErr: true,
				expectCode:  DeviceInactive,
			},
			{
				name: "Challenge expired or invalid",
				req:  VerifyDeviceAssertionRequest{DeviceID: "dev_1", Challenge: "bad_chg", Now: now},
				setup: func(d *DeviceStoreMock, chg *AuthChallengeStoreMock, v *DeviceVerifierMock, u *UserStoreProviderMock) {
					d.GetDeviceByIDFunc = func(ctx context.Context, id DeviceID) (*Device, error) {
						return &Device{
							ID:        id,
							UserID:    "usr_1",
							CreatedAt: now.Add(-time.Hour),
							ExpiresAt: now.Add(40 * 24 * time.Hour),
						}, nil
					}
					chg.ConsumeChallengeFunc = func(ctx context.Context, nonce string, now time.Time) (bool, error) {
						return false, nil
					}
				},
				expectedErr: true,
				expectCode:  DeviceInvalidChallenge,
			},
			{
				name: "Invalid signature",
				req:  VerifyDeviceAssertionRequest{DeviceID: "dev_1", Challenge: "chg_1", Signature: []byte("bad"), Now: now},
				setup: func(d *DeviceStoreMock, chg *AuthChallengeStoreMock, v *DeviceVerifierMock, u *UserStoreProviderMock) {
					d.GetDeviceByIDFunc = func(ctx context.Context, id DeviceID) (*Device, error) {
						return &Device{
							ID:           id,
							UserID:       "usr_1",
							CreatedAt:    now.Add(-time.Hour),
							ExpiresAt:    now.Add(40 * 24 * time.Hour),
							KeyAlgorithm: "ES256",
							PublicKey:    []byte("pk"),
						}, nil
					}
					chg.ConsumeChallengeFunc = func(ctx context.Context, nonce string, now time.Time) (bool, error) {
						return true, nil
					}
					v.VerifyAssertionFunc = func(params crypto.VerifyAssertionParams) error {
						return errors.New("bad sig")
					}
				},
				expectedErr: true,
				expectCode:  DeviceInvalidSignature,
			},
			{
				name: "User not found",
				req:  VerifyDeviceAssertionRequest{DeviceID: "dev_1", Challenge: "chg_1", Signature: []byte("sig"), Now: now},
				setup: func(d *DeviceStoreMock, chg *AuthChallengeStoreMock, v *DeviceVerifierMock, u *UserStoreProviderMock) {
					d.GetDeviceByIDFunc = func(ctx context.Context, id DeviceID) (*Device, error) {
						return &Device{
							ID:           id,
							UserID:       "usr_1",
							CreatedAt:    now.Add(-time.Hour),
							ExpiresAt:    now.Add(40 * 24 * time.Hour),
							KeyAlgorithm: "ES256",
							PublicKey:    []byte("pk"),
						}, nil
					}
					chg.ConsumeChallengeFunc = func(ctx context.Context, nonce string, now time.Time) (bool, error) {
						return true, nil
					}
					v.VerifyAssertionFunc = func(params crypto.VerifyAssertionParams) error { return nil }
					u.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return nil, errors.E(errors.NotExist)
					}
				},
				expectedErr: true,
				expectCode:  InvalidCredentials,
			},
			{
				name: "Success",
				req:  VerifyDeviceAssertionRequest{DeviceID: "dev_1", Challenge: "chg_1", Signature: []byte("sig"), Now: now},
				setup: func(d *DeviceStoreMock, chg *AuthChallengeStoreMock, v *DeviceVerifierMock, u *UserStoreProviderMock) {
					d.GetDeviceByIDFunc = func(ctx context.Context, id DeviceID) (*Device, error) {
						return &Device{
							ID:           id,
							UserID:       "usr_1",
							CreatedAt:    now.Add(-time.Hour),
							ExpiresAt:    now.Add(40 * 24 * time.Hour),
							KeyAlgorithm: "ES256",
							PublicKey:    []byte("pk"),
						}, nil
					}
					chg.ConsumeChallengeFunc = func(ctx context.Context, nonce string, now time.Time) (bool, error) {
						return true, nil
					}
					v.VerifyAssertionFunc = func(params crypto.VerifyAssertionParams) error { return nil }
					u.GetByIDFunc = func(ctx context.Context, id UserID) (*User, error) {
						return &User{ID: id, Status: UserStatusActive}, nil
					}
					d.UpdateDeviceLastUsedFunc = func(ctx context.Context, id DeviceID, lastUsedAt time.Time) error {
						return nil
					}
				},
				expectedErr: false,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				if tc.missingDeps {
					svc := NewService(Dependencies{})
					_, _, err := svc.VerifyDeviceAssertion(ctx, tc.req)
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				dStore := &DeviceStoreMock{}
				chgStore := &AuthChallengeStoreMock{}
				verifier := &DeviceVerifierMock{}
				uStore := &UserStoreProviderMock{}
				if tc.setup != nil {
					tc.setup(dStore, chgStore, verifier, uStore)
				}
				svc := NewService(Dependencies{
					DeviceStore:    dStore,
					ChallengeStore: chgStore,
					DeviceVerifier: verifier,
					UserStore:      uStore,
				})
				dev, user, err := svc.VerifyDeviceAssertion(ctx, tc.req)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					if tc.expectCode != "" && errors.CodeOf(err) != tc.expectCode {
						t.Errorf("expected code %v, got %v", tc.expectCode, errors.CodeOf(err))
					}
					return
				}
				if err != nil || dev == nil || user == nil {
					t.Fatalf("unexpected result: dev=%v, user=%v, err=%v", dev, user, err)
				}
			})
		}
	})
}
