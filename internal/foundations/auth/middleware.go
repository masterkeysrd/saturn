package auth

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/user"
	"github.com/masterkeysrd/saturn/internal/foundations/errors"
	"github.com/masterkeysrd/saturn/internal/foundations/transport"
)

func Middleware(ctx context.Context, payload []byte, next transport.HandlerFunc) (any, error) {
	op := errors.Op("auth.Middleware")
	claims := transport.WithContext(ctx).Claims()
	if sub := claims.GetString("sub"); sub != "" {
		ctx = user.WithUserID(ctx, user.ID(sub))
		return next(ctx, payload)
	}

	return nil, errors.New(op, errors.Permission, "user not authenticated")
}
