package token

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
)

type JWTGenerator struct {
	secret []byte
}

type Claims struct {
	UserID   auth.UserID `json:"user_id"`
	Username string      `json:"username"`
	Role     auth.Role   `json:"role"`
	jwt.RegisteredClaims
}

func NewDefaultJWTGenerator() (*JWTGenerator, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return nil, fmt.Errorf("JWT_SECRET environment variable is not set")
	}
	return NewJWTGenerator(secret), nil
}

func NewJWTGenerator(secret string) *JWTGenerator {
	return &JWTGenerator{
		secret: []byte(secret),
	}
}

func (j *JWTGenerator) Generate(ctx context.Context, passport auth.UserPassport, ttl time.Duration) (auth.Token, error) {
	claims := &Claims{
		UserID:   passport.UserID(),
		Username: passport.Username(),
		Role:     passport.Role(),
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "saturn",
			Subject:   passport.UserID().String(),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signedToken, err := token.SignedString(j.secret)
	if err != nil {
		return "", fmt.Errorf("failed to sign token: %w", err)
	}

	return auth.Token(signedToken), nil
}

func (j *JWTGenerator) Parse(ctx context.Context, tokenStr auth.Token) (auth.UserPassport, error) {
	var claims Claims
	token, err := jwt.ParseWithClaims(tokenStr.String(), &claims, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return j.secret, nil
	})
	if err != nil || !token.Valid {
		return auth.UserPassport{}, fmt.Errorf("invalid token: %w", err)
	}

	passport := auth.NewUserPassport(claims.UserID, claims.Username, "", claims.Role)
	return passport, nil
}
