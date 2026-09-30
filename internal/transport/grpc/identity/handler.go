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
	"google.golang.org/protobuf/types/known/emptypb"
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

// LoginUser authenticates a user and returns a session token or an MFA challenge.
func (h *Handler) LoginUser(ctx context.Context, req *identityv1.LoginUserRequest) (*identityv1.LoginUserResponse, error) {
	ua, ip := extractClientInfo(ctx)

	var appReq iam.LoginRequest
	appReq.UserAgent = ua
	appReq.IPAddress = ip

	switch m := req.GetMethod().(type) {
	case *identityv1.LoginUserRequest_DeviceAssertion_:
		if assertion := m.DeviceAssertion; assertion != nil {
			appReq.DeviceID = assertion.GetDeviceId()
			appReq.Challenge = assertion.GetChallenge()
			appReq.Signature = assertion.GetSignature()
		}
	case *identityv1.LoginUserRequest_MfaAssertion_:
		if assertion := m.MfaAssertion; assertion != nil {
			appReq.MFATicket = assertion.GetMfaTicket()
			appReq.FactorID = assertion.GetFactorId()
			appReq.TOTPCode = assertion.GetTotpCode()
			appReq.BackupCode = assertion.GetBackupCode()
		}
	case *identityv1.LoginUserRequest_UserPassword_:
		if userPass := m.UserPassword; userPass != nil {
			appReq.Identifier = userPass.GetIdentifier()
			appReq.Password = userPass.GetPassword()
		}
	default:
		return nil, errors.E(errors.Invalid, "unsupported login method")
	}

	resp, err := h.IAM.Coordinator.Login(ctx, &appReq)
	if err != nil {
		return nil, err
	}

	if resp.MFA != nil {
		var factors []*identityv1.MfaFactorDescriptor
		for _, f := range resp.MFA.AvailableFactors {
			factors = append(factors, &identityv1.MfaFactorDescriptor{
				FactorId:  string(f.ID),
				Type:      string(f.Type),
				Name:      f.Name,
				IsPrimary: f.IsPrimary,
			})
		}
		return &identityv1.LoginUserResponse{
			Mfa: &identityv1.LoginUserResponse_MfaChallenge{
				Ticket:           resp.MFA.Ticket,
				AvailableFactors: factors,
			},
		}, nil
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

// ListMFAFactors lists all active MFA factors for the authenticated user.
func (h *Handler) ListMFAFactors(ctx context.Context, req *identityv1.ListMFAFactorsRequest) (*identityv1.ListMFAFactorsResponse, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "missing principal")
	}

	resp, err := h.IAM.Coordinator.ListMFAFactors(ctx, &iam.ListMFAFactorsRequest{
		UserID: identity.UserID(principal.Subject),
	})
	if err != nil {
		return nil, err
	}

	var factors []*identityv1.MfaFactorDescriptor
	for _, f := range resp.Factors {
		factors = append(factors, &identityv1.MfaFactorDescriptor{
			FactorId:  string(f.ID),
			Type:      string(f.Type),
			Name:      f.Name,
			IsPrimary: f.IsPrimary,
		})
	}

	return &identityv1.ListMFAFactorsResponse{
		Factors:              factors,
		HasBackupCodes:       resp.HasBackupCodes,
		RemainingBackupCodes: int32(resp.RemainingBackupCodes),
	}, nil
}

// DeleteMFAFactor revokes an MFA factor for the authenticated user.
func (h *Handler) DeleteMFAFactor(ctx context.Context, req *identityv1.DeleteMFAFactorRequest) (*emptypb.Empty, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "missing principal")
	}

	err := h.IAM.Coordinator.DeleteMFAFactor(ctx, &iam.DeleteMFAFactorRequest{
		UserID:   identity.UserID(principal.Subject),
		FactorID: identity.MFAFactorID(req.GetFactorId()),
	})
	if err != nil {
		return nil, err
	}

	return &emptypb.Empty{}, nil
}

// SetPrimaryMFAFactor sets an active MFA factor as the primary factor.
func (h *Handler) SetPrimaryMFAFactor(ctx context.Context, req *identityv1.SetPrimaryMFAFactorRequest) (*emptypb.Empty, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "missing principal")
	}

	err := h.IAM.Coordinator.SetPrimaryMFAFactor(ctx, &iam.SetPrimaryMFAFactorRequest{
		UserID:   identity.UserID(principal.Subject),
		FactorID: identity.MFAFactorID(req.GetFactorId()),
	})
	if err != nil {
		return nil, err
	}

	return &emptypb.Empty{}, nil
}

// SetupTOTP initiates enrollment of a new authenticator app factor.
func (h *Handler) SetupTOTP(ctx context.Context, req *identityv1.SetupTOTPRequest) (*identityv1.SetupTOTPResponse, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "missing principal")
	}

	resp, err := h.IAM.Coordinator.SetupTOTP(ctx, &iam.SetupTOTPRequest{
		UserID: identity.UserID(principal.Subject),
		Name:   req.GetName(),
	})
	if err != nil {
		return nil, err
	}

	return &identityv1.SetupTOTPResponse{
		FactorId:   resp.FactorID,
		Secret:     resp.Secret,
		OtpauthUri: resp.OtpauthURI,
		QrCodeSvg:  resp.QRCodeSVG,
	}, nil
}

// ConfirmTOTP verifies the first code from an authenticator app and activates it.
func (h *Handler) ConfirmTOTP(ctx context.Context, req *identityv1.ConfirmTOTPRequest) (*identityv1.ConfirmTOTPResponse, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "missing principal")
	}

	resp, err := h.IAM.Coordinator.ConfirmTOTP(ctx, &iam.ConfirmTOTPRequest{
		UserID:   identity.UserID(principal.Subject),
		FactorID: req.GetFactorId(),
		Code:     req.GetCode(),
	})
	if err != nil {
		return nil, err
	}

	return &identityv1.ConfirmTOTPResponse{
		BackupCodes: resp.BackupCodes,
	}, nil
}

// RegenerateBackupCodes creates a fresh set of recovery codes after step-up verification.
func (h *Handler) RegenerateBackupCodes(ctx context.Context, req *identityv1.RegenerateBackupCodesRequest) (*identityv1.RegenerateBackupCodesResponse, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "missing principal")
	}

	resp, err := h.IAM.Coordinator.RegenerateBackupCodes(ctx, &iam.RegenerateBackupCodesRequest{
		UserID:           identity.UserID(principal.Subject),
		VerificationCode: req.GetVerificationCode(),
	})
	if err != nil {
		return nil, err
	}

	return &identityv1.RegenerateBackupCodesResponse{
		BackupCodes: resp.BackupCodes,
	}, nil
}

// CreateAuthChallenge creates an ephemeral challenge nonce for device registration or biometric assertion.
func (h *Handler) CreateAuthChallenge(ctx context.Context, req *identityv1.CreateAuthChallengeRequest) (*identityv1.CreateAuthChallengeResponse, error) {
	resp, err := h.IAM.Coordinator.CreateAuthChallenge(ctx)
	if err != nil {
		return nil, err
	}
	return &identityv1.CreateAuthChallengeResponse{
		Challenge: resp.Challenge,
		ExpiresAt: resp.ExpiresAt,
	}, nil
}

// CreateDevice registers a new trusted hardware device key for the authenticated user.
func (h *Handler) CreateDevice(ctx context.Context, req *identityv1.CreateDeviceRequest) (*identityv1.Device, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "missing principal")
	}

	d := req.GetDevice()
	if d == nil {
		return nil, errors.E(errors.Invalid, "device is required")
	}

	dev, err := h.IAM.Coordinator.CreateDevice(ctx, &iam.CreateDeviceRequest{
		UserID:     identity.UserID(principal.Subject),
		DeviceName: d.GetDeviceName(),
		PublicKey:  d.GetPublicKey(),
		Algorithm:  d.GetAlgorithm(),
		Challenge:  d.GetChallenge(),
		Signature:  d.GetSignature(),
		TOTPCode:   d.GetTotpCode(),
	})
	if err != nil {
		return nil, err
	}

	return toProtoDevice(dev), nil
}

// ListDevices returns all active trusted devices for the authenticated caller.
func (h *Handler) ListDevices(ctx context.Context, req *identityv1.ListDevicesRequest) (*identityv1.ListDevicesResponse, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "missing principal")
	}

	resp, err := h.IAM.Coordinator.ListDevices(ctx, &iam.ListDevicesRequest{
		UserID: identity.UserID(principal.Subject),
	})
	if err != nil {
		return nil, err
	}

	protoDevices := make([]*identityv1.Device, len(resp.Devices))
	for i, d := range resp.Devices {
		protoDevices[i] = toProtoDevice(d)
	}

	return &identityv1.ListDevicesResponse{
		Devices: protoDevices,
	}, nil
}

func toProtoDevice(d *identity.Device) *identityv1.Device {
	if d == nil {
		return nil
	}
	dev := &identityv1.Device{
		Id:         string(d.ID),
		DeviceName: d.DeviceName,
		Algorithm:  d.KeyAlgorithm,
		CreateTime: timestamppb.New(d.CreatedAt),
		ExpireTime: timestamppb.New(d.ExpiresAt),
	}
	if d.LastUsedAt != nil {
		dev.LastUsedTime = timestamppb.New(*d.LastUsedAt)
	}
	return dev
}

// RevokeDevice revokes a trusted device and terminates its associated active sessions.
func (h *Handler) RevokeDevice(ctx context.Context, req *identityv1.RevokeDeviceRequest) (*emptypb.Empty, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "missing principal")
	}

	deviceID, err := identity.ParseDeviceID(req.GetDeviceId())
	if err != nil {
		return nil, errors.E(errors.Invalid, identity.DeviceNotFound, "invalid device id format")
	}

	if err := h.IAM.Coordinator.RevokeDevice(ctx, &iam.RevokeDeviceRequest{
		UserID:   identity.UserID(principal.Subject),
		DeviceID: deviceID,
	}); err != nil {
		return nil, err
	}

	return &emptypb.Empty{}, nil
}

// ValidateResetToken checks whether a password reset token is valid before displaying the form.
func (h *Handler) ValidateResetToken(ctx context.Context, req *identityv1.ValidateResetTokenRequest) (*identityv1.ValidateResetTokenResponse, error) {
	resp, err := h.IAM.Coordinator.ValidateResetToken(ctx, &iam.ValidateResetTokenRequest{
		Token: req.GetToken(),
	})
	if err != nil {
		return nil, err
	}

	return &identityv1.ValidateResetTokenResponse{
		Username: resp.Username,
	}, nil
}

// CompleteResetPassword consumes a reset token and sets the new password.
func (h *Handler) CompleteResetPassword(ctx context.Context, req *identityv1.CompleteResetPasswordRequest) (*emptypb.Empty, error) {
	err := h.IAM.Coordinator.CompleteResetPassword(ctx, &iam.CompleteResetPasswordRequest{
		Token:       req.GetToken(),
		NewPassword: req.GetNewPassword(),
	})
	if err != nil {
		return nil, err
	}

	return &emptypb.Empty{}, nil
}

// ChangePassword updates the authenticated user's password, invalidates sessions, and returns fresh tokens.
func (h *Handler) ChangePassword(ctx context.Context, req *identityv1.ChangePasswordRequest) (*identityv1.ChangePasswordResponse, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "missing principal")
	}

	ua, ip := extractClientInfo(ctx)

	resp, err := h.IAM.Coordinator.ChangePassword(ctx, &iam.ChangePasswordRequest{
		UserID:              principal.Subject,
		CurrentPassword:     req.GetCurrentPassword(),
		NewPassword:         req.GetNewPassword(),
		TOTPCode:            req.GetTotpCode(),
		RevokeOtherSessions: req.GetRevokeOtherSessions(),
		UserAgent:           ua,
		IPAddress:           ip,
	})
	if err != nil {
		return nil, err
	}

	return &identityv1.ChangePasswordResponse{
		AccessToken:           resp.AccessToken,
		AccessTokenExpiresAt:  resp.AccessTokenExpiresAt,
		RefreshToken:          resp.RefreshToken,
		RefreshTokenExpiresAt: resp.RefreshTokenExpiresAt,
	}, nil
}

// UpdateProfile updates profile information for the authenticated user.
func (h *Handler) UpdateProfile(ctx context.Context, req *identityv1.UpdateProfileRequest) (*identityv1.User, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "missing principal")
	}

	appReq := &iam.UpdateProfileRequest{
		UserID: principal.Subject,
	}
	if req.Name != nil {
		appReq.Name = req.Name
	}
	if req.AvatarUrl != nil {
		appReq.AvatarURL = req.AvatarUrl
	}

	user, err := h.IAM.Coordinator.UpdateProfile(ctx, appReq)
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

// ChangeEmail updates the primary email for the authenticated user, requiring re-authentication.
func (h *Handler) ChangeEmail(ctx context.Context, req *identityv1.ChangeEmailRequest) (*identityv1.User, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "missing principal")
	}

	ua, ip := extractClientInfo(ctx)

	user, err := h.IAM.Coordinator.ChangeEmail(ctx, &iam.ChangeEmailRequest{
		UserID:          principal.Subject,
		NewEmail:        req.GetNewEmail(),
		CurrentPassword: req.GetCurrentPassword(),
		TOTPCode:        req.GetTotpCode(),
		UserAgent:       ua,
		IPAddress:       ip,
	})
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

// DeleteAccount permanently deactivates the user account and revokes all credentials.
func (h *Handler) DeleteAccount(ctx context.Context, req *identityv1.DeleteAccountRequest) (*emptypb.Empty, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(errors.Unauthenticated, "missing principal")
	}

	ua, ip := extractClientInfo(ctx)

	if err := h.IAM.Coordinator.DeleteAccount(ctx, &iam.DeleteAccountRequest{
		UserID:          principal.Subject,
		CurrentPassword: req.GetCurrentPassword(),
		TOTPCode:        req.GetTotpCode(),
		UserAgent:       ua,
		IPAddress:       ip,
	}); err != nil {
		return nil, err
	}

	return &emptypb.Empty{}, nil
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
