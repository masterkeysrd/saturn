package auth

import "context"

type userPassportCtxKey struct{}

func InjectUserPassport(ctx context.Context, passport UserPassport) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}

	if passport.IsZero() {
		return ctx
	}

	return context.WithValue(ctx, userPassportCtxKey{}, passport)
}

func GetCurrentUserPassport(ctx context.Context) (UserPassport, bool) {
	passport, ok := ctx.Value(userPassportCtxKey{}).(UserPassport)
	if !ok || passport.IsZero() {
		return UserPassport{}, false
	}
	return passport, true
}

func GetCurrentUserID(ctx context.Context) (UserID, bool) {
	passport, ok := ctx.Value(userPassportCtxKey{}).(UserPassport)
	if !ok || passport.IsZero() {
		return "", false
	}
	return passport.UserID(), true
}
