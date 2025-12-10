package auth

import "context"

type userPassportCtxKey struct{}

func InjectUserPassport(ctx context.Context, passport *UserPassport) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}

	if passport == nil {
		return ctx
	}

	return context.WithValue(ctx, userPassportCtxKey{}, passport)
}

func GetCurrentUserPassport(ctx context.Context) (*UserPassport, bool) {
	passport, ok := ctx.Value(userPassportCtxKey{}).(*UserPassport)
	if !ok || passport == nil {
		return nil, false
	}
	return passport, true
}

func GetCurrentUserID(ctx context.Context) (string, bool) {
	passport, ok := ctx.Value(userPassportCtxKey{}).(*UserPassport)
	if !ok || passport == nil {
		return "", false
	}
	return passport.UserID, true
}
