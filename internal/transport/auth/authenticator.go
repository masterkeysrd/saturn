package transportauth

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

import (
	"context"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/token"
)

// TokenValidator validates JWT access tokens.
// @Mock
type TokenValidator interface {
	ValidateAccessToken(tokenString string, now time.Time) (*token.Claims, error)
}

// UserStoreProvider provides user status and auth_version lookups for authentication.
// @Mock
type UserStoreProvider interface {
	GetAuthVersion(ctx context.Context, id identity.UserID) (int64, error)
	GetByID(ctx context.Context, id identity.UserID) (*identity.User, error)
}

// APIKeyStoreProvider provides API key lookup and last-used updates.
// @Mock
type APIKeyStoreProvider interface {
	GetByHash(ctx context.Context, keyHash string) (*identity.APIKey, error)
	TouchLastUsed(ctx context.Context, id identity.APIKeyID, lastUsedAt time.Time) error
}

// APIKeyGrantProvider lists spaces granted to an API key.
// @Mock
type APIKeyGrantProvider interface {
	ListSpaceIDsByAPIKeyID(ctx context.Context, apiKeyID string) ([]space.SpaceID, error)
}

// MemberStoreProvider verifies workspace membership and role.
// @Mock
type MemberStoreProvider interface {
	GetByID(ctx context.Context, spaceID space.SpaceID, userID space.UserID) (*space.Member, error)
}

// OAuthAccessTokenProvider provides OAuth access token lookup by hash.
// @Mock
type OAuthAccessTokenProvider interface {
	GetByHash(ctx context.Context, tokenHash string) (*identity.OAuthAccessToken, error)
}

// OAuthGrantProvider provides OAuth grant lookup and last-used updates.
// @Mock
type OAuthGrantProvider interface {
	GetByID(ctx context.Context, id identity.OAuthGrantID) (*identity.OAuthGrant, error)
	TouchLastUsed(ctx context.Context, id identity.OAuthGrantID, lastUsedAt time.Time) error
}

const defaultCacheTTL = 5 * time.Second

// Config configures a transport-agnostic Authenticator.
type Config struct {
	TokenValidator  TokenValidator
	UserStore       UserStoreProvider
	APIKeyStore     APIKeyStoreProvider
	GrantStore      APIKeyGrantProvider
	OAuthTokenStore OAuthAccessTokenProvider
	OAuthGrantStore OAuthGrantProvider
	MemberStore     MemberStoreProvider
	AuthCacheTTL    time.Duration
	MemberCacheTTL  time.Duration
	DisableCache    bool
	NowFunc         func() time.Time
}

// AuthResult holds the authenticated Principal and token expiration timestamp.
type AuthResult struct {
	Principal  auth.Principal
	Expiration time.Time
}

type authVersionCacheEntry struct {
	version   int64
	expiresAt time.Time
}

type memberCacheKey struct {
	spaceID space.SpaceID
	userID  space.UserID
}

type memberCacheEntry struct {
	member    *space.Member
	expiresAt time.Time
}

// Authenticator performs transport-agnostic JWT / sat_ API key authentication and workspace membership resolution.
type Authenticator struct {
	cfg              Config
	nowFn            func() time.Time
	authVersionCache sync.Map
	memberCache      sync.Map
}

// NewAuthenticator creates a new Authenticator with default 5s TTL caches unless DisableCache is set.
func NewAuthenticator(cfg Config) *Authenticator {
	if !cfg.DisableCache {
		if cfg.AuthCacheTTL == 0 {
			cfg.AuthCacheTTL = defaultCacheTTL
		}
		if cfg.MemberCacheTTL == 0 {
			cfg.MemberCacheTTL = defaultCacheTTL
		}
	} else {
		cfg.AuthCacheTTL = 0
		cfg.MemberCacheTTL = 0
	}

	nowFn := cfg.NowFunc
	if nowFn == nil {
		nowFn = time.Now
	}

	return &Authenticator{
		cfg:   cfg,
		nowFn: nowFn,
	}
}

// AuthenticateToken validates a `sat_oat_...` OAuth access token, a `sat_...` API key, or an Ed25519 JWT access token.
func (a *Authenticator) AuthenticateToken(ctx context.Context, rawToken string) (AuthResult, error) {
	const op errors.Op = "transport/auth.AuthenticateToken"

	tokenStr := strings.TrimSpace(rawToken)
	if tokenStr == "" {
		return AuthResult{}, errors.E(op, errors.Unauthenticated, "missing or invalid authorization credentials")
	}

	if strings.HasPrefix(tokenStr, identity.OAuthAccessTokenPrefix) {
		return a.authenticateOAuthToken(ctx, op, tokenStr)
	}
	if strings.HasPrefix(tokenStr, identity.APIKeyTokenPrefix) {
		return a.authenticateAPIKey(ctx, op, tokenStr)
	}
	return a.authenticateJWT(ctx, op, tokenStr)
}

func (a *Authenticator) authenticateOAuthToken(ctx context.Context, op errors.Op, tokenStr string) (AuthResult, error) {
	if a.cfg.OAuthTokenStore == nil || a.cfg.OAuthGrantStore == nil || a.cfg.UserStore == nil {
		return AuthResult{}, errors.E(op, errors.Unauthenticated, "OAuth token authentication unavailable")
	}

	now := a.nowFn()
	tokenHash := identity.HashOAuthToken(tokenStr)
	tok, err := a.cfg.OAuthTokenStore.GetByHash(ctx, tokenHash)
	if err != nil || tok == nil {
		return AuthResult{}, errors.E(op, errors.Unauthenticated, "invalid OAuth access token")
	}
	if !tok.IsActive(now) {
		return AuthResult{}, errors.E(op, errors.Unauthenticated, "OAuth access token expired or revoked")
	}

	grant, err := a.cfg.OAuthGrantStore.GetByID(ctx, tok.GrantID)
	if err != nil || grant == nil || grant.IsRevoked() {
		return AuthResult{}, errors.E(op, errors.Unauthenticated, "OAuth grant has been revoked")
	}

	user, err := a.cfg.UserStore.GetByID(ctx, grant.UserID)
	if err != nil || user == nil || user.Status != identity.UserStatusActive || user.IsLocked(now) {
		return AuthResult{}, errors.E(op, errors.Unauthenticated, "account is inactive or locked")
	}

	if grant.LastUsedAt == nil || now.Sub(*grant.LastUsedAt) >= time.Minute {
		go func(id identity.OAuthGrantID, ts time.Time) {
			touchCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = a.cfg.OAuthGrantStore.TouchLastUsed(touchCtx, id, ts)
		}(grant.ID, now)
	}

	return AuthResult{
		Principal: auth.Principal{
			Subject:         string(grant.UserID),
			AccessLevel:     string(user.AccessLevel),
			OAuthGrantID:    string(grant.ID),
			Scopes:          slices.Clone(grant.Scopes),
			GrantedSpaceIDs: []string{grant.SpaceID},
		},
		Expiration: tok.ExpiresAt,
	}, nil
}

func (a *Authenticator) authenticateAPIKey(ctx context.Context, op errors.Op, tokenStr string) (AuthResult, error) {
	if a.cfg.APIKeyStore == nil || a.cfg.GrantStore == nil || a.cfg.UserStore == nil {
		return AuthResult{}, errors.E(op, errors.Unauthenticated, "API key authentication unavailable")
	}

	now := a.nowFn()
	keyHash := identity.HashAPIKeyToken(tokenStr)
	key, err := a.cfg.APIKeyStore.GetByHash(ctx, keyHash)
	if err != nil || key == nil {
		return AuthResult{}, errors.E(op, errors.Unauthenticated, "invalid API key")
	}

	if key.IsExpired(now) {
		return AuthResult{}, errors.E(op, errors.Unauthenticated, "API key expired")
	}

	user, err := a.cfg.UserStore.GetByID(ctx, key.UserID)
	if err != nil || user == nil || user.Status != identity.UserStatusActive || user.IsLocked(now) {
		return AuthResult{}, errors.E(op, errors.Unauthenticated, "account is inactive or locked")
	}

	grantedSpaces, err := a.cfg.GrantStore.ListSpaceIDsByAPIKeyID(ctx, string(key.ID))
	if err != nil || len(grantedSpaces) == 0 {
		return AuthResult{}, errors.E(op, errors.Unauthenticated, "API key has no active space grants")
	}

	if key.LastUsedAt == nil || now.Sub(*key.LastUsedAt) >= time.Minute {
		go func(id identity.APIKeyID, ts time.Time) {
			touchCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = a.cfg.APIKeyStore.TouchLastUsed(touchCtx, id, ts)
		}(key.ID, now)
	}

	grantedSpaceIDs := make([]string, len(grantedSpaces))
	for i, sid := range grantedSpaces {
		grantedSpaceIDs[i] = string(sid)
	}

	var exp time.Time
	if key.ExpiresAt != nil {
		exp = *key.ExpiresAt
	}

	return AuthResult{
		Principal: auth.Principal{
			Subject:         string(key.UserID),
			AccessLevel:     string(user.AccessLevel),
			APIKeyID:        string(key.ID),
			Scopes:          slices.Clone(key.Scopes),
			GrantedSpaceIDs: grantedSpaceIDs,
		},
		Expiration: exp,
	}, nil
}

func (a *Authenticator) authenticateJWT(ctx context.Context, op errors.Op, tokenStr string) (AuthResult, error) {
	if a.cfg.TokenValidator == nil || a.cfg.UserStore == nil {
		return AuthResult{}, errors.E(op, errors.Unauthenticated, "token authentication unavailable")
	}

	now := a.nowFn()
	claims, err := a.cfg.TokenValidator.ValidateAccessToken(tokenStr, now)
	if err != nil || claims == nil {
		return AuthResult{}, errors.E(op, errors.Unauthenticated, "invalid token")
	}

	authVersion, err := a.GetAuthVersion(ctx, identity.UserID(claims.Subject), claims.AuthVersion)
	if err != nil {
		return AuthResult{}, errors.E(op, errors.Unauthenticated, "auth version check failed")
	}

	if claims.AuthVersion != authVersion {
		return AuthResult{}, errors.E(op, errors.Unauthenticated, "token invalidated")
	}

	var exp time.Time
	if claims.ExpiresAt != nil {
		exp = claims.ExpiresAt.Time
	}

	return AuthResult{
		Principal: auth.Principal{
			Subject:     claims.Subject,
			AccessLevel: claims.AccessLevel,
			TokenID:     claims.ID,
			AuthVersion: claims.AuthVersion,
			SessionID:   claims.SessionID,
		},
		Expiration: exp,
	}, nil
}

// ResolveSpace resolves the target space_id (supporting single-space API key grant auto-resolution)
// and verifies active membership via MemberStore.
func (a *Authenticator) ResolveSpace(ctx context.Context, principal auth.Principal, explicitSpaceID string) (auth.SpaceContext, error) {
	const op errors.Op = "transport/auth.ResolveSpace"

	spaceIDStr := strings.TrimSpace(explicitSpaceID)

	if principal.IsScopedGrant() {
		if spaceIDStr == "" {
			switch len(principal.GrantedSpaceIDs) {
			case 0:
				return auth.SpaceContext{}, errors.E(op, errors.Permission, "credential has no active space grants")
			case 1:
				spaceIDStr = principal.GrantedSpaceIDs[0]
			default:
				return auth.SpaceContext{}, errors.E(op, errors.Invalid, "multiple spaces granted to this credential; provide the space-id header")
			}
		} else if !principal.HasSpaceGrant(spaceIDStr) {
			return auth.SpaceContext{}, errors.E(op, errors.Permission, "credential does not have access to this space")
		}
	} else if spaceIDStr == "" {
		return auth.SpaceContext{}, errors.E(op, errors.Invalid, "missing space-id header")
	}

	spaceID, err := space.ParseSpaceID(spaceIDStr)
	if err != nil {
		return auth.SpaceContext{}, errors.E(op, errors.Invalid, "invalid space-id format")
	}

	if a.cfg.MemberStore == nil {
		return auth.SpaceContext{}, errors.E(op, errors.Permission, "user is not a member of this space")
	}

	member, err := a.getMember(ctx, spaceID, space.UserID(principal.Subject))
	if err != nil || member == nil {
		return auth.SpaceContext{}, errors.E(op, errors.Permission, "user is not a member of this space")
	}

	return auth.SpaceContext{
		SpaceID: string(spaceID),
		Role:    string(member.Role),
	}, nil
}

// GetAuthVersion looks up a user's auth_version using the short-lived cache, bypassing stale cache entries
// when claimVersion is newer than the cached version.
func (a *Authenticator) GetAuthVersion(ctx context.Context, userID identity.UserID, claimVersion int64) (int64, error) {
	now := a.nowFn()
	if a.cfg.AuthCacheTTL > 0 {
		if raw, ok := a.authVersionCache.Load(userID); ok {
			entry := raw.(authVersionCacheEntry)
			if now.Before(entry.expiresAt) && claimVersion <= entry.version {
				return entry.version, nil
			}
		}
	}

	version, err := a.cfg.UserStore.GetAuthVersion(ctx, userID)
	if err != nil {
		return 0, err
	}
	if a.cfg.AuthCacheTTL > 0 {
		a.authVersionCache.Store(userID, authVersionCacheEntry{
			version:   version,
			expiresAt: now.Add(a.cfg.AuthCacheTTL),
		})
	}
	return version, nil
}

// InvalidateAuthVersion evicts a user's cached auth_version.
func (a *Authenticator) InvalidateAuthVersion(userID identity.UserID) {
	a.authVersionCache.Delete(userID)
}

// InvalidateMember evicts a workspace membership cache entry.
func (a *Authenticator) InvalidateMember(spaceID space.SpaceID, userID space.UserID) {
	a.memberCache.Delete(memberCacheKey{spaceID: spaceID, userID: userID})
}

func (a *Authenticator) getMember(ctx context.Context, spaceID space.SpaceID, userID space.UserID) (*space.Member, error) {
	key := memberCacheKey{spaceID: spaceID, userID: userID}
	now := a.nowFn()
	if a.cfg.MemberCacheTTL > 0 {
		if raw, ok := a.memberCache.Load(key); ok {
			entry := raw.(memberCacheEntry)
			if now.Before(entry.expiresAt) {
				return entry.member, nil
			}
		}
	}

	member, err := a.cfg.MemberStore.GetByID(ctx, spaceID, userID)
	if err != nil {
		return nil, err
	}
	if a.cfg.MemberCacheTTL > 0 && member != nil {
		a.memberCache.Store(key, memberCacheEntry{
			member:    member,
			expiresAt: now.Add(a.cfg.MemberCacheTTL),
		})
	}
	return member, nil
}
