package iam

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/password"
)

// testHasher is a test double that uses real Argon2id with test params.
type testHasher struct {
	h *password.Argon2id
}

func newTestHasher(params password.Params) *testHasher {
	h, err := password.NewArgon2id(params)
	if err != nil {
		panic(err)
	}
	return &testHasher{h: h}
}

func (h *testHasher) Hash(raw string) (string, error) {
	return h.h.Hash(raw)
}

func (h *testHasher) Verify(encodedHash, raw string) (bool, error) {
	return h.h.Verify(encodedHash, raw)
}

// failHasher returns an error on Hash.
type failHasher struct{}

func (f *failHasher) Hash(raw string) (string, error) {
	return "", errors.New("hashing failed")
}

func (f *failHasher) Verify(encodedHash, raw string) (bool, error) {
	return false, password.ErrPasswordMismatch
}

// fakeIdentityService is a test double for IdentityService.
type fakeIdentityService struct {
	createUserCalled   bool
	createCredential   *identity.Credential
	createCredentialFn func(*identity.Credential) error
	getUserByIDFn      func(id identity.UserID) (*identity.User, error)
	updateUserFn       func(user *identity.User) error
}

func newFakeIdentityService() *fakeIdentityService {
	return &fakeIdentityService{}
}

func (f *fakeIdentityService) CreateUser(ctx context.Context, user *identity.User) error {
	f.createUserCalled = true
	return nil
}

func (f *fakeIdentityService) CreateCredential(ctx context.Context, credential *identity.Credential) error {
	f.createCredential = credential
	if f.createCredentialFn != nil {
		return f.createCredentialFn(credential)
	}
	return nil
}

func (f *fakeIdentityService) GetUserByID(ctx context.Context, id identity.UserID) (*identity.User, error) {
	if f.getUserByIDFn != nil {
		return f.getUserByIDFn(id)
	}
	return nil, nil
}

func (f *fakeIdentityService) GetUserByEmail(ctx context.Context, email string) (*identity.User, error) {
	return nil, nil
}

func (f *fakeIdentityService) GetUserByUsername(ctx context.Context, username string) (*identity.User, error) {
	return nil, nil
}

func (f *fakeIdentityService) UpdateUser(ctx context.Context, user *identity.User) error {
	if f.updateUserFn != nil {
		return f.updateUserFn(user)
	}
	return nil
}

func (f *fakeIdentityService) ListUsers(ctx context.Context, filter *identity.ListUsersFilter) ([]*identity.User, string, error) {
	return nil, "", nil
}

func (f *fakeIdentityService) ApproveUser(ctx context.Context, userID identity.UserID) (*identity.User, error) {
	return nil, nil
}

func (f *fakeIdentityService) GetCredentialByUserIDAndAuthType(ctx context.Context, userID identity.UserID, authType string) (*identity.Credential, error) {
	return nil, nil
}

func (f *fakeIdentityService) UpdateCredential(ctx context.Context, credential *identity.Credential) error {
	return nil
}

func (f *fakeIdentityService) RejectUser(ctx context.Context, userID identity.UserID) (*identity.User, error) {
	return nil, nil
}

func (f *fakeIdentityService) UpdateUserRole(ctx context.Context, userID identity.UserID, accessLevel identity.AccessLevel) (*identity.User, error) {
	return nil, nil
}

func (f *fakeIdentityService) GetAuthVersion(ctx context.Context, id identity.UserID) (int64, error) {
	return 0, nil
}

func (f *fakeIdentityService) IncrementAuthVersion(ctx context.Context, id identity.UserID) (int64, error) {
	return 1, nil
}

func (f *fakeIdentityService) Authenticate(ctx context.Context, identifier string, password string) (*identity.User, error) {
	return nil, nil
}

func (f *fakeIdentityService) RevokeAllSessions(ctx context.Context, userID identity.UserID) (int64, error) {
	return 1, nil
}

func TestRegisterHashesPassword(t *testing.T) {
	fakeSvc := newFakeIdentityService()
	testH := newTestHasher(password.DefaultParams())
	coord := NewCoordinator(Dependencies{
		IdentityService: fakeSvc,
		PasswordHasher:  testH,
	})

	req := &RegisterUserRequest{
		Email:    "test@example.com",
		Username: "testuser",
		Name:     "Test User",
		Password: "securepassword123",
	}

	_, err := coord.Register(context.Background(), req)
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	if !fakeSvc.createUserCalled {
		t.Fatal("expected CreateUser to be called")
	}

	cred := fakeSvc.createCredential
	if cred == nil {
		t.Fatal("expected credential to be set")
	}

	if !strings.HasPrefix(cred.SecretData, "$argon2id$") {
		t.Errorf("expected SecretData to start with $argon2id$, got: %s", cred.SecretData)
	}
}

func TestRegisterNeverSendsPlaintext(t *testing.T) {
	fakeSvc := newFakeIdentityService()
	testH := newTestHasher(password.DefaultParams())
	coord := NewCoordinator(Dependencies{
		IdentityService: fakeSvc,
		PasswordHasher:  testH,
	})

	req := &RegisterUserRequest{
		Email:    "test@example.com",
		Username: "testuser",
		Name:     "Test User",
		Password: "securepassword123",
	}

	_, err := coord.Register(context.Background(), req)
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	cred := fakeSvc.createCredential
	if cred == nil {
		t.Fatal("expected credential to be set")
	}

	if cred.SecretData == "securepassword123" {
		t.Error("SecretData must not contain the plaintext password")
	}
}

func TestRegisterInvalidPasswordFails(t *testing.T) {
	fakeSvc := newFakeIdentityService()
	testH := newTestHasher(password.DefaultParams())
	coord := NewCoordinator(Dependencies{
		IdentityService: fakeSvc,
		PasswordHasher:  testH,
	})

	// Use a very short password to trigger validation failure
	req := &RegisterUserRequest{
		Password: "short",
	}

	_, err := coord.Register(context.Background(), req)
	if err == nil {
		t.Fatal("expected error for short password")
	}

	if fakeSvc.createUserCalled {
		t.Fatal("CreateUser must not be called when password validation fails")
	}
}

func TestAdminCreateUserHashesPassword(t *testing.T) {
	fakeSvc := newFakeIdentityService()
	testH := newTestHasher(password.DefaultParams())
	coord := NewCoordinator(Dependencies{
		IdentityService: fakeSvc,
		PasswordHasher:  testH,
	})

	req := &AdminCreateUserRequest{
		Email:       "admin@example.com",
		Username:    "adminuser",
		Name:        "Admin User",
		Password:    "adminsecurepass1",
		AccessLevel: identity.AccessLevelAdmin,
	}

	_, err := coord.AdminCreateUser(context.Background(), req)
	if err != nil {
		t.Fatalf("AdminCreateUser: %v", err)
	}

	cred := fakeSvc.createCredential
	if cred == nil {
		t.Fatal("expected credential to be set")
	}

	if !strings.HasPrefix(cred.SecretData, "$argon2id$") {
		t.Errorf("expected SecretData to start with $argon2id$, got: %s", cred.SecretData)
	}
}

func TestAdminCreateUserInvalidPasswordFails(t *testing.T) {
	fakeSvc := newFakeIdentityService()
	testH := newTestHasher(password.DefaultParams())
	coord := NewCoordinator(Dependencies{
		IdentityService: fakeSvc,
		PasswordHasher:  testH,
	})

	req := &AdminCreateUserRequest{
		Password: "short",
	}

	_, err := coord.AdminCreateUser(context.Background(), req)
	if err == nil {
		t.Fatal("expected error for short password")
	}

	if fakeSvc.createUserCalled {
		t.Fatal("CreateUser must not be called when password validation fails")
	}
}

func TestRegisterHasherErrorPropagated(t *testing.T) {
	fakeSvc := newFakeIdentityService()
	failH := &failHasher{}
	coord := NewCoordinator(Dependencies{
		IdentityService: fakeSvc,
		PasswordHasher:  failH,
	})

	req := &RegisterUserRequest{
		Password: "securepassword123",
	}

	_, err := coord.Register(context.Background(), req)
	if err == nil {
		t.Fatal("expected error from hasher")
	}

	if !strings.Contains(err.Error(), "hash") {
		t.Errorf("expected error to mention hashing, got: %s", err.Error())
	}

	if fakeSvc.createUserCalled {
		t.Fatal("CreateUser must not be called when hashing fails")
	}
}
