package iam

import (
	"context"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/hash"
	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/token"
)

// LoginRequest represents the application input for user authentication.
type LoginRequest struct {
	// Primary credentials (Step 1)
	Identifier string
	Password   string

	// Second-factor assertion (Step 2)
	MFATicket  string
	FactorID   string
	TOTPCode   string
	BackupCode string

	// Device biometric assertion
	DeviceID  string
	Challenge string
	Signature []byte

	UserAgent string
	IPAddress string
}

// MFAChallenge represents an active second-factor verification challenge.
type MFAChallenge struct {
	Ticket           string
	AvailableFactors []*identity.MFAFactor
}

// LoginResponse represents the application output after successful user authentication or MFA challenge.
type LoginResponse struct {
	// MFA challenge details (when Step 2 verification is required)
	MFA *MFAChallenge

	// Finalized session fields
	User                  *identity.User
	AccessToken           string
	AccessTokenExpiresAt  int64
	RefreshToken          string
	RefreshTokenExpiresAt int64
}

// Login authenticates credentials or MFA assertion, issues access/refresh tokens, and persists the session.
func (c *coordinator) Login(ctx context.Context, req *LoginRequest) (*LoginResponse, error) {
	now := time.Now()

	if req.DeviceID != "" {
		return c.loginWithDeviceAssertion(ctx, req, now)
	}

	if req.MFATicket != "" {
		return c.loginWithMFATicket(ctx, req, now)
	}

	return c.loginWithCredentials(ctx, req, now)
}

// loginWithMFATicket verifies the second-factor assertion and finalizes the session.
func (c *coordinator) loginWithMFATicket(ctx context.Context, req *LoginRequest, now time.Time) (*LoginResponse, error) {
	const op errors.Op = "application/iam.loginWithMFATicket"

	claims, err := c.tokenService.ValidateMFATicket(req.MFATicket, now)
	if err != nil {
		return nil, errors.E(op, errors.Unauthenticated, identity.MFAInvalidTicket, "invalid or expired mfa ticket")
	}

	userID := identity.UserID(claims.Subject)
	user, err := c.identityService.GetUserByID(ctx, userID)
	if err != nil {
		return nil, errors.E(op, errors.Unauthenticated, identity.InvalidCredentials, "user not found")
	}

	if user.Status != identity.UserStatusActive || user.AuthVersion != claims.AuthVersion {
		return nil, errors.E(op, errors.Unauthenticated, identity.InvalidCredentials, "account state changed")
	}

	if err := c.identityService.VerifyMFAAssertion(ctx, identity.VerifyMFAAssertionRequest{
		UserID:     userID,
		FactorID:   req.FactorID,
		TOTPCode:   req.TOTPCode,
		BackupCode: req.BackupCode,
	}); err != nil {
		return nil, errors.E(op, err)
	}

	// Security audit log for successful 2FA
	eventID, _ := id.Generate("evt_")
	_ = c.identityService.CreateSecurityEvent(ctx, &identity.SecurityEvent{
		ID:        eventID,
		UserID:    &user.ID,
		Email:     user.Email,
		EventType: identity.SecurityEventLoginSuccess,
		IPAddress: req.IPAddress,
		UserAgent: req.UserAgent,
		CreatedAt: now,
	})

	return c.finalizeLoginSession(ctx, finalizeSessionParams{
		User: user,
		Req:  req,
		Now:  now,
	})
}

// loginWithCredentials verifies primary credentials, evaluates brute-force protection,
// and issues either a second-factor challenge or a finalized authenticated session.
func (c *coordinator) loginWithCredentials(ctx context.Context, req *LoginRequest, now time.Time) (*LoginResponse, error) {
	const op errors.Op = "application/iam.loginWithCredentials"

	user, err := c.identityService.GetUserByEmail(ctx, req.Identifier)
	if err != nil {
		user, err = c.identityService.GetUserByUsername(ctx, req.Identifier)
	}

	// 1. If user does not exist, write fail event and abort (prevents timing leaks)
	if err != nil || user == nil {
		eventID, _ := id.Generate("evt_")
		_ = c.identityService.CreateSecurityEvent(ctx, &identity.SecurityEvent{
			ID:        eventID,
			Email:     req.Identifier,
			EventType: identity.SecurityEventLoginFailed,
			IPAddress: req.IPAddress,
			UserAgent: req.UserAgent,
			CreatedAt: now,
		})
		return nil, errors.E(op, errors.Unauthenticated, identity.InvalidCredentials, "invalid credentials")
	}

	// 2. Check lockout status
	if user.LockedUntil != nil && user.LockedUntil.After(now) {
		eventID, _ := id.Generate("evt_")
		_ = c.identityService.CreateSecurityEvent(ctx, &identity.SecurityEvent{
			ID:        eventID,
			UserID:    &user.ID,
			Email:     user.Email,
			EventType: identity.SecurityEventLoginFailed,
			IPAddress: req.IPAddress,
			UserAgent: req.UserAgent,
			CreatedAt: now,
		})
		return nil, errors.E(op, errors.ResourceExhausted, identity.AccountLocked, "account is temporarily locked due to too many failed login attempts; please try again later")
	}

	// 3. Authenticate password
	authUser, err := c.identityService.Authenticate(ctx, req.Identifier, req.Password)
	if err != nil {
		code := errors.CodeOf(err)
		if code == identity.AccountPending ||
			code == identity.AccountSuspended ||
			code == identity.AccountInactive {
			return nil, errors.E(op, err)
		}

		attempts := user.FailedLoginAttempts + 1
		var lockedUntil *time.Time
		var eventType = identity.SecurityEventLoginFailed

		if attempts >= 5 {
			lockedUntil = new(time.Time)
			*lockedUntil = now.Add(15 * time.Minute)
			eventType = identity.SecurityEventAccountLocked
		}

		_ = c.identityService.UpdateLockoutState(ctx, identity.UpdateLockoutRequest{
			UserID:      user.ID,
			Attempts:    attempts,
			LockedUntil: lockedUntil,
		})

		eventID, _ := id.Generate("evt_")
		_ = c.identityService.CreateSecurityEvent(ctx, &identity.SecurityEvent{
			ID:        eventID,
			UserID:    &user.ID,
			Email:     user.Email,
			EventType: eventType,
			IPAddress: req.IPAddress,
			UserAgent: req.UserAgent,
			CreatedAt: now,
		})

		if attempts >= 5 {
			return nil, errors.E(op, errors.ResourceExhausted, identity.AccountLocked, "account is temporarily locked due to too many failed login attempts; please try again later")
		}
		return nil, errors.E(op, errors.Unauthenticated, identity.InvalidCredentials, "invalid credentials")
	}

	// 4. On successful login, reset failed attempts
	if user.FailedLoginAttempts > 0 || user.LockedUntil != nil {
		_ = c.identityService.UpdateLockoutState(ctx, identity.UpdateLockoutRequest{
			UserID:      user.ID,
			Attempts:    0,
			LockedUntil: nil,
		})
	}

	// 5. Check if user has active enrolled MFA factors
	hasMFA, factors, err := c.identityService.HasActiveMFA(ctx, authUser.ID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	if hasMFA {
		ticket, _, err := c.tokenService.IssueMFATicket(token.IssueInput{
			Subject:     string(authUser.ID),
			AccessLevel: string(authUser.AccessLevel),
			AuthVersion: authUser.AuthVersion,
		}, now)
		if err != nil {
			return nil, errors.E(op, fmt.Errorf("issue mfa ticket: %w", err))
		}

		return &LoginResponse{
			MFA: &MFAChallenge{
				Ticket:           ticket,
				AvailableFactors: factors,
			},
			User: authUser,
		}, nil
	}

	// 6. Single-factor successful login: write audit event and finalize session
	eventID, _ := id.Generate("evt_")
	_ = c.identityService.CreateSecurityEvent(ctx, &identity.SecurityEvent{
		ID:        eventID,
		UserID:    &user.ID,
		Email:     user.Email,
		EventType: identity.SecurityEventLoginSuccess,
		IPAddress: req.IPAddress,
		UserAgent: req.UserAgent,
		CreatedAt: now,
	})

	return c.finalizeLoginSession(ctx, finalizeSessionParams{
		User: authUser,
		Req:  req,
		Now:  now,
	})
}

// loginWithDeviceAssertion verifies a cryptographic assertion from an enrolled trusted hardware device and finalizes the session.
func (c *coordinator) loginWithDeviceAssertion(ctx context.Context, req *LoginRequest, now time.Time) (*LoginResponse, error) {
	const op errors.Op = "iam.loginWithDeviceAssertion"

	deviceID, err := identity.ParseDeviceID(req.DeviceID)
	if err != nil {
		return nil, errors.E(op, errors.Invalid, identity.DeviceNotFound, "invalid device id format")
	}

	device, user, err := c.identityService.VerifyDeviceAssertion(ctx, identity.VerifyDeviceAssertionRequest{
		DeviceID:  deviceID,
		Challenge: req.Challenge,
		Signature: req.Signature,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	if user.Status != identity.UserStatusActive {
		return nil, errors.E(op, errors.Unauthenticated, identity.AccountInactive, "account is not active")
	}

	// Security audit log for biometric sign-in
	eventID, _ := id.Generate("evt_")
	_ = c.identityService.CreateSecurityEvent(ctx, &identity.SecurityEvent{
		ID:        eventID,
		UserID:    &user.ID,
		Email:     user.Email,
		EventType: identity.SecurityEventLoginSuccess,
		IPAddress: req.IPAddress,
		UserAgent: req.UserAgent,
		CreatedAt: now,
	})

	return c.finalizeLoginSession(ctx, finalizeSessionParams{
		User:     user,
		Req:      req,
		Now:      now,
		DeviceID: &device.ID,
	})
}

type finalizeSessionParams struct {
	User     *identity.User
	Req      *LoginRequest
	Now      time.Time
	DeviceID *identity.DeviceID
}

func (c *coordinator) finalizeLoginSession(ctx context.Context, p finalizeSessionParams) (*LoginResponse, error) {
	const op errors.Op = "iam.finalizeLoginSession"

	authVersion, err := c.identityService.GetAuthVersion(ctx, p.User.ID)
	if err != nil {
		return nil, errors.E(op, fmt.Errorf("get auth version: %w", err))
	}

	refreshToken, _, err := c.tokenService.IssueRefreshToken(token.IssueInput{
		Subject:     string(p.User.ID),
		AccessLevel: string(p.User.AccessLevel),
		AuthVersion: authVersion,
	}, p.Now, p.Now.Add(7*24*time.Hour))
	if err != nil {
		return nil, errors.E(op, fmt.Errorf("issue refresh token: %w", err))
	}

	refreshTokenHash := hash.SHA256String(refreshToken)

	session, err := c.identityService.CreateSession(ctx, &identity.CreateSessionRequest{
		UserID:            p.User.ID,
		DeviceID:          p.DeviceID,
		RefreshTokenHash:  refreshTokenHash,
		UserAgent:         p.Req.UserAgent,
		IPAddress:         p.Req.IPAddress,
		ExpiresAt:         p.Now.Add(24 * time.Hour),
		AbsoluteExpiresAt: p.Now.Add(7 * 24 * time.Hour),
	})
	if err != nil {
		return nil, errors.E(op, fmt.Errorf("create session: %w", err))
	}

	accessToken, _, err := c.tokenService.IssueAccessToken(token.IssueInput{
		Subject:     string(p.User.ID),
		AccessLevel: string(p.User.AccessLevel),
		AuthVersion: authVersion,
		SessionID:   string(session.ID),
	}, p.Now)
	if err != nil {
		return nil, errors.E(op, fmt.Errorf("issue access token: %w", err))
	}

	return &LoginResponse{
		User:                  p.User,
		AccessToken:           accessToken,
		AccessTokenExpiresAt:  p.Now.Add(15 * time.Minute).Unix(),
		RefreshToken:          refreshToken,
		RefreshTokenExpiresAt: p.Now.Add(24 * time.Hour).Unix(),
	}, nil
}
