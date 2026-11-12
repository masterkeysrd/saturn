package google

import (
	"context"
	"encoding/json/v2"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/connector"
	platformerrors "github.com/masterkeysrd/saturn/internal/platform/errors"
)

const (
	// ProviderName is the canonical identifier for Google.
	ProviderName = "google"

	defaultAuthURL     = "https://accounts.google.com/o/oauth2/v2/auth"
	defaultTokenURL    = "https://oauth2.googleapis.com/token"
	defaultRevokeURL   = "https://oauth2.googleapis.com/revoke"
	defaultUserinfoURL = "https://www.googleapis.com/oauth2/v3/userinfo"
	defaultPeopleURL   = "https://people.googleapis.com/v1/people/me/connections"
	defaultOtherURL    = "https://people.googleapis.com/v1/otherContacts"
	defaultCalendarURL = "https://www.googleapis.com/calendar/v3"

	scopeOpenID  = "openid"
	scopeEmail   = "https://www.googleapis.com/auth/userinfo.email"
	scopeProfile = "https://www.googleapis.com/auth/userinfo.profile"

	scopeCalendar = "https://www.googleapis.com/auth/calendar"
	scopeMail     = "https://www.googleapis.com/auth/gmail.modify"
	scopeContacts = "https://www.googleapis.com/auth/contacts.readonly"
	scopeOther    = "https://www.googleapis.com/auth/contacts.other.readonly"
)

// Config configures the Google OAuth2 provider.
type Config struct {
	ClientID     string
	ClientSecret string
	RedirectURI  string

	// Optional overrides for testing against mock HTTP servers
	HTTPClient  *http.Client
	AuthURL     string
	TokenURL    string
	RevokeURL   string
	UserinfoURL string
	PeopleURL   string
	OtherURL    string
	CalendarURL string
}

// Provider implements connector.OAuthProvider for Google.
type Provider struct {
	cfg        Config
	httpClient *http.Client
}

// NewProvider creates a new Google OAuth2 Provider.
func NewProvider(cfg Config) *Provider {
	client := cfg.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	if cfg.AuthURL == "" {
		cfg.AuthURL = defaultAuthURL
	}
	if cfg.TokenURL == "" {
		cfg.TokenURL = defaultTokenURL
	}
	if cfg.RevokeURL == "" {
		cfg.RevokeURL = defaultRevokeURL
	}
	if cfg.UserinfoURL == "" {
		cfg.UserinfoURL = defaultUserinfoURL
	}
	if cfg.PeopleURL == "" {
		cfg.PeopleURL = defaultPeopleURL
	}
	if cfg.OtherURL == "" {
		cfg.OtherURL = defaultOtherURL
	}
	if cfg.CalendarURL == "" {
		cfg.CalendarURL = defaultCalendarURL
	}
	return &Provider{
		cfg:        cfg,
		httpClient: client,
	}
}

// Provider returns the provider name.
func (p *Provider) Provider() string {
	return ProviderName
}

// ScopesForCapabilities maps platform capabilities to Google OAuth2 scopes for this provider instance.
func (p *Provider) ScopesForCapabilities(capabilities []connector.Capability) []string {
	return ScopesForCapabilities(capabilities)
}

// ScopesForCapabilities maps platform capabilities to Google OAuth2 scopes.
func ScopesForCapabilities(capabilities []connector.Capability) []string {
	scopeMap := map[string]struct{}{
		scopeOpenID:  {},
		scopeEmail:   {},
		scopeProfile: {},
	}

	for _, cap := range capabilities {
		switch cap {
		case connector.CapabilityCalendar:
			scopeMap[scopeCalendar] = struct{}{}
		case connector.CapabilityMail:
			scopeMap[scopeMail] = struct{}{}
		case connector.CapabilityContacts:
			scopeMap[scopeContacts] = struct{}{}
			scopeMap[scopeOther] = struct{}{}
		}
	}

	scopes := make([]string, 0, len(scopeMap))
	for s := range scopeMap {
		scopes = append(scopes, s)
	}
	sort.Strings(scopes)
	return scopes
}

// AuthCodeURL constructs the Google OAuth2 authorization URL with PKCE parameters.
func (p *Provider) AuthCodeURL(state string, challenge string, capabilities []connector.Capability, promptConsent bool) string {
	scopes := ScopesForCapabilities(capabilities)
	q := url.Values{}
	q.Set("client_id", p.cfg.ClientID)
	q.Set("redirect_uri", p.cfg.RedirectURI)
	q.Set("response_type", "code")
	q.Set("scope", strings.Join(scopes, " "))
	q.Set("state", state)
	q.Set("code_challenge", challenge)
	q.Set("code_challenge_method", "S256")
	q.Set("access_type", "offline")
	if promptConsent {
		q.Set("prompt", "consent")
	}

	return p.cfg.AuthURL + "?" + q.Encode()
}

type oauthTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
	Scope        string `json:"scope"`
	TokenType    string `json:"token_type"`
	Error        string `json:"error"`
	ErrorDesc    string `json:"error_description"`
}

// Exchange exchanges an authorization code and PKCE verifier for OAuth2 tokens.
func (p *Provider) Exchange(ctx context.Context, code string, verifier string) (*connector.TokenResponse, error) {
	const op platformerrors.Op = "platform/connector/google.Exchange"

	data := url.Values{}
	data.Set("client_id", p.cfg.ClientID)
	data.Set("client_secret", p.cfg.ClientSecret)
	data.Set("code", code)
	data.Set("code_verifier", verifier)
	data.Set("grant_type", "authorization_code")
	data.Set("redirect_uri", p.cfg.RedirectURI)

	return p.doTokenRequest(ctx, op, data)
}

// RefreshToken refreshes an expired access token using the refresh token.
func (p *Provider) RefreshToken(ctx context.Context, refreshToken string) (*connector.TokenResponse, error) {
	const op platformerrors.Op = "platform/connector/google.RefreshToken"

	data := url.Values{}
	data.Set("client_id", p.cfg.ClientID)
	data.Set("client_secret", p.cfg.ClientSecret)
	data.Set("refresh_token", refreshToken)
	data.Set("grant_type", "refresh_token")

	return p.doTokenRequest(ctx, op, data)
}

func (p *Provider) doTokenRequest(ctx context.Context, op platformerrors.Op, form url.Values) (*connector.TokenResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.cfg.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, platformerrors.E(op, fmt.Errorf("read response body: %w", err))
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, platformerrors.E(op, connector.ErrRateLimited)
	}

	var tokenResp oauthTokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, platformerrors.E(op, fmt.Errorf("decode token response: %w", err))
	}

	if resp.StatusCode != http.StatusOK || tokenResp.Error != "" {
		if tokenResp.Error == "invalid_grant" {
			return nil, platformerrors.E(op, connector.ErrInvalidGrant)
		}
		return nil, platformerrors.E(op, fmt.Errorf("oauth error: %s (%s)", tokenResp.Error, tokenResp.ErrorDesc))
	}

	expiresIn := tokenResp.ExpiresIn
	if expiresIn <= 0 {
		expiresIn = 3600
	}

	scopes := strings.Fields(tokenResp.Scope)

	return &connector.TokenResponse{
		AccessToken:   tokenResp.AccessToken,
		RefreshToken:  tokenResp.RefreshToken,
		Expiry:        time.Now().Add(time.Duration(expiresIn) * time.Second),
		GrantedScopes: scopes,
	}, nil
}

// RevokeToken revokes an access or refresh token with Google's revocation endpoint.
func (p *Provider) RevokeToken(ctx context.Context, token string) error {
	const op platformerrors.Op = "platform/connector/google.RevokeToken"

	data := url.Values{}
	data.Set("token", token)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.cfg.RevokeURL, strings.NewReader(data.Encode()))
	if err != nil {
		return platformerrors.E(op, err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return platformerrors.E(op, err)
	}
	defer resp.Body.Close()

	// Google returns 200 OK on successful revocation.
	// 400 with invalid_token or similar may occur if already revoked; we treat 200 or 400 as idempotent ok.
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusBadRequest {
		return platformerrors.E(op, fmt.Errorf("unexpected revocation status code: %d", resp.StatusCode))
	}
	return nil
}

type userinfoResponse struct {
	Sub     string `json:"sub"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

// FetchIdentity queries Google's OpenID Connect userinfo endpoint.
func (p *Provider) FetchIdentity(ctx context.Context, accessToken string) (*connector.Identity, error) {
	const op platformerrors.Op = "platform/connector/google.FetchIdentity"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.cfg.UserinfoURL, nil)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, platformerrors.E(op, connector.ErrInvalidGrant)
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, platformerrors.E(op, connector.ErrRateLimited)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, platformerrors.E(op, fmt.Errorf("userinfo request failed with status: %d", resp.StatusCode))
	}

	var info userinfoResponse
	if err := json.UnmarshalRead(resp.Body, &info); err != nil {
		return nil, platformerrors.E(op, fmt.Errorf("decode userinfo response: %w", err))
	}

	if info.Sub == "" {
		return nil, platformerrors.E(op, errors.New("empty sub in userinfo response"))
	}

	return &connector.Identity{
		ProviderAccountID: info.Sub,
		Email:             info.Email,
		DisplayName:       info.Name,
		AvatarURL:         info.Picture,
	}, nil
}

type peopleConnectionsResponse struct {
	Connections []personRecord `json:"connections"`
}

type otherContactsResponse struct {
	OtherContacts []personRecord `json:"otherContacts"`
}

type personRecord struct {
	ResourceName   string      `json:"resourceName"`
	Names          []nameItem  `json:"names"`
	EmailAddresses []emailItem `json:"emailAddresses"`
	Photos         []photoItem `json:"photos"`
}

type nameItem struct {
	DisplayName string `json:"displayName"`
}

type emailItem struct {
	Value string `json:"value"`
}

type photoItem struct {
	URL string `json:"url"`
}

// FetchContacts aggregates contacts from Google People API (connections and otherContacts).
func (p *Provider) FetchContacts(ctx context.Context, accessToken string) ([]*connector.Contact, error) {
	contactMap := make(map[string]*connector.Contact)

	// 1. Fetch people.connections.list
	reqConns, err := http.NewRequestWithContext(ctx, http.MethodGet, p.cfg.PeopleURL+"?personFields=names,emailAddresses,photos&pageSize=1000", nil)
	if err == nil {
		reqConns.Header.Set("Authorization", "Bearer "+accessToken)
		respConns, err := p.httpClient.Do(reqConns)
		if err == nil {
			defer respConns.Body.Close()
			if respConns.StatusCode == http.StatusOK {
				var res peopleConnectionsResponse
				if err := json.UnmarshalRead(respConns.Body, &res); err == nil {
					for _, item := range res.Connections {
						c := convertPersonRecord(item)
						if c != nil {
							contactMap[c.ProviderContactID] = c
						}
					}
				}
			}
		}
	}

	// 2. Fetch otherContacts.list
	reqOther, err := http.NewRequestWithContext(ctx, http.MethodGet, p.cfg.OtherURL+"?readMask=names,emailAddresses,photos&pageSize=1000", nil)
	if err == nil {
		reqOther.Header.Set("Authorization", "Bearer "+accessToken)
		respOther, err := p.httpClient.Do(reqOther)
		if err == nil {
			defer respOther.Body.Close()
			if respOther.StatusCode == http.StatusOK {
				var res otherContactsResponse
				if err := json.UnmarshalRead(respOther.Body, &res); err == nil {
					for _, item := range res.OtherContacts {
						c := convertPersonRecord(item)
						if c != nil {
							contactMap[c.ProviderContactID] = c
						}
					}
				}
			}
		}
	}

	contacts := make([]*connector.Contact, 0, len(contactMap))
	for _, c := range contactMap {
		contacts = append(contacts, c)
	}

	sort.Slice(contacts, func(i, j int) bool {
		return contacts[i].ProviderContactID < contacts[j].ProviderContactID
	})

	return contacts, nil
}

func convertPersonRecord(item personRecord) *connector.Contact {
	if item.ResourceName == "" {
		return nil
	}

	var displayName, email, avatarURL string
	if len(item.Names) > 0 {
		displayName = item.Names[0].DisplayName
	}
	if len(item.EmailAddresses) > 0 {
		email = item.EmailAddresses[0].Value
	}
	if len(item.Photos) > 0 {
		avatarURL = item.Photos[0].URL
	}

	// Only record contacts with at least an email or a name
	if email == "" && displayName == "" {
		return nil
	}

	return &connector.Contact{
		ProviderContactID: item.ResourceName,
		Email:             email,
		DisplayName:       displayName,
		AvatarURL:         avatarURL,
	}
}
