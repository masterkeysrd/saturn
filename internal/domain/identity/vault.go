package identity

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/id"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

type CredentialStore interface {
	Store(context.Context, *Credential) error
	GetBy(context.Context, GetCredentialCriteria) (*Credential, error)
	ExistsBy(context.Context, ExistsCredentialCriteria) (bool, error)
}

type ExistsCredentialCriteria interface {
	isExistsCredentialCriteria()
}

type GetCredentialCriteria interface {
	isGetCredentialCriteria()
}

// PasswordHasher defines the interface for password hashing and comparison.
type PasswordHasher interface {
	Hash(password string) (string, error)
	Compare(hashedPassword, password string) bool
}

type CredentialVault struct {
	store  CredentialStore
	hasher PasswordHasher
}

type CredentialVaultParams struct {
	deps.In

	Store  CredentialStore
	Hasher PasswordHasher
}

func NewCredentialVault(params CredentialVaultParams) *CredentialVault {
	return &CredentialVault{
		store:  params.Store,
		hasher: params.Hasher,
	}
}

func (v *CredentialVault) CreateCredential(ctx context.Context, in *CreateCredentialInput) (SubjectID, error) {
	if in == nil {
		return "", errors.New("input is nil")
	}

	credential := &Credential{
		Username: in.Username,
		Email:    in.Email,
	}
	if err := credential.Initialize(); err != nil {
		return "", fmt.Errorf("failed to initialize credential: %w", err)
	}

	credential.Sanitize()
	if err := credential.SetPassword(in.Password, v.hasher); err != nil {
		return "", fmt.Errorf("failed to set password: %w", err)
	}

	if err := credential.Validate(); err != nil {
		return "", fmt.Errorf("credential validation failed: %w", err)
	}

	exits, err := v.store.ExistsBy(ctx, ByUsername(credential.Username))
	if err != nil {
		return "", fmt.Errorf("failed to check username existence: %w", err)
	}
	if exits {
		return "", fmt.Errorf("username already exists")
	}

	exits, err = v.store.ExistsBy(ctx, ByEmail(credential.Email))
	if err != nil {
		return "", fmt.Errorf("failed to check email existence: %w", err)
	}
	if exits {
		return "", fmt.Errorf("email already exists")
	}

	if err := v.store.Store(ctx, credential); err != nil {
		return "", fmt.Errorf("failed to store credential: %w", err)
	}

	return credential.SubjectID, nil
}

func (v *CredentialVault) VerifyCredential(ctx context.Context, in *ValidateCredentialInput) (*UserProfile, error) {
	if in == nil {
		return nil, errors.New("input is nil")
	}

	if in.Identifier == "" {
		return nil, errors.New("identifier is required")
	}

	if in.Password == "" {
		return nil, errors.New("password is required")
	}

	credential, err := v.store.GetBy(ctx, ByIdentifier(in.Identifier))
	if err != nil {
		return nil, fmt.Errorf("failed to get credential: %w", err)
	}

	if credential == nil {
		return nil, errors.New("identifier or password is incorrect")
	}

	if !credential.VerifyPassword(in.Password, v.hasher) {
		return nil, errors.New("identifier or password is incorrect")
	}

	profile := &UserProfile{
		Provider:    ProviderTypeVault,
		ID:          credential.SubjectID,
		DisplayName: credential.Username,
		Emails:      []string{credential.Email},
	}

	return profile, nil
}

// CreateCredentialInput represents the input required
// to create a new user's credential.
type CreateCredentialInput struct {
	Username string
	Email    string
	Password string
}

type ValidateCredentialInput struct {
	Identifier string
	Password   string
}

// Credential represents a user's credential information.
type Credential struct {
	SubjectID    SubjectID
	Username     string
	Email        string
	PasswordHash string

	CreateTime time.Time
	UpdateTime time.Time
}

func (c *Credential) Initialize() error {
	if c == nil {
		return errors.New("credential is nil")
	}

	sid, err := id.New[SubjectID]()
	if err != nil {
		return fmt.Errorf("failed to generate subject ID: %w", err)
	}

	now := time.Now().UTC()
	c.SubjectID = sid
	c.CreateTime = now
	c.UpdateTime = now

	return nil
}

func (c *Credential) Sanitize() {
	if c == nil {
		return
	}

	c.Username = strings.TrimSpace(c.Username)
	c.Username = strings.ToLower(c.Username)
	c.Email = strings.TrimSpace(c.Email)
	c.Email = strings.ToLower(c.Email)
}

func (c *Credential) SetPassword(password string, hasher PasswordHasher) error {
	if c == nil {
		return errors.New("credential is nil")
	}

	if password == "" {
		return errors.New("password is required")
	}

	if len(password) < 8 {
		return errors.New("password is too short, minimum length is 8 characters")
	}

	if len(password) > 64 {
		return errors.New("password is too long, maximum length is 64 characters")
	}

	hashedPassword, err := hasher.Hash(password)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	c.PasswordHash = hashedPassword
	c.UpdateTime = time.Now().UTC()
	return nil
}

func (c *Credential) VerifyPassword(password string, hasher PasswordHasher) bool {
	if c == nil {
		return false
	}

	return hasher.Compare(c.PasswordHash, password)
}

func (c *Credential) Validate() error {
	if c == nil {
		return errors.New("credential is nil")
	}

	if c.Username == "" {
		return errors.New("username is required")
	}

	if len(c.Username) < 4 {
		return errors.New("username is too short, minimum length is 4 characters")
	}

	if len(c.Username) > 30 {
		return errors.New("username is too long, maximum length is 30 characters")
	}

	if c.Email == "" {
		return errors.New("email is required")
	}

	if !strings.Contains(c.Email, "@") {
		return errors.New("invalid email format")
	}

	if len(c.Email) < 5 {
		return errors.New("email is too short, minimum length is 5 characters")
	}

	if len(c.Email) > 254 {
		return errors.New("email is too long, maximum length is 254 characters")
	}

	if c.PasswordHash == "" {
		return errors.New("password hash is required")
	}

	return nil
}
