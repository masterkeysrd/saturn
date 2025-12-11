package middleware

import (
	"context"
	"net/http"
	"net/textproto"

	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/access"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
)

var SpaceHeader = textproto.CanonicalMIMEHeaderKey("X-Space-ID")

type SpaceConfig struct {
	// Paths to exempt from authentication.
	ExemptPaths []string

	// Function to get membership by ID.
	MembershipGetter func(context.Context, space.MembershipID) (*space.Membership, error)
}

type SpaceMiddleware struct {
	config      SpaceConfig
	exemptPaths map[string]struct{}
}

func NewSpaceMiddleware(config SpaceConfig) *SpaceMiddleware {
	if config.MembershipGetter == nil {
		panic("MembershipGetter function must be provided")
	}

	exemptPaths := make(map[string]struct{})
	for _, path := range config.ExemptPaths {
		exemptPaths[path] = struct{}{}
	}

	return &SpaceMiddleware{
		config:      config,
		exemptPaths: exemptPaths,
	}
}

func (sm *SpaceMiddleware) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, skip := sm.exemptPaths[r.URL.Path]; skip {
			next.ServeHTTP(w, r)
			return
		}

		spaceIDs := r.Header[SpaceHeader]
		if len(spaceIDs) == 0 {
			http.Error(w, "Missing X-Space-ID header", http.StatusBadRequest)
			return
		}

		if len(spaceIDs) > 1 {
			http.Error(w, "Ambiguous request: Multiple X-Space-ID headers", http.StatusBadRequest)
			return
		}
		spaceID := space.SpaceID(spaceIDs[0])

		ctx := r.Context()
		passport, ok := auth.GetCurrentUserPassport(ctx)
		if !ok {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		membership, err := sm.config.MembershipGetter(ctx, space.MembershipID{
			SpaceID: space.SpaceID(spaceID),
			UserID:  passport.UserID(),
		})
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}

		var spaceRole space.Role
		if membership != nil {
			spaceRole = membership.Role
		} else {
			if passport.IsAdmin() {
				spaceRole = space.RoleAdmin
			} else {
				http.Error(w, "Space not found or access denied", http.StatusForbidden)
				return
			}
		}

		ctx = access.InjectPrincipal(ctx, access.NewPrincipal(
			passport.UserID(),
			spaceID,
			passport.Role(),
			spaceRole,
		))
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
