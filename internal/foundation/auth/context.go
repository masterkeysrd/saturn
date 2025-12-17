package auth

import "context"

type userPassportCtxKey struct{}
type tokenCtxKey struct{}

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

func GetCurrentSessionID(ctx context.Context) (SessionID, bool) {
	passport, ok := ctx.Value(userPassportCtxKey{}).(UserPassport)
	if !ok || passport.IsZero() {
		return "", false
	}
	return passport.SessionID(), true
}

func InjectToken(ctx context.Context, token Token) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}

	if token == "" {
		return ctx
	}

	return context.WithValue(ctx, tokenCtxKey{}, token)
}

func GetToken(ctx context.Context) (Token, bool) {
	token, ok := ctx.Value(tokenCtxKey{}).(Token)
	if !ok || token == "" {
		return "", false
	}
	return token, true
}
