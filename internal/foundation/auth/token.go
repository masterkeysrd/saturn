package auth

import (
	"context"
	"time"
)

type Token string

func (t Token) String() string {
	return string(t)
}

type TokenManager interface {
	Generate(context.Context, *UserPassport, time.Duration) (Token, error)
	Parse(context.Context, Token) (*UserPassport, error)
}
