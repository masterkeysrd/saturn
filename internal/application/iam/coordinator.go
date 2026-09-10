package iam

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/password"
	"github.com/masterkeysrd/saturn/internal/platform/token"
)

//go:generate go run github.com/masterkeysrd/saturn/tools/txgen -target=Coordinator
//go:generate go run github.com/masterkeysrd/saturn/tools/loggen -target=Coordinator -component=iam

// Coordinator orchestrates identity operations across multiple services.
type Coordinator interface {
	Authenticate(ctx context.Context, identifier string, password string) (*identity.User, error)
	GetAuthVersion(ctx context.Context, id identity.UserID) (int64, error)
	GetCurrentUser(ctx context.Context, userID identity.UserID) (*identity.User, error)
	ListSecurityEvents(ctx context.Context, filter identity.SecurityEventFilter) (*paging.Page[*identity.SecurityEvent], error)
	Login(ctx context.Context, req *LoginRequest) (*LoginResponse, error)
	Logout(ctx context.Context, req *LogoutRequest) (*LogoutResponse, error)
	// @transactional
	RefreshSession(ctx context.Context, req *RefreshSessionRequest) (*RefreshSessionResponse, error)
	// @transactional
	Register(ctx context.Context, req *RegisterUserRequest) (*RegisterUserResponse, error)
	// @transactional
	AdminCreateUser(ctx context.Context, req *AdminCreateUserRequest) (*AdminCreateUserResponse, error)
	// @transactional
	ApproveUser(ctx context.Context, req *ApproveUserRequest) (*ApproveUserResponse, error)
	RejectUser(ctx context.Context, req *RejectUserRequest) (*RejectUserResponse, error)
	ListUsers(ctx context.Context, filter *ListUsersFilter) (*paging.Page[*identity.User], error)
	UpdateUserRole(ctx context.Context, req *UpdateUserRoleRequest) (*UpdateUserRoleResponse, error)
	ListActiveSessions(ctx context.Context, req *ListActiveSessionsRequest) (*ListActiveSessionsResponse, error)
	RevokeSession(ctx context.Context, req *RevokeSessionRequest) (*RevokeSessionResponse, error)
	// @transactional
	RevokeAllSessions(ctx context.Context, req *RevokeAllSessionsRequest) (*RevokeAllSessionsResponse, error)
}

// Dependencies defines the inputs for creating a new Coordinator.
type Dependencies struct {
	IdentityService IdentityService
	PasswordHasher  password.Hasher
	SpaceService    SpaceService
	TokenService    token.Service
}

// coordinator orchestrates identity operations across multiple services.
type coordinator struct {
	identityService IdentityService
	passwordHasher  password.Hasher
	spaceService    SpaceService
	tokenService    token.Service
}

// NewCoordinator creates a new Coordinator.
func NewCoordinator(deps Dependencies) Coordinator {
	return &coordinator{
		identityService: deps.IdentityService,
		passwordHasher:  deps.PasswordHasher,
		spaceService:    deps.SpaceService,
		tokenService:    deps.TokenService,
	}
}

var _ Coordinator = (*coordinator)(nil)

// Authenticate delegates to the identity service's Authenticate method.
func (c *coordinator) Authenticate(ctx context.Context, identifier string, password string) (*identity.User, error) {
	return c.identityService.Authenticate(ctx, identifier, password)
}

// GetAuthVersion delegates to the identity service's GetAuthVersion method.
func (c *coordinator) GetAuthVersion(ctx context.Context, id identity.UserID) (int64, error) {
	return c.identityService.GetAuthVersion(ctx, id)
}

// GetCurrentUser retrieves the profile of the authenticated user by ID.
func (c *coordinator) GetCurrentUser(ctx context.Context, userID identity.UserID) (*identity.User, error) {
	return c.identityService.GetUserByID(ctx, userID)
}

// ListSecurityEvents queries audit logs based on the given filter.
func (c *coordinator) ListSecurityEvents(ctx context.Context, filter identity.SecurityEventFilter) (*paging.Page[*identity.SecurityEvent], error) {
	return c.identityService.ListSecurityEvents(ctx, filter)
}

// IdentityService defines the interface for identity domain operations.
type IdentityService interface {
	CreateUser(ctx context.Context, user *identity.User) error
	CreateCredential(ctx context.Context, credential *identity.Credential) error
	UpdateCredential(ctx context.Context, credential *identity.Credential) error
	GetUserByID(ctx context.Context, id identity.UserID) (*identity.User, error)
	GetUserByEmail(ctx context.Context, email string) (*identity.User, error)
	GetUserByUsername(ctx context.Context, username string) (*identity.User, error)
	GetCredentialByUserIDAndAuthType(ctx context.Context, userID identity.UserID, authType string) (*identity.Credential, error)
	UpdateUser(ctx context.Context, user *identity.User) error
	ListUsers(ctx context.Context, filter *identity.ListUsersFilter) (*paging.Page[*identity.User], error)
	ApproveUser(ctx context.Context, userID identity.UserID) (*identity.User, error)
	RejectUser(ctx context.Context, userID identity.UserID) (*identity.User, error)
	UpdateUserRole(ctx context.Context, userID identity.UserID, accessLevel identity.AccessLevel) (*identity.User, error)
	GetAuthVersion(ctx context.Context, id identity.UserID) (int64, error)
	IncrementAuthVersion(ctx context.Context, id identity.UserID) (int64, error)
	Authenticate(ctx context.Context, identifier string, password string) (*identity.User, error)
	RevokeAllSessions(ctx context.Context, userID identity.UserID) (int64, error)
	CreateSession(ctx context.Context, req *identity.CreateSessionRequest) (*identity.Session, error)
	RotateSession(ctx context.Context, req *identity.RotateSessionRequest) (*identity.Session, error)
	RevokeSessionByHash(ctx context.Context, refreshTokenHash []byte) error
	ListActiveSessions(ctx context.Context, userID identity.UserID) ([]*identity.Session, error)
	RevokeSessionByID(ctx context.Context, sessionID identity.SessionID, userID identity.UserID) error
	UpdateLockoutState(ctx context.Context, req identity.UpdateLockoutRequest) error
	CreateSecurityEvent(ctx context.Context, event *identity.SecurityEvent) error
	ListSecurityEvents(ctx context.Context, filter identity.SecurityEventFilter) (*paging.Page[*identity.SecurityEvent], error)
}

// SpaceService defines the interface for space operations required by IAM application.
type SpaceService interface {
	CreateSpace(ctx context.Context, space *space.Space) (*space.Space, error)
}
