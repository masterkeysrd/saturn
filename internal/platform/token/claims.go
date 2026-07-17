package token

import (
	"fmt"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// Claims holds the standard JWT claims plus application-specific fields.
type Claims struct {
	jwt.RegisteredClaims
	AccessLevel string `json:"role"`
	TokenUse    string `json:"token_use"`
	AuthVersion int64  `json:"auth_version"`
}

// IsAccess returns true if the token is an access token.
func (c *Claims) IsAccess() bool {
	return c.TokenUse == "access"
}

// IsRefresh returns true if the token is a refresh token.
func (c *Claims) IsRefresh() bool {
	return c.TokenUse == "refresh"
}

// ValidateBasic checks that all required claims are present and non-empty.
func (c *Claims) ValidateBasic() error {
	var issues []string
	if c.Subject == "" {
		issues = append(issues, "subject")
	}
	if c.Issuer == "" {
		issues = append(issues, "issuer")
	}
	if len(c.Audience) == 0 {
		issues = append(issues, "audience")
	}
	if c.ID == "" {
		issues = append(issues, "jti")
	}
	if c.TokenUse == "" {
		issues = append(issues, "token_use")
	}
	if len(issues) > 0 {
		return fmt.Errorf("missing claims: %s", strings.Join(issues, ", "))
	}
	return nil
}

// SanitizeClaims returns a claims copy without sensitive data.
// This is a safety net to ensure no secrets leak into JWT payloads.
func SanitizeClaims(c *Claims) *Claims {
	return &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    c.Issuer,
			Subject:   c.Subject,
			Audience:  c.Audience,
			ExpiresAt: c.ExpiresAt,
			IssuedAt:  c.IssuedAt,
			NotBefore: c.NotBefore,
			ID:        c.ID,
		},
		AccessLevel: c.AccessLevel,
		TokenUse:    c.TokenUse,
		AuthVersion: c.AuthVersion,
	}
}
