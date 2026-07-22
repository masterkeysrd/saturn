package auth

import (
	"context"
	"net/http"
	"time"

	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
	"google.golang.org/protobuf/proto"
)

// CookieResponseForwarder intercepts gRPC-Gateway responses to set secure HttpOnly cookies
// for access/refresh tokens and clear them on logout.
func CookieResponseForwarder(cookieSecure bool) func(context.Context, http.ResponseWriter, proto.Message) error {
	return func(ctx context.Context, w http.ResponseWriter, resp proto.Message) error {
		type tokenResponse interface {
			GetAccessToken() string
			GetAccessTokenExpiresAt() int64
			GetRefreshToken() string
			GetRefreshTokenExpiresAt() int64
		}

		if tr, ok := resp.(tokenResponse); ok {
			accessToken := tr.GetAccessToken()
			refreshToken := tr.GetRefreshToken()

			if accessToken != "" {
				http.SetCookie(w, &http.Cookie{
					Name:     "access_token",
					Value:    accessToken,
					Path:     "/",
					Expires:  time.Unix(tr.GetAccessTokenExpiresAt(), 0),
					HttpOnly: true,
					Secure:   cookieSecure,
					SameSite: http.SameSiteStrictMode,
				})
			}

			if refreshToken != "" {
				http.SetCookie(w, &http.Cookie{
					Name:     "refresh_token",
					Value:    refreshToken,
					Path:     "/api/v1/identity", // Wider scope to match sessions:refresh under RFC 6265
					Expires:  time.Unix(tr.GetRefreshTokenExpiresAt(), 0),
					HttpOnly: true,
					Secure:   cookieSecure,
					SameSite: http.SameSiteStrictMode,
				})
			}
		}

		// Clear cookies on LogoutResponse
		if _, ok := resp.(*identityv1.LogoutResponse); ok {
			http.SetCookie(w, &http.Cookie{
				Name:     "access_token",
				Value:    "",
				Path:     "/",
				MaxAge:   -1,
				HttpOnly: true,
				Secure:   cookieSecure,
				SameSite: http.SameSiteStrictMode,
			})
			http.SetCookie(w, &http.Cookie{
				Name:     "refresh_token",
				Value:    "",
				Path:     "/api/v1/identity",
				MaxAge:   -1,
				HttpOnly: true,
				Secure:   cookieSecure,
				SameSite: http.SameSiteStrictMode,
			})
		}

		return nil
	}
}
