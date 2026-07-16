package identity

import (
	"context"

	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
	"github.com/masterkeysrd/saturn/internal/application/iam"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// IAMApplication holds the identity application layer.
type IAMApplication struct {
	Coordinator *iam.Coordinator
}

// NewIAMApplication creates a new IAMApplication.
func NewIAMApplication(coordinator *iam.Coordinator) *IAMApplication {
	return &IAMApplication{
		Coordinator: coordinator,
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
	// TODO: implement user authentication logic.
	return nil, nil
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
		return nil, err
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
