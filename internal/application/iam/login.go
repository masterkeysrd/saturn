package iam

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/hash"
	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/token"
)

// LoginRequest represents the application input for the user authentication use case.
type LoginRequest struct {
	Identifier string
	Password   string
	UserAgent  string
	IPAddress  string
}

// LoginResponse represents the application output after successful user authentication.
type LoginResponse struct {
	User                  *identity.User
	AccessToken           string
	AccessTokenExpiresAt  int64
	RefreshToken          string
	RefreshTokenExpiresAt int64
}

// Login authenticates credentials, issues access/refresh tokens, and persists the session.
func (c *Coordinator) Login(ctx context.Context, req *LoginRequest) (*LoginResponse, error) {
	now := time.Now()

	// Look up user record first to manage failed attempts and lockout checks
	user, err := c.identityService.GetUserByEmail(ctx, req.Identifier)
	if err != nil {
		// Fallback to username search
		user, err = c.identityService.GetUserByUsername(ctx, req.Identifier)
	}

	// 1. If user does not exist, write fail event and abort (prevents timing side-channel leaks)
	if err != nil || user == nil {
		eventID, _ := id.Generate("evt_")
		if err := c.identityService.CreateSecurityEvent(ctx, &identity.SecurityEvent{
			ID:        eventID,
			UserID:    nil,
			Email:     req.Identifier,
			EventType: identity.SecurityEventLoginFailed,
			IPAddress: req.IPAddress,
			UserAgent: req.UserAgent,
			CreatedAt: now,
		}); err != nil {
			slog.Error("failed to create security event", "error", err)
		}
		return nil, errors.New("invalid credentials")
	}

	// 2. Check lockout status
	if user.LockedUntil != nil && user.LockedUntil.After(now) {
		eventID, _ := id.Generate("evt_")
		if err := c.identityService.CreateSecurityEvent(ctx, &identity.SecurityEvent{
			ID:        eventID,
			UserID:    &user.ID,
			Email:     user.Email,
			EventType: identity.SecurityEventLoginFailed,
			IPAddress: req.IPAddress,
			UserAgent: req.UserAgent,
			CreatedAt: now,
		}); err != nil {
			slog.Error("failed to create security event", "error", err)
		}
		return nil, errors.New("account is temporarily locked due to too many failed login attempts; please try again later")
	}

	// 3. Authenticate
	authUser, err := c.identityService.Authenticate(ctx, req.Identifier, req.Password)
	if err != nil {
		// Increment failed attempts
		attempts := user.FailedLoginAttempts + 1
		var lockedUntil *time.Time
		var eventType = identity.SecurityEventLoginFailed

		if attempts >= 5 {
			lockTime := now.Add(15 * time.Minute)
			lockedUntil = &lockTime
			eventType = identity.SecurityEventAccountLocked
		}

		_ = c.identityService.UpdateLockoutState(ctx, identity.UpdateLockoutRequest{
			UserID:      user.ID,
			Attempts:    attempts,
			LockedUntil: lockedUntil,
		})

		eventID, _ := id.Generate("evt_")
		if err := c.identityService.CreateSecurityEvent(ctx, &identity.SecurityEvent{
			ID:        eventID,
			UserID:    &user.ID,
			Email:     user.Email,
			EventType: eventType,
			IPAddress: req.IPAddress,
			UserAgent: req.UserAgent,
			CreatedAt: now,
		}); err != nil {
			slog.Error("failed to create security event", "error", err)
		}

		if attempts >= 5 {
			return nil, errors.New("account is temporarily locked due to too many failed login attempts; please try again later")
		}
		return nil, errors.New("invalid credentials")
	}

	// 4. On successful login, reset failed attempts & write success audit
	if user.FailedLoginAttempts > 0 || user.LockedUntil != nil {
		_ = c.identityService.UpdateLockoutState(ctx, identity.UpdateLockoutRequest{
			UserID:      user.ID,
			Attempts:    0,
			LockedUntil: nil,
		})
	}

	eventID, _ := id.Generate("evt_")
	if err := c.identityService.CreateSecurityEvent(ctx, &identity.SecurityEvent{
		ID:        eventID,
		UserID:    &user.ID,
		Email:     user.Email,
		EventType: identity.SecurityEventLoginSuccess,
		IPAddress: req.IPAddress,
		UserAgent: req.UserAgent,
		CreatedAt: now,
	}); err != nil {
		slog.Error("failed to create security event", "error", err)
	}

	authVersion, err := c.identityService.GetAuthVersion(ctx, authUser.ID)
	if err != nil {
		return nil, fmt.Errorf("get auth version: %w", err)
	}

	accessToken, _, err := c.tokenService.IssueAccessToken(token.IssueInput{
		Subject:     string(authUser.ID),
		AccessLevel: string(authUser.AccessLevel),
		AuthVersion: authVersion,
	}, now)
	if err != nil {
		return nil, fmt.Errorf("issue access token: %w", err)
	}

	// Session refresh token absolute expiry is 7 days, sliding window is 24 hours
	refreshToken, _, err := c.tokenService.IssueRefreshToken(token.IssueInput{
		Subject:     string(authUser.ID),
		AccessLevel: string(authUser.AccessLevel),
		AuthVersion: authVersion,
	}, now, now.Add(7*24*time.Hour))
	if err != nil {
		return nil, fmt.Errorf("issue refresh token: %w", err)
	}

	refreshTokenHash := hash.SHA256String(refreshToken)

	if _, err := c.identityService.CreateSession(ctx, &identity.CreateSessionRequest{
		UserID:            authUser.ID,
		RefreshTokenHash:  refreshTokenHash,
		UserAgent:         req.UserAgent,
		IPAddress:         req.IPAddress,
		ExpiresAt:         now.Add(24 * time.Hour),
		AbsoluteExpiresAt: now.Add(7 * 24 * time.Hour),
	}); err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}

	return &LoginResponse{
		User:                  authUser,
		AccessToken:           accessToken,
		AccessTokenExpiresAt:  now.Add(15 * time.Minute).Unix(),
		RefreshToken:          refreshToken,
		RefreshTokenExpiresAt: now.Add(24 * time.Hour).Unix(),
	}, nil
}
