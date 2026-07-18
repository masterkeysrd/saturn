package identity

import (
	"context"
	"errors"
	"time"

	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
	"github.com/masterkeysrd/saturn/internal/application/iam"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/password"
	"github.com/masterkeysrd/saturn/internal/platform/token"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// IAMApplication holds the identity application layer.
type IAMApplication struct {
	Coordinator  *iam.Coordinator
	TokenService token.Service
}

// NewIAMApplication creates a new IAMApplication.
func NewIAMApplication(coordinator *iam.Coordinator, ts token.Service) *IAMApplication {
	return &IAMApplication{
		Coordinator:  coordinator,
		TokenService: ts,
	}
}

// Handler implements the identityv1.IdentityServer interface.
type Handler struct {
	identityv1.UnimplementedIdentityServer
	IAM *IAMApplication
}

// NewHandler creates a new Identity handler.
func NewHandler(iam *IAMApplication) *Handler {
	return &Handler{IAM: iam}
}

// LoginUser authenticates a user and returns a session token.
func (h *Handler) LoginUser(ctx context.Context, req *identityv1.LoginUserRequest) (*identityv1.LoginUserResponse, error) {
	ident := req.GetUserPassword().GetIdentifier()
	password := req.GetUserPassword().GetPassword()

	user, err := h.IAM.Coordinator.Authenticate(ctx, ident, password)
	if err != nil {
		if errors.Is(err, identity.ErrAccountPendingApproval) {
			return nil, status.Error(codes.PermissionDenied, "account pending approval")
		}
		return nil, status.Error(codes.Unauthenticated, "invalid credentials")
	}

	authVersion, err := h.IAM.Coordinator.GetAuthVersion(ctx, identity.UserID(user.ID))
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to get auth version")
	}

	now := time.Now()
	accessToken, _, err := h.IAM.TokenService.IssueAccessToken(token.IssueInput{
		Subject:     string(user.ID),
		AccessLevel: string(user.AccessLevel),
		AuthVersion: authVersion,
	}, now)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to issue token")
	}

	return &identityv1.LoginUserResponse{
		UserId:               string(user.ID),
		AccessToken:          accessToken,
		AccessTokenExpiresAt: now.Add(15 * time.Minute).Unix(),
	}, nil
}

// RegisterUser creates a new user account.
func (h *Handler) RegisterUser(ctx context.Context, req *identityv1.RegisterUserRequest) (*identityv1.User, error) {
	appReq := &iam.RegisterUserRequest{
		Email:     req.GetEmail(),
		Username:  req.GetUsername(),
		Name:      req.GetName(),
		AvatarURL: req.GetAvatarUrl(),
		Password:  req.GetPassword(),
	}

	appResp, err := h.IAM.Coordinator.Register(ctx, appReq)
	if err != nil {
		if errors.Is(err, password.ErrInvalidPassword) {
			return nil, status.Error(codes.InvalidArgument, "password must be at least 12 characters long")
		}
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &identityv1.User{
		Id:         appResp.UserID,
		Email:      appResp.Email,
		Username:   appResp.Username,
		Name:       appResp.Name,
		AvatarUrl:  appResp.AvatarURL,
		Status:     string(appResp.Status),
		Version:    appResp.Version,
		CreateTime: timestamppb.New(appResp.CreateTime),
		UpdateTime: timestamppb.New(appResp.UpdateTime),
	}, nil
}

// GetCurrentUser retrieves the profile of the authenticated user.
func (h *Handler) GetCurrentUser(ctx context.Context, req *identityv1.GetCurrentUserRequest) (*identityv1.User, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing principal")
	}

	user, err := h.IAM.Coordinator.GetCurrentUser(ctx, identity.UserID(principal.Subject))
	if err != nil {
		return nil, status.Error(codes.NotFound, "user not found")
	}

	return &identityv1.User{
		Id:         string(user.ID),
		Email:      user.Email,
		Username:   user.Username,
		Name:       user.Name,
		AvatarUrl:  user.AvatarURL,
		Status:     string(user.Status),
		Version:    user.Version,
		CreateTime: timestamppb.New(user.CreateTime),
		UpdateTime: timestamppb.New(user.UpdateTime),
	}, nil
}
