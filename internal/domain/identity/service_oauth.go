package identity

import (
	"context"
	"crypto/subtle"
	"slices"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// CreateOAuthClientParams contains inputs for registering an OAuth 2.1 client.
type CreateOAuthClientParams struct {
	SpaceID                 *string
	Name                    string
	Description             string
	RedirectURIs            []string
	AllowedScopes           []string
	TokenEndpointAuthMethod TokenEndpointAuthMethod
	RefreshTokenPolicy      RefreshTokenPolicy
	RegistrationSource      RegistrationSource
	ActorUserID             *UserID
	IPAddress               string
	UserAgent               string
}

// UpdateOAuthClientParams contains inputs for updating an existing OAuth 2.1 client.
type UpdateOAuthClientParams struct {
	ID         OAuthClientID
	SpaceID    *string
	Incoming   *OAuthClient
	Mask       []string
	AllowAny   bool
}

// CreateOAuthAuthCodeParams contains inputs for creating a browser consent handoff & auth code record.
type CreateOAuthAuthCodeParams struct {
	Approved            bool
	ClientID            OAuthClientID
	UserID              UserID
	SpaceID             string
	RedirectURI         string
	State               string
	Resource            string
	Scopes              []string
	CodeChallenge       string
	CodeChallengeMethod string
}

// IssueOAuthTokenResult holds freshly minted opaque access & refresh tokens alongside grant metadata.
type IssueOAuthTokenResult struct {
	Grant        *OAuthGrant
	AccessToken  string
	RefreshToken string
	ExpiresIn    int64
}

// CreateOAuthClient validates and persists a new OAuth 2.1 client, generating a secret when required.
func (s *Service) CreateOAuthClient(ctx context.Context, params CreateOAuthClientParams) (*OAuthClient, error) {
	const op errors.Op = "domain/identity.CreateOAuthClient"

	clientID, err := NewOAuthClientID()
	if err != nil {
		return nil, errors.E(op, err)
	}

	now := time.Now().UTC()
	authMethod := params.TokenEndpointAuthMethod
	if authMethod == "" {
		authMethod = TokenAuthMethodClientSecretBasic
	}
	policy := params.RefreshTokenPolicy
	if policy == "" {
		policy = RefreshTokenPolicyRotate
	}

	client := &OAuthClient{
		ID:                      clientID,
		SpaceID:                 params.SpaceID,
		Name:                    params.Name,
		Description:             params.Description,
		RedirectURIs:            slices.Clone(params.RedirectURIs),
		AllowedScopes:           slices.Clone(params.AllowedScopes),
		TokenEndpointAuthMethod: authMethod,
		RefreshTokenPolicy:      policy,
		RegistrationSource:      params.RegistrationSource,
		CreateTime:              now,
		UpdateTime:              now,
	}

	if err := client.Validate(); err != nil {
		return nil, errors.E(op, err)
	}

	if client.TokenEndpointAuthMethod != TokenAuthMethodNone {
		rawSecret, prefix, secretHash, err := GenerateOAuthClientSecret()
		if err != nil {
			return nil, errors.E(op, err)
		}
		client.RawSecret = rawSecret
		client.SecretPrefix = prefix
		client.SecretHash = secretHash
	}

	if err := s.deps.OAuthClientStore.Create(ctx, client); err != nil {
		return nil, errors.E(op, err)
	}

	if params.ActorUserID != nil {
		s.recordAPIKeySecurityEvent(ctx, *params.ActorUserID, SecurityEventOAuthClientCreate, params.IPAddress, params.UserAgent, now)
	}

	return client, nil
}

// UpsertCIMDOAuthClient validates and caches a remote Client ID Metadata Document client.
func (s *Service) UpsertCIMDOAuthClient(ctx context.Context, client *OAuthClient) (*OAuthClient, error) {
	const op errors.Op = "domain/identity.UpsertCIMDOAuthClient"

	if client == nil {
		return nil, errors.E(op, errors.Invalid, OAuthInvalidClient, "oauth client is required")
	}
	now := time.Now().UTC()
	client.RegistrationSource = RegistrationSourceCIMD
	client.TokenEndpointAuthMethod = TokenAuthMethodNone
	if client.RefreshTokenPolicy == "" {
		client.RefreshTokenPolicy = RefreshTokenPolicyRotate
	}
	if len(client.AllowedScopes) == 0 {
		client.AllowedScopes = AllAPIKeyScopeStrings()
	}
	client.MetadataFetchedAt = new(now)
	if client.CreateTime.IsZero() {
		client.CreateTime = now
	}
	client.UpdateTime = now

	if err := client.Validate(); err != nil {
		return nil, errors.E(op, err)
	}
	if !client.ID.IsCIMDURL() {
		return nil, errors.E(op, errors.Invalid, InvalidOAuthClientID, "CIMD client_id must be an https URL")
	}

	if err := s.deps.OAuthClientStore.UpsertCIMD(ctx, client); err != nil {
		return nil, errors.E(op, err)
	}
	return s.GetOAuthClient(ctx, client.ID)
}

// GetOAuthClient retrieves an OAuth client by ID.
func (s *Service) GetOAuthClient(ctx context.Context, id OAuthClientID) (*OAuthClient, error) {
	const op errors.Op = "domain/identity.GetOAuthClient"

	if id == "" {
		return nil, errors.E(op, errors.Invalid, InvalidOAuthClientID, "oauth client id is required")
	}

	client, err := s.deps.OAuthClientStore.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.NotExist, OAuthClientNotFound, "oauth client not found")
		}
		return nil, errors.E(op, err)
	}
	return client, nil
}

// ListOAuthClientsByIDs batch-retrieves OAuth clients matching the given IDs.
func (s *Service) ListOAuthClientsByIDs(ctx context.Context, ids []OAuthClientID) ([]*OAuthClient, error) {
	const op errors.Op = "domain/identity.ListOAuthClientsByIDs"

	if len(ids) == 0 {
		return nil, nil
	}
	clients, err := s.deps.OAuthClientStore.ListByIDs(ctx, ids)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return clients, nil
}

// ListInstanceOAuthClients lists global/DCR/CIMD OAuth clients for system admins.
func (s *Service) ListInstanceOAuthClients(ctx context.Context) ([]*OAuthClient, error) {
	const op errors.Op = "domain/identity.ListInstanceOAuthClients"

	clients, err := s.deps.OAuthClientStore.ListInstanceClients(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return clients, nil
}

// ListSpaceOAuthClients lists OAuth clients belonging to a workspace.
func (s *Service) ListSpaceOAuthClients(ctx context.Context, spaceID string) ([]*OAuthClient, error) {
	const op errors.Op = "domain/identity.ListSpaceOAuthClients"

	if spaceID == "" {
		return nil, errors.E(op, errors.Invalid, "space_id is required")
	}
	clients, err := s.deps.OAuthClientStore.ListBySpaceID(ctx, spaceID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return clients, nil
}

// UpdateOAuthClient applies partial updates to an OAuth client, enforcing optional workspace ownership.
func (s *Service) UpdateOAuthClient(ctx context.Context, params UpdateOAuthClientParams) (*OAuthClient, error) {
	const op errors.Op = "domain/identity.UpdateOAuthClient"

	client, err := s.GetOAuthClient(ctx, params.ID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if !matchesExpectedSpace(client, params.SpaceID, params.AllowAny) {
		return nil, errors.E(op, errors.NotExist, OAuthClientNotFound, "oauth client not found")
	}

	prevMethod := client.TokenEndpointAuthMethod
	if err := client.ApplyPatch(params.Incoming, params.Mask); err != nil {
		return nil, errors.E(op, err)
	}

	if client.TokenEndpointAuthMethod == TokenAuthMethodNone {
		client.SecretPrefix = ""
		client.SecretHash = ""
	} else if prevMethod == TokenAuthMethodNone || client.SecretHash == "" {
		rawSecret, prefix, secretHash, err := GenerateOAuthClientSecret()
		if err != nil {
			return nil, errors.E(op, err)
		}
		client.RawSecret = rawSecret
		client.SecretPrefix = prefix
		client.SecretHash = secretHash
	}

	if err := s.deps.OAuthClientStore.Update(ctx, client); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.NotExist, OAuthClientNotFound, "oauth client not found")
		}
		return nil, errors.E(op, err)
	}

	return client, nil
}

// RotateOAuthClientSecret rotates the client secret for a confidential OAuth client and returns the raw secret once.
func (s *Service) RotateOAuthClientSecret(ctx context.Context, id OAuthClientID, expectedSpaceID *string, allowGlobal bool) (*OAuthClient, error) {
	const op errors.Op = "domain/identity.RotateOAuthClientSecret"

	client, err := s.GetOAuthClient(ctx, id)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if !matchesExpectedSpace(client, expectedSpaceID, allowGlobal) {
		return nil, errors.E(op, errors.NotExist, OAuthClientNotFound, "oauth client not found")
	}
	if client.TokenEndpointAuthMethod == TokenAuthMethodNone {
		return nil, errors.E(op, errors.Precondition, OAuthInvalidClient, "public clients with auth method 'none' do not use a client secret")
	}

	rawSecret, prefix, secretHash, err := GenerateOAuthClientSecret()
	if err != nil {
		return nil, errors.E(op, err)
	}
	now := time.Now().UTC()
	if err := s.deps.OAuthClientStore.UpdateSecret(ctx, client.ID, prefix, secretHash, now); err != nil {
		return nil, errors.E(op, err)
	}

	client.SecretPrefix = prefix
	client.SecretHash = secretHash
	client.RawSecret = rawSecret
	client.UpdateTime = now
	return client, nil
}

// DeleteOAuthClient deletes an OAuth client, enforcing optional workspace ownership.
func (s *Service) DeleteOAuthClient(ctx context.Context, id OAuthClientID, expectedSpaceID *string, allowGlobal bool, actorUserID *UserID, ipAddress, userAgent string) error {
	const op errors.Op = "domain/identity.DeleteOAuthClient"

	client, err := s.GetOAuthClient(ctx, id)
	if err != nil {
		return errors.E(op, err)
	}
	if !matchesExpectedSpace(client, expectedSpaceID, allowGlobal) {
		return errors.E(op, errors.NotExist, OAuthClientNotFound, "oauth client not found")
	}

	if err := s.deps.OAuthClientStore.Delete(ctx, client.ID); err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.NotExist, OAuthClientNotFound, "oauth client not found")
		}
		return errors.E(op, err)
	}

	if actorUserID != nil {
		s.recordAPIKeySecurityEvent(ctx, *actorUserID, SecurityEventOAuthClientDelete, ipAddress, userAgent, time.Now().UTC())
	}
	return nil
}

func matchesExpectedSpace(client *OAuthClient, expectedSpaceID *string, allowAnyGlobal bool) bool {
	if expectedSpaceID != nil {
		return client.SpaceID != nil && *client.SpaceID == *expectedSpaceID
	}
	if allowAnyGlobal {
		return client.SpaceID == nil || client.RegistrationSource == RegistrationSourceDCR || client.RegistrationSource == RegistrationSourceCIMD
	}
	return client.SpaceID == nil
}

// CreateOAuthAuthCode records an approved or denied consent decision and returns a 60s handoff token.
func (s *Service) CreateOAuthAuthCode(ctx context.Context, params CreateOAuthAuthCodeParams) (string, error) {
	const op errors.Op = "domain/identity.CreateOAuthAuthCode"

	codeID, err := NewOAuthAuthCodeID()
	if err != nil {
		return "", errors.E(op, err)
	}
	rawHandoff, handoffHash, err := GenerateOAuthHandoffToken()
	if err != nil {
		return "", errors.E(op, err)
	}

	now := time.Now().UTC()
	scopes := slices.Clone(params.Scopes)
	if scopes == nil {
		scopes = []string{}
	}
	record := &OAuthAuthCode{
		ID:                  codeID,
		HandoffHash:         handoffHash,
		Approved:            params.Approved,
		ClientID:            params.ClientID,
		UserID:              params.UserID,
		SpaceID:             params.SpaceID,
		RedirectURI:         params.RedirectURI,
		State:               params.State,
		Resource:            params.Resource,
		Scopes:              scopes,
		CodeChallenge:       params.CodeChallenge,
		CodeChallengeMethod: params.CodeChallengeMethod,
		ExpiresAt:           now.Add(OAuthHandoffTTL),
		CreateTime:          now,
	}

	if err := s.deps.OAuthAuthCodeStore.Create(ctx, record); err != nil {
		return "", errors.E(op, err)
	}
	return rawHandoff, nil
}

// ConsumeOAuthRedirectHandoff atomically consumes a handoff nonce and mints a single-use authorization code if approved.
func (s *Service) ConsumeOAuthRedirectHandoff(ctx context.Context, rawHandoff string) (authCode *OAuthAuthCode, rawCode string, err error) {
	const op errors.Op = "domain/identity.ConsumeOAuthRedirectHandoff"

	if rawHandoff == "" {
		return nil, "", errors.E(op, errors.Invalid, OAuthInvalidRequest, "handoff token is required")
	}

	now := time.Now().UTC()
	handoffHash := HashOAuthToken(rawHandoff)

	rawCode, codeHash, err := GenerateOAuthAuthCode()
	if err != nil {
		return nil, "", errors.E(op, err)
	}
	codeExpiresAt := now.Add(OAuthAuthCodeTTL)

	codeRecord, err := s.deps.OAuthAuthCodeStore.ConsumeHandoff(ctx, handoffHash, codeHash, codeExpiresAt, now)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, "", errors.E(op, errors.Invalid, OAuthInvalidRequest, "invalid or expired authorization handoff")
		}
		return nil, "", errors.E(op, err)
	}

	if !codeRecord.Approved {
		return codeRecord, "", nil
	}
	return codeRecord, rawCode, nil
}

// ConsumeOAuthAuthCode validates and atomically consumes a single-use authorization code.
func (s *Service) ConsumeOAuthAuthCode(ctx context.Context, client *OAuthClient, rawCode, redirectURI, codeVerifier, resource string) (*OAuthAuthCode, error) {
	const op errors.Op = "domain/identity.ConsumeOAuthAuthCode"

	if rawCode == "" {
		return nil, errors.E(op, errors.Invalid, OAuthInvalidGrant, "authorization code is required")
	}

	now := time.Now().UTC()
	codeHash := HashOAuthToken(rawCode)
	record, err := s.deps.OAuthAuthCodeStore.GetByCodeHash(ctx, codeHash)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.Invalid, OAuthInvalidGrant, "invalid authorization code")
		}
		return nil, errors.E(op, err)
	}

	if !record.Approved || record.ClientID != client.ID {
		return nil, errors.E(op, errors.Invalid, OAuthInvalidGrant, "authorization code does not belong to client")
	}
	if record.ConsumedAt != nil {
		return nil, errors.E(op, errors.Invalid, OAuthInvalidGrant, "authorization code already used")
	}
	if !now.Before(record.ExpiresAt) {
		return nil, errors.E(op, errors.Invalid, OAuthInvalidGrant, "authorization code expired")
	}
	if record.RedirectURI != redirectURI {
		return nil, errors.E(op, errors.Invalid, OAuthInvalidGrant, "redirect_uri mismatch")
	}
	if resource != "" && record.Resource != "" && resource != record.Resource {
		return nil, errors.E(op, errors.Invalid, OAuthInvalidTarget, "resource mismatch")
	}
	if record.CodeChallengeMethod != "S256" || !VerifyPKCES256(codeVerifier, record.CodeChallenge) {
		return nil, errors.E(op, errors.Invalid, OAuthInvalidGrant, "invalid PKCE code_verifier")
	}

	if err := s.deps.OAuthAuthCodeStore.MarkConsumed(ctx, record.ID, now); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.Invalid, OAuthInvalidGrant, "authorization code already used")
		}
		return nil, errors.E(op, err)
	}

	return record, nil
}

// CreateOAuthGrantAndIssueTokens creates a new OAuthGrant and issues initial access & refresh tokens.
func (s *Service) CreateOAuthGrantAndIssueTokens(
	ctx context.Context,
	client *OAuthClient,
	userID UserID,
	spaceID string,
	scopes []string,
	accessTTL time.Duration,
	refreshTTL time.Duration,
	ipAddress string,
	userAgent string,
) (*IssueOAuthTokenResult, error) {
	const op errors.Op = "domain/identity.CreateOAuthGrantAndIssueTokens"

	grantID, err := NewOAuthGrantID()
	if err != nil {
		return nil, errors.E(op, err)
	}
	rawRT, rtHash, err := GenerateOAuthRefreshToken()
	if err != nil {
		return nil, errors.E(op, err)
	}

	now := time.Now().UTC()
	grant := &OAuthGrant{
		ID:               grantID,
		ClientID:         client.ID,
		UserID:           userID,
		SpaceID:          spaceID,
		Scopes:           slices.Clone(scopes),
		RefreshTokenHash: rtHash,
		RefreshExpiresAt: new(now.Add(refreshTTL)),
		LastUsedAt:       new(now),
		CreateTime:       now,
		UpdateTime:       now,
	}

	if err := s.deps.OAuthGrantStore.Create(ctx, grant); err != nil {
		return nil, errors.E(op, err)
	}

	rawAT, expiresIn, err := s.issueAccessTokenForGrant(ctx, grant.ID, accessTTL, now)
	if err != nil {
		return nil, errors.E(op, err)
	}

	s.recordAPIKeySecurityEvent(ctx, userID, SecurityEventOAuthGrantCreate, ipAddress, userAgent, now)

	return &IssueOAuthTokenResult{
		Grant:        grant,
		AccessToken:  rawAT,
		RefreshToken: rawRT,
		ExpiresIn:    expiresIn,
	}, nil
}

// RefreshOAuthGrant validates a refresh token, enforces the client's rotation/persistent policy
// (with 30s grace window & replay revocation), and issues fresh access/refresh tokens.
func (s *Service) RefreshOAuthGrant(
	ctx context.Context,
	client *OAuthClient,
	rawRefreshToken string,
	accessTTL time.Duration,
	refreshTTL time.Duration,
) (*IssueOAuthTokenResult, error) {
	const op errors.Op = "domain/identity.RefreshOAuthGrant"

	if rawRefreshToken == "" {
		return nil, errors.E(op, errors.Invalid, OAuthInvalidGrant, "refresh_token is required")
	}

	now := time.Now().UTC()
	rtHash := HashOAuthToken(rawRefreshToken)

	grant, err := s.deps.OAuthGrantStore.GetByRefreshTokenHash(ctx, rtHash)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.Invalid, OAuthInvalidGrant, "invalid refresh token")
		}
		return nil, errors.E(op, err)
	}

	if grant.ClientID != client.ID {
		return nil, errors.E(op, errors.Invalid, OAuthInvalidGrant, "refresh token does not belong to client")
	}
	if grant.IsRevoked() {
		return nil, errors.E(op, errors.Invalid, OAuthInvalidGrant, "grant has been revoked")
	}
	if grant.IsRefreshExpired(now) {
		return nil, errors.E(op, errors.Invalid, OAuthInvalidGrant, "refresh token expired")
	}

	var returnedRT string
	isCurrent := subtle.ConstantTimeCompare([]byte(grant.RefreshTokenHash), []byte(rtHash)) == 1
	if isCurrent {
		if client.RefreshTokenPolicy == RefreshTokenPolicyPersistent {
			grant.RefreshExpiresAt = new(now.Add(refreshTTL))
			grant.LastUsedAt = new(now)
			grant.UpdateTime = now
			returnedRT = rawRefreshToken
		} else {
			newRawRT, newRTHash, err := GenerateOAuthRefreshToken()
			if err != nil {
				return nil, errors.E(op, err)
			}
			grant.PreviousRefreshTokenHash = grant.RefreshTokenHash
			grant.PreviousRefreshGraceUntil = new(now.Add(OAuthRefreshGraceWindow))
			grant.RefreshTokenHash = newRTHash
			grant.RefreshExpiresAt = new(now.Add(refreshTTL))
			grant.LastUsedAt = new(now)
			grant.UpdateTime = now
			returnedRT = newRawRT
		}
	} else if grant.MatchesPreviousRefreshToken(rtHash, now) {
		newRawRT, newRTHash, err := GenerateOAuthRefreshToken()
		if err != nil {
			return nil, errors.E(op, err)
		}
		grant.RefreshTokenHash = newRTHash
		grant.RefreshExpiresAt = new(now.Add(refreshTTL))
		grant.LastUsedAt = new(now)
		grant.UpdateTime = now
		returnedRT = newRawRT
	} else {
		// Replay outside grace window: revoke the entire grant and all access tokens.
		_ = s.deps.OAuthGrantStore.Revoke(ctx, grant.ID, now)
		_ = s.deps.OAuthAccessTokenStore.RevokeByGrantID(ctx, grant.ID, now)
		return nil, errors.E(op, errors.Unauthenticated, OAuthGrantRevoked, "refresh token reused; grant revoked")
	}

	if err := s.deps.OAuthGrantStore.Update(ctx, grant); err != nil {
		return nil, errors.E(op, err)
	}

	rawAT, expiresIn, err := s.issueAccessTokenForGrant(ctx, grant.ID, accessTTL, now)
	if err != nil {
		return nil, errors.E(op, err)
	}

	return &IssueOAuthTokenResult{
		Grant:        grant,
		AccessToken:  rawAT,
		RefreshToken: returnedRT,
		ExpiresIn:    expiresIn,
	}, nil
}

func (s *Service) issueAccessTokenForGrant(ctx context.Context, grantID OAuthGrantID, accessTTL time.Duration, now time.Time) (string, int64, error) {
	tokenID, err := NewOAuthAccessTokenID()
	if err != nil {
		return "", 0, err
	}
	rawAT, atHash, err := GenerateOAuthAccessToken()
	if err != nil {
		return "", 0, err
	}

	record := &OAuthAccessToken{
		ID:         tokenID,
		GrantID:    grantID,
		TokenHash:  atHash,
		ExpiresAt:  now.Add(accessTTL),
		CreateTime: now,
	}
	if err := s.deps.OAuthAccessTokenStore.Create(ctx, record); err != nil {
		return "", 0, err
	}
	return rawAT, int64(accessTTL.Seconds()), nil
}

// ListUserOAuthGrants lists active OAuth grants for a user.
func (s *Service) ListUserOAuthGrants(ctx context.Context, userID UserID) ([]*OAuthGrant, error) {
	const op errors.Op = "domain/identity.ListUserOAuthGrants"

	if !userID.IsValid() {
		return nil, errors.E(op, errors.Invalid, InvalidUserID, "user id is required")
	}
	grants, err := s.deps.OAuthGrantStore.ListByUserID(ctx, userID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return grants, nil
}

// ListSpaceOAuthGrants lists active OAuth grants for a workspace.
func (s *Service) ListSpaceOAuthGrants(ctx context.Context, spaceID string) ([]*OAuthGrant, error) {
	const op errors.Op = "domain/identity.ListSpaceOAuthGrants"

	if spaceID == "" {
		return nil, errors.E(op, errors.Invalid, "space_id is required")
	}
	grants, err := s.deps.OAuthGrantStore.ListBySpaceID(ctx, spaceID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return grants, nil
}

// RevokeUserOAuthGrant revokes a grant owned by userID along with its access tokens.
func (s *Service) RevokeUserOAuthGrant(ctx context.Context, userID UserID, grantID OAuthGrantID, ipAddress, userAgent string) error {
	const op errors.Op = "domain/identity.RevokeUserOAuthGrant"

	if !userID.IsValid() {
		return errors.E(op, errors.Invalid, InvalidUserID, "user id is required")
	}
	grant, err := s.deps.OAuthGrantStore.GetByID(ctx, grantID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.NotExist, OAuthGrantNotFound, "oauth grant not found")
		}
		return errors.E(op, err)
	}
	if grant.UserID != userID {
		return errors.E(op, errors.NotExist, OAuthGrantNotFound, "oauth grant not found")
	}

	now := time.Now().UTC()
	if err := s.deps.OAuthGrantStore.Revoke(ctx, grant.ID, now); err != nil {
		return errors.E(op, err)
	}
	if err := s.deps.OAuthAccessTokenStore.RevokeByGrantID(ctx, grant.ID, now); err != nil {
		return errors.E(op, err)
	}

	s.recordAPIKeySecurityEvent(ctx, userID, SecurityEventOAuthGrantRevoke, ipAddress, userAgent, now)
	return nil
}

// RevokeSpaceOAuthGrant revokes a grant scoped to spaceID along with its access tokens.
func (s *Service) RevokeSpaceOAuthGrant(ctx context.Context, spaceID string, grantID OAuthGrantID) error {
	const op errors.Op = "domain/identity.RevokeSpaceOAuthGrant"

	grant, err := s.deps.OAuthGrantStore.GetByID(ctx, grantID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.NotExist, OAuthGrantNotFound, "oauth grant not found")
		}
		return errors.E(op, err)
	}
	if grant.SpaceID != spaceID {
		return errors.E(op, errors.NotExist, OAuthGrantNotFound, "oauth grant not found")
	}

	now := time.Now().UTC()
	if err := s.deps.OAuthGrantStore.Revoke(ctx, grant.ID, now); err != nil {
		return errors.E(op, err)
	}
	if err := s.deps.OAuthAccessTokenStore.RevokeByGrantID(ctx, grant.ID, now); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// RevokeOAuthToken revokes an access token (`sat_oat_...`) or refresh token (`sat_ort_...`) per RFC 7009.
// When a refresh token is revoked, its parent grant and all associated access tokens are revoked.
// Unknown or already-revoked tokens succeed idempotently per RFC 7009 §2.2.
func (s *Service) RevokeOAuthToken(ctx context.Context, rawToken string, clientID OAuthClientID) error {
	const op errors.Op = "domain/identity.RevokeOAuthToken"

	if rawToken == "" {
		return nil
	}
	now := time.Now().UTC()
	tokenHash := HashOAuthToken(rawToken)

	if strings.HasPrefix(rawToken, OAuthAccessTokenPrefix) {
		tok, err := s.deps.OAuthAccessTokenStore.GetByHash(ctx, tokenHash)
		if err != nil {
			if errors.Is(err, errors.NotExist) {
				return nil
			}
			return errors.E(op, err)
		}
		if clientID != "" {
			grant, err := s.deps.OAuthGrantStore.GetByID(ctx, tok.GrantID)
			if err == nil && grant.ClientID != clientID {
				return nil
			}
		}
		return s.deps.OAuthAccessTokenStore.RevokeByTokenHash(ctx, tokenHash, now)
	}

	grant, err := s.deps.OAuthGrantStore.GetByRefreshTokenHash(ctx, tokenHash)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			// Also check if an access token was passed without prefix hint
			_ = s.deps.OAuthAccessTokenStore.RevokeByTokenHash(ctx, tokenHash, now)
			return nil
		}
		return errors.E(op, err)
	}
	if clientID != "" && grant.ClientID != clientID {
		return nil
	}
	if err := s.deps.OAuthGrantStore.Revoke(ctx, grant.ID, now); err != nil {
		return errors.E(op, err)
	}
	if err := s.deps.OAuthAccessTokenStore.RevokeByGrantID(ctx, grant.ID, now); err != nil {
		return errors.E(op, err)
	}
	return nil
}
