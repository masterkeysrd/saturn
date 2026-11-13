package connector

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .
//go:generate go run github.com/masterkeysrd/saturn/tools/txgen -target=Coordinator
//go:generate go run github.com/masterkeysrd/saturn/tools/loggen -target=Coordinator

import (
	"context"
	"fmt"
	"slices"
	"time"

	connectorv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/connector/v1"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
)

// Coordinator defines the application use-case operations for connected accounts,
// OAuth initiation and callback completions, capability updates, and contact syncing.
// @Mock
type Coordinator interface {
	ListProviders(ctx context.Context) ([]*ProviderDescriptor, error)

	// @transactional
	InitiateOAuth(ctx context.Context, req *InitiateOAuthRequest) (*InitiateOAuthResult, error)

	// @transactional
	CompleteOAuth(ctx context.Context, req *CompleteOAuthRequest) (*CompleteOAuthResult, error)

	ListConnectedAccounts(ctx context.Context, req *ListConnectedAccountsRequest) ([]*connector.ConnectedAccount, error)

	GetConnectedAccount(ctx context.Context, req *GetConnectedAccountRequest) (*connector.ConnectedAccount, error)

	// @transactional
	UpdateConnectedAccount(ctx context.Context, req *UpdateConnectedAccountRequest) (*connector.ConnectedAccount, error)

	// @transactional
	DeleteConnectedAccount(ctx context.Context, req *DeleteConnectedAccountRequest) error

	// @transactional
	SyncConnectedAccount(ctx context.Context, req *SyncConnectedAccountRequest) (*connector.ConnectedAccount, error)

	SuggestContacts(ctx context.Context, req *SuggestContactsRequest) ([]*connector.AccountContact, error)

	// @transactional
	SyncContacts(ctx context.Context, req *SyncContactsRequest) error
}

// ProviderDescriptor describes an available OAuth provider adapter and its capabilities.
type ProviderDescriptor struct {
	ID                    string
	DisplayName           string
	SupportedCapabilities []string
	IconURL               string
}

// InitiateOAuthRequest represents input for starting an OAuth session.
type InitiateOAuthRequest struct {
	SpaceID            string
	UserID             string
	Provider           string
	ReturnURL          string
	Capabilities       []string
	ConnectedAccountID *string
}

// InitiateOAuthResult represents the output of InitiateOAuth.
type InitiateOAuthResult struct {
	AuthURL string
	State   string
}

// CompleteOAuthRequest represents input from the OAuth callback.
type CompleteOAuthRequest struct {
	Provider string
	Code     string
	State    string
}

// CompleteOAuthResult represents the output of CompleteOAuth.
type CompleteOAuthResult struct {
	Account   *connector.ConnectedAccount
	ReturnURL string
}

// ListConnectedAccountsRequest represents input for listing connected accounts.
type ListConnectedAccountsRequest struct {
	SpaceID  string
	Provider string
}

// GetConnectedAccountRequest represents input for getting a single connected account.
type GetConnectedAccountRequest struct {
	SpaceID   string
	AccountID string
}

// UpdateConnectedAccountRequest represents input for updating a connected account.
type UpdateConnectedAccountRequest struct {
	SpaceID    string
	AccountID  string
	Account    *connector.ConnectedAccount
	UpdateMask []string
}

// DeleteConnectedAccountRequest represents input for deleting a connected account.
type DeleteConnectedAccountRequest struct {
	SpaceID   string
	AccountID string
}

// SyncConnectedAccountRequest represents input for manually triggering an account sync.
type SyncConnectedAccountRequest struct {
	SpaceID   string
	AccountID string
}

// SuggestContactsRequest represents input for contact autocomplete.
type SuggestContactsRequest struct {
	SpaceID string
	Query   string
	Limit   int
}

// SyncContactsRequest represents input for syncing contacts.
type SyncContactsRequest struct {
	SpaceID   string
	AccountID string
}

// Dependencies holds components required to construct a Coordinator.
type Dependencies struct {
	Store        connector.Store
	OAuthManager *connector.OAuthManager
	TokenManager *connector.TokenManager
	Providers    *connector.ProviderRegistry
	Cleaners     *connector.CleanerRegistry
	Scheduler    scheduler.Scheduler
}

type coordinator struct {
	store        connector.Store
	oauthManager *connector.OAuthManager
	tokenManager *connector.TokenManager
	providers    *connector.ProviderRegistry
	cleaners     *connector.CleanerRegistry
	scheduler    scheduler.Scheduler
}

// NewCoordinator creates a new application Coordinator instance.
func NewCoordinator(deps Dependencies) Coordinator {
	cleaners := deps.Cleaners
	if cleaners == nil {
		cleaners = connector.DefaultCleanerRegistry
	}
	return &coordinator{
		store:        deps.Store,
		oauthManager: deps.OAuthManager,
		tokenManager: deps.TokenManager,
		providers:    deps.Providers,
		cleaners:     cleaners,
		scheduler:    deps.Scheduler,
	}
}

var _ Coordinator = (*coordinator)(nil)

func isSpaceAdminOrOwner(role string) bool {
	return role == string(space.RoleOwner) || role == string(space.RoleAdmin)
}

func (c *coordinator) ListProviders(ctx context.Context) ([]*ProviderDescriptor, error) {
	descriptors := []*ProviderDescriptor{
		{
			ID:          "google",
			DisplayName: "Google",
			SupportedCapabilities: []string{
				string(connector.CapabilityCalendar),
				string(connector.CapabilityMail),
				string(connector.CapabilityContacts),
			},
			IconURL: "https://auth.saturn.local/icons/google.svg",
		},
		{
			ID:          "microsoft",
			DisplayName: "Microsoft 365",
			SupportedCapabilities: []string{
				string(connector.CapabilityCalendar),
				string(connector.CapabilityMail),
				string(connector.CapabilityContacts),
			},
			IconURL: "https://auth.saturn.local/icons/microsoft.svg",
		},
	}
	return descriptors, nil
}

func (c *coordinator) InitiateOAuth(ctx context.Context, req *InitiateOAuthRequest) (*InitiateOAuthResult, error) {
	const op errors.Op = "application/connector.InitiateOAuth"

	role, ok := auth.SpaceRoleFromContext(ctx)
	if !ok || !isSpaceAdminOrOwner(role) {
		return nil, errors.E(op, errors.Permission, ErrUnauthorizedRole, "initiating oauth requires space owner or admin role")
	}

	spaceID := req.SpaceID
	if spaceID == "" {
		if sID, ok := auth.SpaceIDFromContext(ctx); ok {
			spaceID = sID
		}
	}

	userID := req.UserID
	if userID == "" {
		if principal, ok := auth.PrincipalFromContext(ctx); ok {
			userID = principal.Subject
		}
	}

	provider, err := c.providers.Get(req.Provider)
	if err != nil {
		return nil, errors.E(op, errors.Invalid, fmt.Sprintf("unsupported provider %q: %v", req.Provider, err))
	}

	caps := make([]connector.Capability, 0, len(req.Capabilities))
	for _, cStr := range req.Capabilities {
		caps = append(caps, connector.Capability(cStr))
	}

	stateSession, err := c.oauthManager.InitiateSession(ctx, connector.CreateStateRequest{
		SpaceID:            spaceID,
		UserID:             userID,
		Provider:           req.Provider,
		Capabilities:       caps,
		ConnectedAccountID: req.ConnectedAccountID,
		ReturnURL:          req.ReturnURL,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	authURL := provider.AuthCodeURL(stateSession.RawState, stateSession.CodeChallenge, caps, true)
	return &InitiateOAuthResult{
		AuthURL: authURL,
		State:   stateSession.RawState,
	}, nil
}

func (c *coordinator) CompleteOAuth(ctx context.Context, req *CompleteOAuthRequest) (*CompleteOAuthResult, error) {
	const op errors.Op = "application/connector.CompleteOAuth"

	if req.State == "" {
		return nil, errors.E(op, errors.Invalid, ErrInvalidState, "oauth state is required")
	}

	stateRecord, codeVerifier, err := c.oauthManager.ConsumeSession(ctx, req.State)
	if err != nil {
		return nil, errors.E(op, errors.Precondition, ErrInvalidState, fmt.Sprintf("consume oauth session: %v", err))
	}

	if stateRecord.Provider != req.Provider {
		return nil, errors.E(op, errors.Invalid, "provider mismatch between state and request")
	}

	provider, err := c.providers.Get(req.Provider)
	if err != nil {
		return nil, errors.E(op, err)
	}

	tokenResp, err := provider.Exchange(ctx, req.Code, codeVerifier)
	if err != nil {
		return nil, errors.E(op, errors.Unauthenticated, fmt.Sprintf("oauth exchange failed: %v", err))
	}

	identity, err := provider.FetchIdentity(ctx, tokenResp.AccessToken)
	if err != nil {
		return nil, errors.E(op, errors.Internal, fmt.Sprintf("fetch provider identity failed: %v", err))
	}

	caps := make([]connector.Capability, 0, len(stateRecord.Capabilities))
	for _, cStr := range stateRecord.Capabilities {
		caps = append(caps, connector.Capability(cStr))
	}

	account, err := c.tokenManager.SaveAccount(ctx, connector.SaveAccountParams{
		SpaceID:             stateRecord.SpaceID,
		UserID:              stateRecord.UserID,
		Provider:            req.Provider,
		ProviderAccountID:   identity.ProviderAccountID,
		Email:               identity.Email,
		DisplayName:         &identity.DisplayName,
		AvatarURL:           &identity.AvatarURL,
		AccessToken:         tokenResp.AccessToken,
		RefreshToken:        tokenResp.RefreshToken,
		TokenExpiry:         tokenResp.Expiry,
		GrantedScopes:       tokenResp.GrantedScopes,
		EnabledCapabilities: caps,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	// Enqueue initial sync jobs
	c.enqueueAccountSync(ctx, account, caps)

	return &CompleteOAuthResult{
		Account:   account,
		ReturnURL: stateRecord.ReturnURL,
	}, nil
}

func (c *coordinator) ListConnectedAccounts(ctx context.Context, req *ListConnectedAccountsRequest) ([]*connector.ConnectedAccount, error) {
	const op errors.Op = "application/connector.ListConnectedAccounts"

	accounts, err := c.store.ListAccounts(ctx, req.SpaceID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	if req.Provider != "" {
		filtered := make([]*connector.ConnectedAccount, 0, len(accounts))
		for _, a := range accounts {
			if a.Provider == req.Provider {
				filtered = append(filtered, a)
			}
		}
		return filtered, nil
	}

	return accounts, nil
}

func (c *coordinator) GetConnectedAccount(ctx context.Context, req *GetConnectedAccountRequest) (*connector.ConnectedAccount, error) {
	const op errors.Op = "application/connector.GetConnectedAccount"

	account, err := c.store.GetAccount(ctx, req.SpaceID, req.AccountID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if account == nil {
		return nil, errors.E(op, errors.NotExist, ErrAccountNotFound, "connected account not found")
	}
	return account, nil
}

func (c *coordinator) UpdateConnectedAccount(ctx context.Context, req *UpdateConnectedAccountRequest) (*connector.ConnectedAccount, error) {
	const op errors.Op = "application/connector.UpdateConnectedAccount"

	account, err := c.store.GetAccount(ctx, req.SpaceID, req.AccountID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if account == nil {
		return nil, errors.E(op, errors.NotExist, ErrAccountNotFound, "connected account not found")
	}

	mask := req.UpdateMask
	updateAll := len(mask) == 0

	hasMask := func(field string) bool {
		if updateAll {
			return true
		}
		return slices.Contains(mask, field)
	}

	if hasMask("display_name") && req.Account != nil && req.Account.DisplayName != nil {
		account.DisplayName = req.Account.DisplayName
	}
	if hasMask("color") && req.Account != nil && req.Account.Color != nil {
		account.Color = req.Account.Color
	}

	if hasMask("enabled_capabilities") && req.Account != nil {
		newCaps := req.Account.EnabledCapabilities

		// Find newly enabled capabilities
		var newlyEnabled []connector.Capability
		for _, nc := range newCaps {
			if !account.HasCapability(connector.Capability(nc)) {
				newlyEnabled = append(newlyEnabled, connector.Capability(nc))
			}
		}

		// Find disabled capabilities
		var disabled []connector.Capability
		for _, ec := range account.EnabledCapabilities {
			if !slices.Contains(newCaps, ec) {
				disabled = append(disabled, connector.Capability(ec))
			}
		}

		// Scope check for newly enabled capabilities
		if len(newlyEnabled) > 0 {
			p, err := c.providers.Get(account.Provider)
			if err != nil {
				return nil, errors.E(op, err)
			}
			requiredScopes := p.ScopesForCapabilities(newlyEnabled)
			missingScopes := connector.CalculateIncrementalScopes(account.GrantedScopes, requiredScopes)
			if len(missingScopes) > 0 {
				return nil, errors.E(op, errors.Precondition, ErrMissingOAuthScopes,
					"incremental oauth upgrade required: missing granted scopes",
					errors.Meta{
						"missing_scopes": missingScopes,
						"account_id":     account.ID,
					},
				)
			}
		}

		// Execute CapabilityCleaner for disabled capabilities
		if len(disabled) > 0 {
			if err := c.cleaners.RunCleaners(ctx, req.SpaceID, account.ID, disabled...); err != nil {
				return nil, errors.E(op, fmt.Errorf("run capability cleaners: %w", err))
			}
		}

		account.EnabledCapabilities = newCaps
		c.enqueueAccountSync(ctx, account, newlyEnabled)
	}

	if err := c.store.UpdateAccount(ctx, account); err != nil {
		return nil, errors.E(op, err)
	}

	return account, nil
}

func (c *coordinator) DeleteConnectedAccount(ctx context.Context, req *DeleteConnectedAccountRequest) error {
	const op errors.Op = "application/connector.DeleteConnectedAccount"

	role, ok := auth.SpaceRoleFromContext(ctx)
	if !ok || !isSpaceAdminOrOwner(role) {
		return errors.E(op, errors.Permission, ErrUnauthorizedRole, "deleting connected account requires space owner or admin role")
	}

	if err := c.tokenManager.DisconnectAccount(ctx, req.SpaceID, req.AccountID); err != nil {
		return errors.E(op, err)
	}
	return nil
}

func (c *coordinator) SyncConnectedAccount(ctx context.Context, req *SyncConnectedAccountRequest) (*connector.ConnectedAccount, error) {
	const op errors.Op = "application/connector.SyncConnectedAccount"

	account, err := c.store.GetAccount(ctx, req.SpaceID, req.AccountID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if account == nil {
		return nil, errors.E(op, errors.NotExist, ErrAccountNotFound, "connected account not found")
	}

	// Enforce 15s cooldown
	now := time.Now()
	if account.LastSyncTime != nil && now.Sub(*account.LastSyncTime) < 15*time.Second {
		return nil, errors.E(op, errors.Precondition, ErrCooldownActive,
			"manual sync rate limit exceeded: cooldown is 15 seconds",
			errors.Meta{
				"account_id":      account.ID,
				"last_sync_time":  *account.LastSyncTime,
				"cooldown_remain": (15*time.Second - now.Sub(*account.LastSyncTime)).String(),
			},
		)
	}

	c.enqueueAccountSync(ctx, account, []connector.Capability{
		connector.CapabilityContacts,
		connector.CapabilityCalendar,
		connector.CapabilityMail,
	})

	account.LastSyncTime = &now
	if err := c.store.UpdateAccount(ctx, account); err != nil {
		return nil, errors.E(op, err)
	}

	return account, nil
}

func (c *coordinator) SuggestContacts(ctx context.Context, req *SuggestContactsRequest) ([]*connector.AccountContact, error) {
	const op errors.Op = "application/connector.SuggestContacts"

	contacts, err := c.store.SuggestContacts(ctx, req.SpaceID, req.Query, req.Limit)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return contacts, nil
}

func (c *coordinator) SyncContacts(ctx context.Context, req *SyncContactsRequest) error {
	const op errors.Op = "application/connector.SyncContacts"

	account, err := c.store.GetAccount(ctx, req.SpaceID, req.AccountID)
	if err != nil {
		return errors.E(op, err)
	}
	if account == nil {
		return errors.E(op, errors.NotExist, ErrAccountNotFound, "connected account not found")
	}

	accessToken, err := c.tokenManager.TokenSource(ctx, req.SpaceID, req.AccountID)
	if err != nil {
		return errors.E(op, fmt.Errorf("token source: %w", err))
	}

	provider, err := c.providers.Get(account.Provider)
	if err != nil {
		return errors.E(op, err)
	}

	contacts, err := provider.FetchContacts(ctx, accessToken)
	if err != nil {
		return errors.E(op, fmt.Errorf("fetch contacts: %w", err))
	}

	accountContacts := make([]*connector.AccountContact, len(contacts))
	for i, c := range contacts {
		var email *string
		if c.Email != "" {
			email = &c.Email
		}
		var name *string
		if c.DisplayName != "" {
			name = &c.DisplayName
		}
		var avatar *string
		if c.AvatarURL != "" {
			avatar = &c.AvatarURL
		}
		accountContacts[i] = &connector.AccountContact{
			SpaceID:            req.SpaceID,
			ConnectedAccountID: req.AccountID,
			ProviderContactID:  c.ProviderContactID,
			Email:              email,
			DisplayName:        name,
			AvatarURL:          avatar,
		}
	}

	if err := c.store.UpsertContacts(ctx, accountContacts); err != nil {
		return errors.E(op, fmt.Errorf("upsert contacts: %w", err))
	}

	now := time.Now()
	account.LastSyncTime = &now
	if err := c.store.UpdateAccount(ctx, account); err != nil {
		return errors.E(op, fmt.Errorf("update last sync time: %w", err))
	}

	return nil
}

func (c *coordinator) enqueueAccountSync(ctx context.Context, account *connector.ConnectedAccount, caps []connector.Capability) {
	now := time.Now().UTC()
	for _, cap := range caps {
		if !account.HasCapability(cap) {
			continue
		}
		switch cap {
		case connector.CapabilityContacts:
			_ = connectorv1.EnqueueSyncContactsPayload(ctx, c.scheduler, connectorv1.SyncContactsPayloadJob{
				Payload: &connectorv1.SyncContactsPayload{
					SpaceId:   account.SpaceID,
					AccountId: account.ID,
				},
				RunAt: now,
			})
		case connector.CapabilityCalendar:
			_ = c.scheduler.Enqueue(ctx, scheduler.Job{
				JobType: "connector.sync_calendar",
				RunAt:   now,
				Payload: map[string]string{
					"space_id":   account.SpaceID,
					"account_id": account.ID,
				},
				MaxAttempts: 1,
			})
		case connector.CapabilityMail:
			_ = c.scheduler.Enqueue(ctx, scheduler.Job{
				JobType: "connector.sync_mail",
				RunAt:   now,
				Payload: map[string]string{
					"space_id":   account.SpaceID,
					"account_id": account.ID,
				},
				MaxAttempts: 1,
			})
		}
	}
}
