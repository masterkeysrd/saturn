package identity

import (
	"context"
	"strings"

	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
	"github.com/masterkeysrd/saturn/internal/application/iam"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// IAMApplication holds the identity application layer.
type IAMApplication struct {
	Coordinator iam.Coordinator
}

// NewIAMApplication creates a new IAMApplication.
func NewIAMApplication(coordinator iam.Coordinator) *IAMApplication {
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
	ident := req.GetUserPassword().GetIdentifier()
	pass := req.GetUserPassword().GetPassword()
	ua, ip := extractClientInfo(ctx)

	resp, err := h.IAM.Coordinator.Login(ctx, &iam.LoginRequest{
		Identifier: ident,
		Password:   pass,
		UserAgent:  ua,
		IPAddress:  ip,
	})
	if err != nil {
		return nil, err
	}

	return &identityv1.LoginUserResponse{
		UserId:                string(resp.User.ID),
		AccessToken:           resp.AccessToken,
		AccessTokenExpiresAt:  resp.AccessTokenExpiresAt,
		RefreshToken:          resp.RefreshToken,
		RefreshTokenExpiresAt: resp.RefreshTokenExpiresAt,
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

// GetCurrentUser retrieves the profile of the authenticated user.
func (h *Handler) GetCurrentUser(ctx context.Context, req *identityv1.GetCurrentUserRequest) (*identityv1.User, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "missing principal")
	}

	user, err := h.IAM.Coordinator.GetCurrentUser(ctx, identity.UserID(principal.Subject))
	if err != nil {
		return nil, err
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

// RefreshSession rotates refresh tokens and issues new access/refresh tokens.
func (h *Handler) RefreshSession(ctx context.Context, req *identityv1.RefreshSessionRequest) (*identityv1.RefreshSessionResponse, error) {
	ua, ip := extractClientInfo(ctx)
	refreshToken := req.GetRefreshToken()
	if refreshToken == "" {
		refreshToken = extractCookie(ctx, "refresh_token")
	}

	resp, err := h.IAM.Coordinator.RefreshSession(ctx, &iam.RefreshSessionRequest{
		RefreshToken: refreshToken,
		UserAgent:    ua,
		IPAddress:    ip,
	})
	if err != nil {
		return nil, err
	}

	return &identityv1.RefreshSessionResponse{
		AccessToken:           resp.AccessToken,
		AccessTokenExpiresAt:  resp.AccessTokenExpiresAt,
		RefreshToken:          resp.RefreshToken,
		RefreshTokenExpiresAt: resp.RefreshTokenExpiresAt,
	}, nil
}

// Logout invalidates the active refresh token session.
func (h *Handler) Logout(ctx context.Context, req *identityv1.LogoutRequest) (*identityv1.LogoutResponse, error) {
	refreshToken := req.GetRefreshToken()
	if refreshToken == "" {
		refreshToken = extractCookie(ctx, "refresh_token")
	}

	_, err := h.IAM.Coordinator.Logout(ctx, &iam.LogoutRequest{
		RefreshToken: refreshToken,
	})
	if err != nil {
		return nil, err
	}
	return &identityv1.LogoutResponse{}, nil
}

func extractCookie(ctx context.Context, name string) string {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return ""
	}
	cookies := md["grpcgateway-cookie"]
	if len(cookies) == 0 {
		return ""
	}
	parts := strings.Split(cookies[0], ";")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, name+"=") {
			return strings.TrimPrefix(part, name+"=")
		}
	}
	return ""
}

// ListActiveSessions returns all non-expired, non-revoked sessions for the user.
func (h *Handler) ListActiveSessions(ctx context.Context, req *identityv1.ListActiveSessionsRequest) (*identityv1.ListActiveSessionsResponse, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "missing principal")
	}

	resp, err := h.IAM.Coordinator.ListActiveSessions(ctx, &iam.ListActiveSessionsRequest{
		UserID: principal.Subject,
	})
	if err != nil {
		return nil, err
	}

	sessions := make([]*identityv1.UserSession, len(resp.Sessions))
	for i, s := range resp.Sessions {
		sessions[i] = &identityv1.UserSession{
			SessionId:  s.SessionID,
			UserAgent:  s.UserAgent,
			IpAddress:  s.IPAddress,
			CreateTime: timestamppb.New(s.CreateTime),
			LastUsedAt: timestamppb.New(s.LastUsedAt),
		}
	}

	return &identityv1.ListActiveSessionsResponse{Sessions: sessions}, nil
}

// RevokeSession invalidates a specific user session by ID.
func (h *Handler) RevokeSession(ctx context.Context, req *identityv1.RevokeSessionRequest) (*identityv1.RevokeSessionResponse, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "missing principal")
	}

	_, err := h.IAM.Coordinator.RevokeSession(ctx, &iam.RevokeSessionRequest{
		SessionID: req.GetSessionId(),
		UserID:    principal.Subject,
	})
	if err != nil {
		return nil, err
	}

	return &identityv1.RevokeSessionResponse{}, nil
}

// RevokeAllSessions invalidates all sessions for the user globally.
func (h *Handler) RevokeAllSessions(ctx context.Context, req *identityv1.RevokeAllSessionsRequest) (*identityv1.RevokeAllSessionsResponse, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "missing principal")
	}

	_, err := h.IAM.Coordinator.RevokeAllSessions(ctx, &iam.RevokeAllSessionsRequest{
		UserID: principal.Subject,
	})
	if err != nil {
		return nil, err
	}

	return &identityv1.RevokeAllSessionsResponse{}, nil
}

// ListMySecurityEvents retrieves security audit logs for the currently authenticated user.
func (h *Handler) ListMySecurityEvents(ctx context.Context, req *identityv1.ListMySecurityEventsRequest) (*identityv1.ListMySecurityEventsResponse, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "missing principal")
	}

	userID := identity.UserID(principal.Subject)
	page, err := h.IAM.Coordinator.ListSecurityEvents(ctx, identity.SecurityEventFilter{
		UserID:        &userID,
		Limit:         int(req.GetLimit()),
		NextPageToken: req.GetNextPageToken(),
	})
	if err != nil {
		return nil, err
	}

	pbEvents := make([]*identityv1.SecurityEvent, 0, len(page.Items))
	for _, ev := range page.Items {
		pbEvents = append(pbEvents, &identityv1.SecurityEvent{
			Id:        ev.ID,
			Email:     ev.Email,
			EventType: string(ev.EventType),
			IpAddress: ev.IPAddress,
			UserAgent: ev.UserAgent,
			CreatedAt: timestamppb.New(ev.CreatedAt),
		})
	}

	return &identityv1.ListMySecurityEventsResponse{
		Events:        pbEvents,
		NextPageToken: page.NextPageToken,
	}, nil
}

func extractClientInfo(ctx context.Context) (userAgent, ipAddress string) {
	if md, ok := metadata.FromIncomingContext(ctx); ok {
		if ua := md.Get("grpcgateway-user-agent"); len(ua) > 0 {
			userAgent = ua[0]
		} else if ua := md.Get("user-agent"); len(ua) > 0 {
			userAgent = ua[0]
		}
		if ip := md.Get("x-forwarded-for"); len(ip) > 0 {
			rawIP := ip[0]
			if parts := strings.Split(rawIP, ","); len(parts) > 0 {
				ipAddress = strings.TrimSpace(parts[0])
			}
		}
	}
	return
}
