package application

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/tenancy"
	"github.com/masterkeysrd/saturn/internal/foundation/access"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
	"github.com/masterkeysrd/saturn/internal/pkg/ptr"
)

const (
	AccessTokenTTL = 15 * time.Minute
)

type IdentityService interface {
	CreateUser(context.Context, *identity.CreateUserInput) (*identity.User, error)
	CreateAdminUser(context.Context, *identity.CreateUserInput) (*identity.User, error)
	LoginUser(context.Context, *identity.LoginUserInput) (*identity.User, *identity.Session, string, error)
	RefreshSession(context.Context, *identity.RefreshSessionInput) (*identity.User, *identity.Session, string, error)
	RevokeSession(context.Context, identity.SessionID) error
	RevokeUserSessions(context.Context, auth.UserID) error
}

type TokenManager interface {
	Generate(context.Context, auth.UserPassport, time.Duration) (auth.Token, error)
	Parse(context.Context, auth.Token) (auth.UserPassport, error)
}

// Identity represents the identity application.
type Identity struct {
	identityService IdentityService
	tenancyService  TenancyService
	tokenManager    TokenManager
}

type IdentityParams struct {
	deps.In

	IdentityService IdentityService
	TenancyService  TenancyService
	TokenManager    TokenManager
}

func NewIdentity(params IdentityParams) *Identity {
	return &Identity{
		identityService: params.IdentityService,
		tenancyService:  params.TenancyService,
		tokenManager:    params.TokenManager,
	}
}

// RegisterUser registers a new user in the system.
func (a *Identity) RegisterUser(ctx context.Context, in *RegisterUserInput) (*identity.User, error) {
	currentUser, ok := auth.GetCurrentUserPassport(ctx)
	if ok && !currentUser.IsAdmin() {
		return nil, errors.New("only admin users can register new users")
	}

	user, err := a.identityService.CreateUser(ctx, &identity.CreateUserInput{
		Username: in.Username,
		Email:    in.Email,
		Password: in.Password,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	// Automatically create a default space for the new user
	principal := access.NewPrincipal(user.ID, "", user.Role, "")

	space := &tenancy.Space{
		Name:        "My Space",
		Alias:       ptr.Of("my-space"),
		Description: ptr.Of("Default space created upon user registration"),
	}

	if err := a.tenancyService.CreateSpace(ctx, principal, space); err != nil {
		return nil, fmt.Errorf("failed to create default space for user: %w", err)
	}

	return user, nil
}

// RegisterAdminUser registers a new admin user in the system.
func (a *Identity) RegisterAdminUser(ctx context.Context, in *RegisterUserInput) (*identity.User, error) {
	return a.identityService.CreateAdminUser(ctx, &identity.CreateUserInput{
		Username: in.Username,
		Email:    in.Email,
		Password: in.Password,
	})
}

func (a *Identity) LoginUser(ctx context.Context, in *LoginUserInput) (*TokenPair, error) {
	user, session, token, err := a.identityService.LoginUser(ctx, &identity.LoginUserInput{
		UsernameOrEmail: in.UsernameOrEmail,
		Password:        in.Password,
		UserAgent:       in.UserAgent,
		ClientIP:        in.ClientIP,
	})
	if err != nil {
		return nil, err
	}

	passport := auth.NewUserPassport(user.ID, user.Username, user.Email, user.Role)
	accessToken, err := a.tokenManager.Generate(ctx, passport, AccessTokenTTL)
	if err != nil {
		return nil, err
	}

	return &TokenPair{
		AccessToken:  string(accessToken),
		RefreshToken: fmt.Sprintf("%s.%s", session.ID.String(), token),
		ExpiresAt:    time.Now().Add(AccessTokenTTL).Unix(),
	}, nil
}

func (a *Identity) RevokeSession(ctx context.Context, refreshToken string) error {
	if refreshToken == "" {
		return errors.New("refresh token is required")
	}

	parts := strings.SplitN(refreshToken, ".", 2)
	if len(parts) != 2 {
		return errors.New("invalid refresh token format")
	}

	return a.identityService.RevokeSession(ctx, identity.SessionID(parts[0]))
}

func (a *Identity) EndAllUserSessions(ctx context.Context) error {
	userID, ok := auth.GetCurrentUserID(ctx)
	if !ok {
		return errors.New("unable to get current user ID from context")
	}

	return a.identityService.RevokeUserSessions(ctx, auth.UserID(userID))
}

func (a *Identity) VerifyAccess(ctx context.Context, token string) (auth.UserPassport, error) {
	if token == "" {
		return auth.UserPassport{}, errors.New("access token is required")
	}

	passport, err := a.tokenManager.Parse(ctx, auth.Token(token))
	if err != nil {
		return auth.UserPassport{}, err
	}

	return passport, nil
}

func (a *Identity) RefreshSessionToken(ctx context.Context, refreshToken string) (*TokenPair, error) {
	if refreshToken == "" {
		return nil, errors.New("refresh token is required")
	}

	parts := strings.SplitN(refreshToken, ".", 2)
	if len(parts) != 2 {
		return nil, errors.New("invalid refresh token format")
	}

	sessionID, token := parts[0], parts[1]
	user, session, newToken, err := a.identityService.RefreshSession(ctx, &identity.RefreshSessionInput{
		SessionID: identity.SessionID(sessionID),
		Token:     token,
	})
	if err != nil {
		return nil, err
	}

	// passport := auth.UserPassport{
	// 	UserID: user.ID,
	// 	Role:   user.Role,
	// 	Email:  user.Email,
	// }
	passport := auth.NewUserPassport(user.ID, user.Username, user.Email, user.Role)
	accessToken, err := a.tokenManager.Generate(ctx, passport, AccessTokenTTL)
	if err != nil {
		return nil, err
	}

	return &TokenPair{
		AccessToken:  string(accessToken),
		RefreshToken: fmt.Sprintf("%s.%s", session.ID.String(), newToken),
		ExpiresAt:    time.Now().Add(AccessTokenTTL).Unix(),
	}, nil
}

type RegisterUserInput struct {
	Username  string
	Email     string
	FirstName string
	LastName  string
	Password  string
}

type LoginUserInput struct {
	UsernameOrEmail string
	Password        string
	UserAgent       string
	ClientIP        string
}

type TokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpiresAt    int64
}
