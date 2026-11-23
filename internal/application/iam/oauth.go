package iam

import (
	"context"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

const cimdCacheTTL = 5 * time.Minute

// AdminCreateOAuthClientRequest contains parameters for creating an instance-wide OAuth client.
type AdminCreateOAuthClientRequest struct {
	ActorUserID             identity.UserID
	Name                    string
	Description             string
	RedirectURIs            []string
	AllowedScopes           []string
	TokenEndpointAuthMethod identity.TokenEndpointAuthMethod
	RefreshTokenPolicy      identity.RefreshTokenPolicy
	IPAddress               string
	UserAgent               string
}

// AdminGetOAuthClientRequest contains parameters for fetching an instance OAuth client.
type AdminGetOAuthClientRequest struct {
	ID identity.OAuthClientID
}

// AdminUpdateOAuthClientRequest contains parameters for patching an instance OAuth client.
type AdminUpdateOAuthClientRequest struct {
	ID                      identity.OAuthClientID
	Name                    string
	Description             string
	RedirectURIs            []string
	AllowedScopes           []string
	TokenEndpointAuthMethod identity.TokenEndpointAuthMethod
	RefreshTokenPolicy      identity.RefreshTokenPolicy
	UpdateMask              []string
}

// AdminRotateOAuthClientSecretRequest contains parameters for rotating an instance client secret.
type AdminRotateOAuthClientSecretRequest struct {
	ID identity.OAuthClientID
}

// AdminDeleteOAuthClientRequest contains parameters for deleting an instance/DCR/CIMD OAuth client.
type AdminDeleteOAuthClientRequest struct {
	ActorUserID identity.UserID
	ID          identity.OAuthClientID
	IPAddress   string
	UserAgent   string
}

// UserOAuthGrant represents a user's active OAuth grant hydrated with client and workspace names.
type UserOAuthGrant struct {
	Grant        *identity.OAuthGrant
	ClientName   string
	SpaceName    string
	IsWorkspace  bool
}

// ListUserOAuthGrantsRequest lists active OAuth grants for a user.
type ListUserOAuthGrantsRequest struct {
	UserID identity.UserID
}

// RevokeUserOAuthGrantRequest revokes a user's OAuth grant.
type RevokeUserOAuthGrantRequest struct {
	UserID    identity.UserID
	GrantID   identity.OAuthGrantID
	IPAddress string
	UserAgent string
}

// ConsentSpaceOption represents a workspace choice presented on the OAuth consent screen.
type ConsentSpaceOption struct {
	SpaceID       string
	SpaceName     string
	Role          string
	AllowedScopes []string
}

// InspectOAuthConsentRequest validates an OAuth authorization request for browser consent rendering.
type InspectOAuthConsentRequest struct {
	UserID              identity.UserID
	ClientID            string
	RedirectURI         string
	ResponseType        string
	Scopes              []string
	State               string
	CodeChallenge       string
	CodeChallengeMethod string
	Resource            string
}

// InspectOAuthConsentResponse describes the validated authorization request for the consent UI.
type InspectOAuthConsentResponse struct {
	Client            *identity.OAuthClient
	RedirectURI       string
	RedirectURIHost   string
	Resource          string
	LockedSpaceID     string
	EffectiveScopes   []string
	Spaces            []*ConsentSpaceOption
}

// DecideOAuthConsentRequest records a user's approve/deny decision on the consent screen.
type DecideOAuthConsentRequest struct {
	UserID              identity.UserID
	ClientID            string
	RedirectURI         string
	ResponseType        string
	RequestedScopes     []string
	ApprovedScopes      []string
	SpaceID             string
	State               string
	CodeChallenge       string
	CodeChallengeMethod string
	Resource            string
	Approved            bool
}

// DecideOAuthConsentResponse returns the 60s handoff token for `/oauth/authorize/callback`.
type DecideOAuthConsentResponse struct {
	HandoffToken string
}

// RegisterDynamicOAuthClientRequest represents an RFC 7591 dynamic client registration request.
type RegisterDynamicOAuthClientRequest struct {
	SpaceID                 *string
	Name                    string
	RedirectURIs            []string
	TokenEndpointAuthMethod string
	Scope                   string
}

// ConsumeOAuthRedirectHandoffRequest consumes a 60s browser handoff nonce.
type ConsumeOAuthRedirectHandoffRequest struct {
	HandoffToken string
}

// ConsumeOAuthRedirectHandoffResponse carries the final validated 302 redirect target.
type ConsumeOAuthRedirectHandoffResponse struct {
	RedirectURL string
}

// ExchangeOAuthTokenRequest represents an RFC 6749 / OAuth 2.1 `/oauth/token` exchange.
type ExchangeOAuthTokenRequest struct {
	GrantType      string
	ClientID       string
	ClientSecret   string
	AuthMethodUsed string
	Code           string
	RedirectURI    string
	CodeVerifier   string
	RefreshToken   string
	Resource       string
	IPAddress      string
	UserAgent      string
}

// ExchangeOAuthTokenResponse represents an OAuth 2.1 token response.
type ExchangeOAuthTokenResponse struct {
	AccessToken  string
	TokenType    string
	ExpiresIn    int64
	RefreshToken string
	Scope        string
}

// RevokeOAuthTokenRequest represents an RFC 7009 `/oauth/revoke` request.
type RevokeOAuthTokenRequest struct {
	Token          string
	ClientID       string
	ClientSecret   string
	AuthMethodUsed string
}

// AdminCreateOAuthClient registers a new instance-wide OAuth client.
func (c *coordinator) AdminCreateOAuthClient(ctx context.Context, req *AdminCreateOAuthClientRequest) (*identity.OAuthClient, error) {
	const op errors.Op = "application/iam.AdminCreateOAuthClient"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, "request is required")
	}

	client, err := c.identityService.CreateOAuthClient(ctx, identity.CreateOAuthClientParams{
		SpaceID:                 nil,
		Name:                    req.Name,
		Description:             req.Description,
		RedirectURIs:            req.RedirectURIs,
		AllowedScopes:           req.AllowedScopes,
		TokenEndpointAuthMethod: req.TokenEndpointAuthMethod,
		RefreshTokenPolicy:      req.RefreshTokenPolicy,
		RegistrationSource:      identity.RegistrationSourceAdmin,
		ActorUserID:             new(req.ActorUserID),
		IPAddress:               req.IPAddress,
		UserAgent:               req.UserAgent,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}
	return client, nil
}

// AdminGetOAuthClient retrieves an instance/DCR/CIMD OAuth client by ID.
func (c *coordinator) AdminGetOAuthClient(ctx context.Context, req *AdminGetOAuthClientRequest) (*identity.OAuthClient, error) {
	const op errors.Op = "application/iam.AdminGetOAuthClient"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, "request is required")
	}
	client, err := c.identityService.GetOAuthClient(ctx, req.ID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if client.SpaceID != nil && client.RegistrationSource != identity.RegistrationSourceDCR && client.RegistrationSource != identity.RegistrationSourceCIMD {
		return nil, errors.E(op, errors.NotExist, identity.OAuthClientNotFound, "oauth client not found")
	}
	return client, nil
}

// AdminListOAuthClients lists instance-wide, DCR, and CIMD OAuth clients.
func (c *coordinator) AdminListOAuthClients(ctx context.Context) ([]*identity.OAuthClient, error) {
	const op errors.Op = "application/iam.AdminListOAuthClients"

	clients, err := c.identityService.ListInstanceOAuthClients(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return clients, nil
}

// AdminUpdateOAuthClient updates an instance-wide OAuth client.
func (c *coordinator) AdminUpdateOAuthClient(ctx context.Context, req *AdminUpdateOAuthClientRequest) (*identity.OAuthClient, error) {
	const op errors.Op = "application/iam.AdminUpdateOAuthClient"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, "request is required")
	}
	client, err := c.identityService.UpdateOAuthClient(ctx, identity.UpdateOAuthClientParams{
		ID:       req.ID,
		SpaceID:  nil,
		AllowAny: true,
		Incoming: &identity.OAuthClient{
			Name:                    req.Name,
			Description:             req.Description,
			RedirectURIs:            req.RedirectURIs,
			AllowedScopes:           req.AllowedScopes,
			TokenEndpointAuthMethod: req.TokenEndpointAuthMethod,
			RefreshTokenPolicy:      req.RefreshTokenPolicy,
		},
		Mask: req.UpdateMask,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}
	return client, nil
}

// AdminRotateOAuthClientSecret rotates an instance OAuth client's secret.
func (c *coordinator) AdminRotateOAuthClientSecret(ctx context.Context, req *AdminRotateOAuthClientSecretRequest) (*identity.OAuthClient, error) {
	const op errors.Op = "application/iam.AdminRotateOAuthClientSecret"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, "request is required")
	}
	client, err := c.identityService.RotateOAuthClientSecret(ctx, req.ID, nil, true)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return client, nil
}

// AdminDeleteOAuthClient deletes an instance/DCR/CIMD OAuth client.
func (c *coordinator) AdminDeleteOAuthClient(ctx context.Context, req *AdminDeleteOAuthClientRequest) error {
	const op errors.Op = "application/iam.AdminDeleteOAuthClient"

	if req == nil {
		return errors.E(op, errors.Invalid, "request is required")
	}
	if err := c.identityService.DeleteOAuthClient(ctx, req.ID, nil, true, new(req.ActorUserID), req.IPAddress, req.UserAgent); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// ListUserOAuthGrants returns all active OAuth grants for a user hydrated with client & workspace names.
func (c *coordinator) ListUserOAuthGrants(ctx context.Context, req *ListUserOAuthGrantsRequest) ([]*UserOAuthGrant, error) {
	const op errors.Op = "application/iam.ListUserOAuthGrants"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, "request is required")
	}
	grants, err := c.identityService.ListUserOAuthGrants(ctx, req.UserID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if len(grants) == 0 {
		return []*UserOAuthGrant{}, nil
	}

	clientIDSet := make(map[identity.OAuthClientID]struct{}, len(grants))
	clientIDs := make([]identity.OAuthClientID, 0, len(grants))
	for _, g := range grants {
		if _, seen := clientIDSet[g.ClientID]; !seen {
			clientIDSet[g.ClientID] = struct{}{}
			clientIDs = append(clientIDs, g.ClientID)
		}
	}

	clients, err := c.identityService.ListOAuthClientsByIDs(ctx, clientIDs)
	if err != nil {
		return nil, errors.E(op, err)
	}
	clientMap := make(map[identity.OAuthClientID]*identity.OAuthClient, len(clients))
	for _, cl := range clients {
		clientMap[cl.ID] = cl
	}

	spacesMap, err := c.listAllUserSpacesMap(ctx, space.UserID(req.UserID))
	if err != nil {
		return nil, errors.E(op, err)
	}

	out := make([]*UserOAuthGrant, 0, len(grants))
	for _, g := range grants {
		item := &UserOAuthGrant{
			Grant: g,
		}
		if cl, ok := clientMap[g.ClientID]; ok && cl != nil {
			item.ClientName = cl.Name
			item.IsWorkspace = cl.SpaceID != nil
		}
		if sp, ok := spacesMap[g.SpaceID]; ok && sp != nil {
			item.SpaceName = sp.Name
		}
		out = append(out, item)
	}
	return out, nil
}

// RevokeUserOAuthGrant revokes a personal OAuth grant owned by the caller.
func (c *coordinator) RevokeUserOAuthGrant(ctx context.Context, req *RevokeUserOAuthGrantRequest) error {
	const op errors.Op = "application/iam.RevokeUserOAuthGrant"

	if req == nil {
		return errors.E(op, errors.Invalid, "request is required")
	}
	if err := c.identityService.RevokeUserOAuthGrant(ctx, req.UserID, req.GrantID, req.IPAddress, req.UserAgent); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// InspectOAuthConsent validates an incoming OAuth 2.1 authorization request and computes workspace & scope options.
func (c *coordinator) InspectOAuthConsent(ctx context.Context, req *InspectOAuthConsentRequest) (*InspectOAuthConsentResponse, error) {
	const op errors.Op = "application/iam.InspectOAuthConsent"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidRequest, "request is required")
	}
	if !req.UserID.IsValid() {
		return nil, errors.E(op, errors.Unauthenticated, "user is required")
	}
	if req.ResponseType != "code" {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidRequest, "response_type must be 'code'")
	}
	if req.CodeChallenge == "" || req.CodeChallengeMethod != "S256" {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidRequest, "PKCE S256 code_challenge is required")
	}
	candURL, err := identity.ValidateCandidateRedirectURI(req.RedirectURI)
	if err != nil {
		return nil, errors.E(op, err)
	}

	client, err := c.resolveOAuthClientForConsent(ctx, req.ClientID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if !client.MatchesRedirectURI(req.RedirectURI) {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidRedirectURI, "redirect_uri is not registered for this client")
	}

	resourceSpaceID, err := parseResourceTargetSpaceID(req.Resource)
	if err != nil {
		return nil, errors.E(op, err)
	}

	if client.SpaceID != nil && resourceSpaceID != "" && resourceSpaceID != *client.SpaceID {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidTarget, "requested resource workspace does not match workspace client")
	}

	var lockedSpaceID string
	if client.SpaceID != nil {
		lockedSpaceID = *client.SpaceID
	} else if resourceSpaceID != "" {
		lockedSpaceID = resourceSpaceID
	}

	if lockedSpaceID != "" {
		session := space.Session{
			SpaceID: space.SpaceID(lockedSpaceID),
			UserID:  space.UserID(req.UserID),
		}
		member, err := c.spaceService.GetSpaceMember(ctx, session)
		if err != nil {
			return nil, errors.E(op, errors.Permission, identity.OAuthAccessDenied, "you are not a member of the target workspace")
		}
		sp, err := c.spaceService.GetSpace(ctx, session)
		if err != nil {
			return nil, errors.E(op, err)
		}
		effectiveScopes, _, err := identity.ResolveRequestedOAuthScopes(req.Scopes, client.AllowedScopes, string(member.Role))
		if err != nil {
			return nil, errors.E(op, err)
		}
		return &InspectOAuthConsentResponse{
			Client:          client,
			RedirectURI:     req.RedirectURI,
			RedirectURIHost: candURL.Host,
			Resource:        req.Resource,
			LockedSpaceID:   lockedSpaceID,
			EffectiveScopes: effectiveScopes,
			Spaces: []*ConsentSpaceOption{
				{
					SpaceID:       string(sp.ID),
					SpaceName:     sp.Name,
					Role:          string(member.Role),
					AllowedScopes: effectiveScopes,
				},
			},
		}, nil
	}

	spacesMap, err := c.listAllUserSpacesMap(ctx, space.UserID(req.UserID))
	if err != nil {
		return nil, errors.E(op, err)
	}
	if len(spacesMap) == 0 {
		return nil, errors.E(op, errors.Precondition, identity.OAuthAccessDenied, "you do not belong to any workspace")
	}

	spaceOptions := make([]*ConsentSpaceOption, 0, len(spacesMap))
	var defaultEffective []string
	for _, sp := range spacesMap {
		member, err := c.spaceService.GetSpaceMember(ctx, space.Session{
			SpaceID: sp.ID,
			UserID:  space.UserID(req.UserID),
		})
		if err != nil {
			continue
		}
		allowedForRole, _, scopeErr := identity.ResolveRequestedOAuthScopes(req.Scopes, client.AllowedScopes, string(member.Role))
		if scopeErr != nil {
			continue
		}
		if len(defaultEffective) == 0 {
			defaultEffective = allowedForRole
		}
		spaceOptions = append(spaceOptions, &ConsentSpaceOption{
			SpaceID:       string(sp.ID),
			SpaceName:     sp.Name,
			Role:          string(member.Role),
			AllowedScopes: allowedForRole,
		})
	}
	slices.SortFunc(spaceOptions, func(a, b *ConsentSpaceOption) int {
		return strings.Compare(a.SpaceName, b.SpaceName)
	})
	if len(spaceOptions) == 0 {
		return nil, errors.E(op, errors.Permission, identity.OAuthInvalidScope, "no workspaces have permitted scopes for this authorization request")
	}

	return &InspectOAuthConsentResponse{
		Client:          client,
		RedirectURI:     req.RedirectURI,
		RedirectURIHost: candURL.Host,
		Resource:        req.Resource,
		LockedSpaceID:   "",
		EffectiveScopes: defaultEffective,
		Spaces:          spaceOptions,
	}, nil
}

// DecideOAuthConsent persists an approved or denied user consent decision and returns a 60s handoff nonce.
func (c *coordinator) DecideOAuthConsent(ctx context.Context, req *DecideOAuthConsentRequest) (*DecideOAuthConsentResponse, error) {
	const op errors.Op = "application/iam.DecideOAuthConsent"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidRequest, "request is required")
	}
	if !req.UserID.IsValid() {
		return nil, errors.E(op, errors.Unauthenticated, "user is required")
	}
	if _, err := identity.ValidateCandidateRedirectURI(req.RedirectURI); err != nil {
		return nil, errors.E(op, err)
	}

	client, err := c.resolveOAuthClientForConsent(ctx, req.ClientID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if !client.MatchesRedirectURI(req.RedirectURI) {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidRedirectURI, "redirect_uri is not registered for this client")
	}

	if !req.Approved {
		handoff, err := c.identityService.CreateOAuthAuthCode(ctx, identity.CreateOAuthAuthCodeParams{
			Approved:            false,
			ClientID:            client.ID,
			UserID:              req.UserID,
			RedirectURI:         req.RedirectURI,
			State:               req.State,
			Resource:            req.Resource,
			CodeChallenge:       req.CodeChallenge,
			CodeChallengeMethod: req.CodeChallengeMethod,
		})
		if err != nil {
			return nil, errors.E(op, err)
		}
		return &DecideOAuthConsentResponse{HandoffToken: handoff}, nil
	}

	if req.ResponseType != "code" {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidRequest, "response_type must be 'code'")
	}
	if req.CodeChallenge == "" || req.CodeChallengeMethod != "S256" {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidRequest, "PKCE S256 code_challenge is required")
	}

	parsedSpaceID, err := space.ParseSpaceID(req.SpaceID)
	if err != nil {
		return nil, errors.E(op, errors.Invalid, "invalid space_id")
	}
	if client.SpaceID != nil && *client.SpaceID != string(parsedSpaceID) {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidTarget, "workspace does not match workspace client")
	}
	resourceSpaceID, err := parseResourceTargetSpaceID(req.Resource)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if resourceSpaceID != "" && resourceSpaceID != string(parsedSpaceID) {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidTarget, "workspace does not match requested resource")
	}

	member, err := c.spaceService.GetSpaceMember(ctx, space.Session{
		SpaceID: parsedSpaceID,
		UserID:  space.UserID(req.UserID),
	})
	if err != nil {
		return nil, errors.E(op, errors.Permission, identity.OAuthAccessDenied, "user is not an active member of the selected workspace")
	}

	maxPermitted, _, err := identity.ResolveRequestedOAuthScopes(req.RequestedScopes, client.AllowedScopes, string(member.Role))
	if err != nil {
		return nil, errors.E(op, err)
	}

	finalScopes := maxPermitted
	if len(req.ApprovedScopes) > 0 {
		maxSet := make(map[string]struct{}, len(maxPermitted))
		for _, s := range maxPermitted {
			maxSet[s] = struct{}{}
		}
		finalScopes = make([]string, 0, len(req.ApprovedScopes))
		seen := make(map[string]struct{}, len(req.ApprovedScopes))
		for _, s := range req.ApprovedScopes {
			trimmed := strings.TrimSpace(s)
			if _, ok := maxSet[trimmed]; !ok {
				return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidScope, "approved scope exceeds permitted scopes")
			}
			if _, dup := seen[trimmed]; !dup {
				seen[trimmed] = struct{}{}
				finalScopes = append(finalScopes, trimmed)
			}
		}
	}
	if len(finalScopes) == 0 {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidScope, "at least one scope must be granted")
	}

	handoff, err := c.identityService.CreateOAuthAuthCode(ctx, identity.CreateOAuthAuthCodeParams{
		Approved:            true,
		ClientID:            client.ID,
		UserID:              req.UserID,
		SpaceID:             string(parsedSpaceID),
		RedirectURI:         req.RedirectURI,
		State:               req.State,
		Resource:            req.Resource,
		Scopes:              finalScopes,
		CodeChallenge:       req.CodeChallenge,
		CodeChallengeMethod: req.CodeChallengeMethod,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}
	return &DecideOAuthConsentResponse{HandoffToken: handoff}, nil
}

// RegisterDynamicOAuthClient handles RFC 7591 dynamic client registration for instance or workspace endpoints.
func (c *coordinator) RegisterDynamicOAuthClient(ctx context.Context, req *RegisterDynamicOAuthClientRequest) (*identity.OAuthClient, error) {
	const op errors.Op = "application/iam.RegisterDynamicOAuthClient"

	if !c.oauthConfig.AllowDynamicRegistration {
		return nil, errors.E(op, errors.Permission, identity.OAuthRegistrationDisabled, "dynamic client registration is disabled")
	}
	if req == nil {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidRequest, "request is required")
	}

	var normalizedSpaceID *string
	if req.SpaceID != nil && strings.TrimSpace(*req.SpaceID) != "" {
		parsedSpaceID, err := space.ParseSpaceID(strings.TrimSpace(*req.SpaceID))
		if err != nil {
			return nil, errors.E(op, errors.Invalid, "invalid space_id")
		}
		exists, err := c.spaceService.SpaceExists(ctx, parsedSpaceID)
		if err != nil {
			return nil, errors.E(op, err)
		}
		if !exists {
			return nil, errors.E(op, errors.NotExist, space.NotFound, "space not found")
		}
		normalizedSpaceID = new(string(parsedSpaceID))
	}

	authMethod := identity.TokenEndpointAuthMethod(strings.TrimSpace(req.TokenEndpointAuthMethod))
	if authMethod == "" {
		authMethod = identity.TokenAuthMethodClientSecretBasic
	}

	allowedScopes, err := resolveDCRScopes(req.Scope)
	if err != nil {
		return nil, errors.E(op, err)
	}

	clientName := strings.TrimSpace(req.Name)
	if clientName == "" {
		clientName = deriveDCRClientName(req.RedirectURIs)
	}

	client, err := c.identityService.CreateOAuthClient(ctx, identity.CreateOAuthClientParams{
		SpaceID:                 normalizedSpaceID,
		Name:                    clientName,
		RedirectURIs:            req.RedirectURIs,
		AllowedScopes:           allowedScopes,
		TokenEndpointAuthMethod: authMethod,
		RefreshTokenPolicy:      identity.RefreshTokenPolicyRotate,
		RegistrationSource:      identity.RegistrationSourceDCR,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}
	return client, nil
}

// ConsumeOAuthRedirectHandoff atomically consumes a handoff nonce and constructs the OAuth 2.1 callback redirect URL.
func (c *coordinator) ConsumeOAuthRedirectHandoff(ctx context.Context, req *ConsumeOAuthRedirectHandoffRequest) (*ConsumeOAuthRedirectHandoffResponse, error) {
	const op errors.Op = "application/iam.ConsumeOAuthRedirectHandoff"

	if req == nil || strings.TrimSpace(req.HandoffToken) == "" {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidRequest, "handoff token is required")
	}

	codeRecord, rawCode, err := c.identityService.ConsumeOAuthRedirectHandoff(ctx, strings.TrimSpace(req.HandoffToken))
	if err != nil {
		return nil, errors.E(op, err)
	}

	targetURL, err := url.Parse(codeRecord.RedirectURI)
	if err != nil {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidRedirectURI, "invalid redirect_uri")
	}

	q := targetURL.Query()
	if codeRecord.Approved {
		q.Set("code", rawCode)
	} else {
		q.Set("error", "access_denied")
		q.Set("error_description", "The resource owner denied the authorization request")
	}
	if codeRecord.State != "" {
		q.Set("state", codeRecord.State)
	}
	targetURL.RawQuery = q.Encode()

	return &ConsumeOAuthRedirectHandoffResponse{
		RedirectURL: targetURL.String(),
	}, nil
}

// ExchangeOAuthToken handles OAuth 2.1 `authorization_code` and `refresh_token` grants.
func (c *coordinator) ExchangeOAuthToken(ctx context.Context, req *ExchangeOAuthTokenRequest) (*ExchangeOAuthTokenResponse, error) {
	const op errors.Op = "application/iam.ExchangeOAuthToken"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidRequest, "request is required")
	}

	client, err := c.resolveClientForTokenEndpoint(ctx, req.ClientID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if err := verifyOAuthClientAuth(client, req.ClientSecret, req.AuthMethodUsed); err != nil {
		return nil, errors.E(op, err)
	}

	switch req.GrantType {
	case "authorization_code":
		codeRecord, err := c.identityService.ConsumeOAuthAuthCode(ctx, client, req.Code, req.RedirectURI, req.CodeVerifier, req.Resource)
		if err != nil {
			return nil, errors.E(op, err)
		}

		user, err := c.identityService.GetUserByID(ctx, codeRecord.UserID)
		if err != nil || user == nil || user.Status != identity.UserStatusActive || user.IsLocked(time.Now().UTC()) {
			return nil, errors.E(op, errors.Unauthenticated, identity.OAuthInvalidGrant, "user account is inactive or locked")
		}

		member, err := c.spaceService.GetSpaceMember(ctx, space.Session{
			SpaceID: space.SpaceID(codeRecord.SpaceID),
			UserID:  space.UserID(codeRecord.UserID),
		})
		if err != nil {
			return nil, errors.E(op, errors.Permission, identity.OAuthInvalidGrant, "user is no longer a member of the authorized workspace")
		}

		finalScopes, _, err := identity.ResolveRequestedOAuthScopes(codeRecord.Scopes, client.AllowedScopes, string(member.Role))
		if err != nil {
			return nil, errors.E(op, err)
		}

		issued, err := c.identityService.CreateOAuthGrantAndIssueTokens(
			ctx,
			client,
			codeRecord.UserID,
			codeRecord.SpaceID,
			finalScopes,
			c.oauthConfig.AccessTokenTTL,
			c.oauthConfig.RefreshTokenTTL,
			req.IPAddress,
			req.UserAgent,
		)
		if err != nil {
			return nil, errors.E(op, err)
		}

		return &ExchangeOAuthTokenResponse{
			AccessToken:  issued.AccessToken,
			TokenType:    "Bearer",
			ExpiresIn:    issued.ExpiresIn,
			RefreshToken: issued.RefreshToken,
			Scope:        strings.Join(issued.Grant.Scopes, " "),
		}, nil

	case "refresh_token":
		issued, err := c.identityService.RefreshOAuthGrant(
			ctx,
			client,
			req.RefreshToken,
			c.oauthConfig.AccessTokenTTL,
			c.oauthConfig.RefreshTokenTTL,
		)
		if err != nil {
			if errors.CodeOf(err) == identity.OAuthGrantRevoked {
				if ctrl := db.TxControllerFromContext(ctx); ctrl != nil && !ctrl.IsDone() {
					_ = ctrl.Commit()
				}
			}
			return nil, errors.E(op, err)
		}

		user, err := c.identityService.GetUserByID(ctx, issued.Grant.UserID)
		if err != nil || user == nil || user.Status != identity.UserStatusActive || user.IsLocked(time.Now().UTC()) {
			_ = c.identityService.RevokeSpaceOAuthGrant(ctx, issued.Grant.SpaceID, issued.Grant.ID)
			if ctrl := db.TxControllerFromContext(ctx); ctrl != nil && !ctrl.IsDone() {
				_ = ctrl.Commit()
			}
			return nil, errors.E(op, errors.Unauthenticated, identity.OAuthInvalidGrant, "user account is inactive or locked")
		}

		if _, err := c.spaceService.GetSpaceMember(ctx, space.Session{
			SpaceID: space.SpaceID(issued.Grant.SpaceID),
			UserID:  space.UserID(issued.Grant.UserID),
		}); err != nil {
			_ = c.identityService.RevokeSpaceOAuthGrant(ctx, issued.Grant.SpaceID, issued.Grant.ID)
			if ctrl := db.TxControllerFromContext(ctx); ctrl != nil && !ctrl.IsDone() {
				_ = ctrl.Commit()
			}
			return nil, errors.E(op, errors.Permission, identity.OAuthInvalidGrant, "user is no longer a member of the authorized workspace")
		}

		return &ExchangeOAuthTokenResponse{
			AccessToken:  issued.AccessToken,
			TokenType:    "Bearer",
			ExpiresIn:    issued.ExpiresIn,
			RefreshToken: issued.RefreshToken,
			Scope:        strings.Join(issued.Grant.Scopes, " "),
		}, nil

	default:
		return nil, errors.E(op, errors.Invalid, identity.OAuthUnsupportedGrantType, "unsupported grant_type")
	}
}

// RevokeOAuthToken handles RFC 7009 token revocation for access or refresh tokens.
func (c *coordinator) RevokeOAuthToken(ctx context.Context, req *RevokeOAuthTokenRequest) error {
	const op errors.Op = "application/iam.RevokeOAuthToken"

	if req == nil {
		return errors.E(op, errors.Invalid, identity.OAuthInvalidRequest, "request is required")
	}

	var clientID identity.OAuthClientID
	if strings.TrimSpace(req.ClientID) != "" {
		client, err := c.resolveClientForTokenEndpoint(ctx, req.ClientID)
		if err != nil {
			return errors.E(op, err)
		}
		if client.TokenEndpointAuthMethod != identity.TokenAuthMethodNone {
			if err := verifyOAuthClientAuth(client, req.ClientSecret, req.AuthMethodUsed); err != nil {
				return errors.E(op, err)
			}
		}
		clientID = client.ID
	}

	if err := c.identityService.RevokeOAuthToken(ctx, strings.TrimSpace(req.Token), clientID); err != nil {
		return errors.E(op, err)
	}
	return nil
}

func (c *coordinator) resolveOAuthClientForConsent(ctx context.Context, rawClientID string) (*identity.OAuthClient, error) {
	clientID, err := identity.ParseOAuthClientID(rawClientID)
	if err != nil {
		return nil, err
	}

	if !clientID.IsCIMDURL() {
		return c.identityService.GetOAuthClient(ctx, clientID)
	}

	if !c.oauthConfig.AllowDynamicRegistration {
		return nil, errors.E(errors.Permission, identity.OAuthRegistrationDisabled, "dynamic client registration and CIMD are disabled")
	}

	existing, err := c.identityService.GetOAuthClient(ctx, clientID)
	var etag string
	if err == nil && existing != nil {
		etag = existing.MetadataETag
		if existing.MetadataFetchedAt != nil && time.Since(*existing.MetadataFetchedAt) < cimdCacheTTL {
			return existing, nil
		}
	}

	fetched, err := c.cimdResolver.FetchMetadata(ctx, string(clientID), etag)
	if err != nil {
		return nil, err
	}
	if fetched.NotModified && existing != nil {
		existing.MetadataFetchedAt = new(time.Now().UTC())
		return c.identityService.UpsertCIMDOAuthClient(ctx, existing)
	}

	allowedScopes, err := resolveDCRScopes(fetched.Metadata.Scope)
	if err != nil {
		return nil, err
	}

	return c.identityService.UpsertCIMDOAuthClient(ctx, &identity.OAuthClient{
		ID:                      clientID,
		Name:                    fetched.Metadata.ClientName,
		Description:             fetched.Metadata.ClientURI,
		RedirectURIs:            fetched.Metadata.RedirectURIs,
		AllowedScopes:           allowedScopes,
		TokenEndpointAuthMethod: identity.TokenAuthMethodNone,
		RefreshTokenPolicy:      identity.RefreshTokenPolicyRotate,
		RegistrationSource:      identity.RegistrationSourceCIMD,
		MetadataETag:            fetched.ETag,
	})
}

func (c *coordinator) resolveClientForTokenEndpoint(ctx context.Context, rawClientID string) (*identity.OAuthClient, error) {
	clientID, err := identity.ParseOAuthClientID(rawClientID)
	if err != nil {
		return nil, errors.E(errors.Unauthenticated, identity.OAuthInvalidClient, err)
	}
	client, err := c.identityService.GetOAuthClient(ctx, clientID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(errors.Unauthenticated, identity.OAuthInvalidClient, "unknown oauth client")
		}
		return nil, err
	}
	return client, nil
}

func verifyOAuthClientAuth(client *identity.OAuthClient, rawSecret string, authMethodUsed string) error {
	switch client.TokenEndpointAuthMethod {
	case identity.TokenAuthMethodNone:
		if rawSecret != "" {
			return errors.E(errors.Unauthenticated, identity.OAuthInvalidClient, "public client must not send client_secret")
		}
		return nil
	case identity.TokenAuthMethodClientSecretBasic, identity.TokenAuthMethodClientSecretPost:
		if authMethodUsed != "" && authMethodUsed != string(client.TokenEndpointAuthMethod) {
			return errors.E(errors.Unauthenticated, identity.OAuthInvalidClient, "invalid client authentication method")
		}
		if !identity.VerifyOAuthSecret(client.SecretHash, rawSecret) {
			return errors.E(errors.Unauthenticated, identity.OAuthInvalidClient, "invalid client credentials")
		}
		return nil
	default:
		return errors.E(errors.Unauthenticated, identity.OAuthInvalidClient, "unsupported client authentication method")
	}
}

func deriveDCRClientName(redirectURIs []string) string {
	for _, raw := range redirectURIs {
		if u, err := url.Parse(strings.TrimSpace(raw)); err == nil && u.Hostname() != "" {
			return "OAuth Client (" + u.Hostname() + ")"
		}
	}
	return "Dynamic OAuth Client"
}

func resolveDCRScopes(rawScope string) ([]string, error) {
	trimmed := strings.TrimSpace(rawScope)
	if trimmed == "" {
		return identity.AllAPIKeyScopeStrings(), nil
	}

	var nonOIDC []string
	var valid []string
	seen := make(map[string]struct{})
	for part := range strings.FieldsSeq(trimmed) {
		switch part {
		case "openid", "profile", "email", "address", "phone", "offline_access":
			continue
		default:
			nonOIDC = append(nonOIDC, part)
			if identity.APIKeyScope(part).IsValid() {
				if _, dup := seen[part]; !dup {
					seen[part] = struct{}{}
					valid = append(valid, part)
				}
			}
		}
	}

	if len(nonOIDC) == 0 {
		return identity.AllAPIKeyScopeStrings(), nil
	}
	if len(valid) == 0 {
		return nil, errors.E(errors.Invalid, identity.OAuthInvalidScope, "no valid Saturn scopes requested")
	}
	return valid, nil
}

func parseResourceTargetSpaceID(rawResource string) (string, error) {
	trimmed := strings.TrimSpace(rawResource)
	if trimmed == "" {
		return "", nil
	}
	u, err := url.Parse(trimmed)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" {
		return "", errors.E(errors.Invalid, identity.OAuthInvalidTarget, "invalid resource URI")
	}

	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	for i := range len(parts) - 1 {
		if parts[i] == "spaces" && parts[i+1] != "" {
			parsed, err := space.ParseSpaceID(parts[i+1])
			if err != nil {
				return "", errors.E(errors.Invalid, identity.OAuthInvalidTarget, "invalid workspace ID in resource URI")
			}
			return string(parsed), nil
		}
	}
	return "", nil
}

func (c *coordinator) listAllUserSpacesMap(ctx context.Context, userID space.UserID) (map[string]*space.Space, error) {
	spacesMap := make(map[string]*space.Space)
	pageToken := ""
	for {
		page, err := c.spaceService.ListSpaces(ctx, userID, &space.ListSpacesFilter{
			PageSize:      100,
			NextPageToken: pageToken,
		})
		if err != nil {
			return nil, err
		}
		for _, sp := range page.Items {
			spacesMap[string(sp.ID)] = sp
		}
		if !page.HasMore || page.NextPageToken == "" {
			break
		}
		pageToken = page.NextPageToken
	}
	return spacesMap, nil
}
