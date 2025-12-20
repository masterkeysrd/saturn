package middleware

import (
	"context"
	"log"
	"net/http"
	"net/textproto"
	"strings"

	"github.com/masterkeysrd/saturn/internal/domain/tenancy"
	"github.com/masterkeysrd/saturn/internal/foundation/access"
)

var SpaceHeader = textproto.CanonicalMIMEHeaderKey("X-Saturn-Space-ID")

type SpaceConfig struct {
	// Paths to exempt from authentication.
	ExemptPaths []string

	// Function to get membership by ID.
	MembershipGetter func(context.Context, tenancy.MembershipID) (*tenancy.Membership, error)
}

type SpaceMiddleware struct {
	config      SpaceConfig
	exemptPaths []struct {
		path        string
		methods     []string
		matchPrefix bool
	}
}

func NewSpaceMiddleware(config SpaceConfig) *SpaceMiddleware {
	if config.MembershipGetter == nil {
		panic("MembershipGetter function must be provided")
	}

	sm := &SpaceMiddleware{
		config: config,
	}

	for _, p := range config.ExemptPaths {
		var path string
		var methods []string

		parts := strings.SplitN(p, " ", 2)
		if len(parts) == 2 {
			methods = strings.Split(parts[0], ",")
			path = parts[1]
		} else {
			path = parts[0]
			methods = nil
		}

		matchPrefix := false
		if strings.HasSuffix(path, "*") {
			matchPrefix = true
			path = strings.TrimSuffix(path, "*")
			path = strings.TrimSuffix(path, "/")
		}

		sm.exemptPaths = append(sm.exemptPaths, struct {
			path        string
			methods     []string
			matchPrefix bool
		}{
			path:        path,
			methods:     methods,
			matchPrefix: matchPrefix,
		})
	}

	return sm
}

func (sm *SpaceMiddleware) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if sm.isExempt(r.URL.Path, r.Method) {
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
		spaceID := tenancy.SpaceID(spaceIDs[0])

		ctx := r.Context()
		principal, ok := access.GetPrincipal(ctx)
		if !ok {
			http.Error(w, "Unauthenticated: principal not found", http.StatusUnauthorized)
			return
		}

		if principal.IsSystemAdmin() {
			// System admins have access to all spaces
			ctx = access.InjectPrincipal(ctx, principal.WithSpace(spaceID, tenancy.RoleAdmin))
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		membership, err := sm.config.MembershipGetter(ctx, tenancy.MembershipID{
			SpaceID: tenancy.SpaceID(spaceID),
			UserID:  principal.ActorID(),
		})
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}

		if membership == nil {
			http.Error(w, "Space not found or access denied", http.StatusForbidden)
			return
		}

		ctx = access.InjectPrincipal(ctx, principal.WithSpace(spaceID, membership.Role))
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (sm *SpaceMiddleware) isExempt(path, method string) bool {
	log.Printf("Checking exemption for path: %s, method: %s, exemptPaths: %+v", path, method, sm.exemptPaths)
	for _, ep := range sm.exemptPaths {
		if ep.matchPrefix && !strings.HasPrefix(path, ep.path) {
			continue
		}

		if !ep.matchPrefix && path != ep.path {
			continue
		}

		if len(ep.methods) == 0 {
			log.Printf("Path %s is exempt for all methods", path)
			return true
		}

		for _, m := range ep.methods {
			if strings.EqualFold(m, method) {
				log.Printf("Path %s with method %s is exempt", path, method)
				return true
			}
		}
	}
	log.Printf("Path %s with method %s is not exempt", path, method)
	return false
}
