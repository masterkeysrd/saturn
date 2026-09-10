package identity

import (
	"context"
	"testing"
	"time"

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
