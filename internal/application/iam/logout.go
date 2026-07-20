package iam

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/hash"
)

// LogoutRequest represents the application input for logging out a session.
type LogoutRequest struct {
	RefreshToken string
}

// LogoutResponse represents the application output after logging out.
type LogoutResponse struct{}

// Logout validates the refresh token and revokes the associated token family.
func (c *Coordinator) Logout(ctx context.Context, req *LogoutRequest) (*LogoutResponse, error) {
	now := time.Now()
	_, err := c.tokenService.ValidateRefreshToken(req.RefreshToken, now)
	if err != nil {
		return nil, err
	}

	rawTokenHash := hash.SHA256String(req.RefreshToken)

	if err := c.identityService.RevokeSessionByHash(ctx, rawTokenHash); err != nil {
		return nil, err
	}

	return &LogoutResponse{}, nil
}
