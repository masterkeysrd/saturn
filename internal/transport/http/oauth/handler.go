package oauth

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

import (
	"context"
	"encoding/base64"
	"encoding/json/v2"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/masterkeysrd/saturn/internal/application/iam"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

const maxOAuthBodyBytes = 64 * 1024

// Coordinator defines the OAuth 2.1 application operations required by the HTTP handler.
// @Mock
type Coordinator interface {
	RegisterDynamicOAuthClient(ctx context.Context, req *iam.RegisterDynamicOAuthClientRequest) (*identity.OAuthClient, error)
	ConsumeOAuthRedirectHandoff(ctx context.Context, req *iam.ConsumeOAuthRedirectHandoffRequest) (*iam.ConsumeOAuthRedirectHandoffResponse, error)
	ExchangeOAuthToken(ctx context.Context, req *iam.ExchangeOAuthTokenRequest) (*iam.ExchangeOAuthTokenResponse, error)
	RevokeOAuthToken(ctx context.Context, req *iam.RevokeOAuthTokenRequest) error
}

// Config configures the HTTP OAuth 2.1 protocol handler.
type Config struct {
	Coordinator              Coordinator
	IssuerURL                string
	AllowDynamicRegistration bool
}

// Handler serves RFC 9728, RFC 8414, RFC 7591, OAuth 2.1 callback/token, and RFC 7009 endpoints.
type Handler struct {
	coordinator              Coordinator
	issuerURL                string
	allowDynamicRegistration bool
}

// NewHandler creates a new OAuth HTTP Handler.
func NewHandler(cfg Config) *Handler {
	return &Handler{
		coordinator:              cfg.Coordinator,
		issuerURL:                strings.TrimRight(strings.TrimSpace(cfg.IssuerURL), "/"),
		allowDynamicRegistration: cfg.AllowDynamicRegistration,
	}
}

// RegisterRoutes mounts all OAuth 2.1 discovery, registration, callback, token, and revocation routes onto mux.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/.well-known/oauth-protected-resource", h.withCORS(h.ServeProtectedResourceMetadata))
	mux.HandleFunc("/.well-known/oauth-protected-resource/{path...}", h.withCORS(h.ServeProtectedResourceMetadata))
	mux.HandleFunc("/.well-known/oauth-authorization-server", h.withCORS(h.ServeAuthorizationServerMetadata))
	mux.HandleFunc("/.well-known/oauth-authorization-server/{path...}", h.withCORS(h.ServeAuthorizationServerMetadata))
	mux.HandleFunc("/.well-known/openid-configuration", h.withCORS(h.ServeAuthorizationServerMetadata))
	mux.HandleFunc("/.well-known/openid-configuration/{path...}", h.withCORS(h.ServeAuthorizationServerMetadata))

	mux.HandleFunc("/oauth/register", h.withCORS(h.ServeRegister))
	mux.HandleFunc("/spaces/{space_id}/oauth/register", h.withCORS(h.ServeRegister))
	mux.HandleFunc("/oauth/authorize/callback", h.ServeAuthorizeCallback)
	mux.HandleFunc("/oauth/token", h.withCORS(h.ServeToken))
	mux.HandleFunc("/oauth/revoke", h.withCORS(h.ServeRevoke))
}

func (h *Handler) withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

type protectedResourceMetadata struct {
	Resource               string   `json:"resource"`
	AuthorizationServers   []string `json:"authorization_servers"`
	BearerMethodsSupported []string `json:"bearer_methods_supported"`
	ScopesSupported        []string `json:"scopes_supported"`
	ResourceDocumentation  string   `json:"resource_documentation,omitempty"`
}

// ServeProtectedResourceMetadata serves RFC 9728 Protected Resource Metadata.
func (h *Handler) ServeProtectedResourceMetadata(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeOAuthError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
		return
	}

	baseURL := h.resolveBaseURL(r)
	suffix := strings.TrimPrefix(r.URL.Path, "/.well-known/oauth-protected-resource")
	if suffix != "" && !strings.HasPrefix(suffix, "/") {
		suffix = "/" + suffix
	}

	resourceURL := baseURL + suffix
	authServer := baseURL
	if spaceID := extractSpaceIDFromPath(suffix); spaceID != "" {
		authServer = baseURL + "/spaces/" + spaceID
	}

	payload := protectedResourceMetadata{
		Resource:               resourceURL,
		AuthorizationServers:   []string{authServer},
		BearerMethodsSupported: []string{"header"},
		ScopesSupported:        identity.AllAPIKeyScopeStrings(),
		ResourceDocumentation:  baseURL,
	}
	writeJSON(w, http.StatusOK, payload)
}

type authorizationServerMetadata struct {
	Issuer                                    string   `json:"issuer"`
	AuthorizationEndpoint                     string   `json:"authorization_endpoint"`
	TokenEndpoint                             string   `json:"token_endpoint"`
	RevocationEndpoint                        string   `json:"revocation_endpoint"`
	RegistrationEndpoint                      string   `json:"registration_endpoint,omitempty"`
	ScopesSupported                           []string `json:"scopes_supported"`
	ResponseTypesSupported                    []string `json:"response_types_supported"`
	ResponseModesSupported                    []string `json:"response_modes_supported"`
	GrantTypesSupported                       []string `json:"grant_types_supported"`
	TokenEndpointAuthMethodsSupported         []string `json:"token_endpoint_auth_methods_supported"`
	RevocationEndpointAuthMethodsSupported    []string `json:"revocation_endpoint_auth_methods_supported"`
	CodeChallengeMethodsSupported             []string `json:"code_challenge_methods_supported"`
	ClientIDMetadataDocumentSupported         bool     `json:"client_id_metadata_document_supported"`
}

// ServeAuthorizationServerMetadata serves RFC 8414 Authorization Server Metadata (and OIDC discovery alias).
func (h *Handler) ServeAuthorizationServerMetadata(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeOAuthError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
		return
	}

	baseURL := h.resolveBaseURL(r)
	suffix := r.URL.Path
	switch {
	case strings.HasPrefix(suffix, "/.well-known/oauth-authorization-server"):
		suffix = strings.TrimPrefix(suffix, "/.well-known/oauth-authorization-server")
	case strings.HasPrefix(suffix, "/.well-known/openid-configuration"):
		suffix = strings.TrimPrefix(suffix, "/.well-known/openid-configuration")
	default:
		suffix = ""
	}

	issuer := baseURL
	regEndpoint := ""
	spaceID := extractSpaceIDFromPath(suffix)
	if spaceID != "" {
		issuer = baseURL + "/spaces/" + spaceID
	}
	if h.allowDynamicRegistration {
		if spaceID != "" {
			regEndpoint = baseURL + "/spaces/" + spaceID + "/oauth/register"
		} else {
			regEndpoint = baseURL + "/oauth/register"
		}
	}

	payload := authorizationServerMetadata{
		Issuer:                                 issuer,
		AuthorizationEndpoint:                  baseURL + "/oauth/authorize",
		TokenEndpoint:                          baseURL + "/oauth/token",
		RevocationEndpoint:                     baseURL + "/oauth/revoke",
		RegistrationEndpoint:                   regEndpoint,
		ScopesSupported:                        identity.AllAPIKeyScopeStrings(),
		ResponseTypesSupported:                 []string{"code"},
		ResponseModesSupported:                 []string{"query"},
		GrantTypesSupported:                    []string{"authorization_code", "refresh_token"},
		TokenEndpointAuthMethodsSupported:      []string{"client_secret_basic", "client_secret_post", "none"},
		RevocationEndpointAuthMethodsSupported: []string{"client_secret_basic", "client_secret_post", "none"},
		CodeChallengeMethodsSupported:          []string{"S256"},
		ClientIDMetadataDocumentSupported:      h.allowDynamicRegistration,
	}
	writeJSON(w, http.StatusOK, payload)
}

type dcrRequest struct {
	ClientName              string   `json:"client_name"`
	RedirectURIs            []string `json:"redirect_uris"`
	TokenEndpointAuthMethod string   `json:"token_endpoint_auth_method"`
	Scope                   string   `json:"scope"`
}

type dcrResponse struct {
	ClientID                string   `json:"client_id"`
	ClientSecret            string   `json:"client_secret,omitempty"`
	ClientIDIssuedAt        int64    `json:"client_id_issued_at"`
	ClientSecretExpiresAt   *int64   `json:"client_secret_expires_at,omitempty"`
	ClientName              string   `json:"client_name"`
	RedirectURIs            []string `json:"redirect_uris"`
	TokenEndpointAuthMethod string   `json:"token_endpoint_auth_method"`
	GrantTypes              []string `json:"grant_types"`
	ResponseTypes           []string `json:"response_types"`
	Scope                   string   `json:"scope"`
}

// ServeRegister handles RFC 7591 Dynamic Client Registration (`/oauth/register` and `/spaces/{space_id}/oauth/register`).
func (h *Handler) ServeRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeOAuthError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxOAuthBodyBytes)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeOAuthError(w, http.StatusBadRequest, "invalid_request", "failed to read request body")
		return
	}

	var req dcrRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeOAuthError(w, http.StatusBadRequest, "invalid_client_metadata", "invalid JSON registration payload")
		return
	}

	var spaceIDPtr *string
	if spaceID := extractRegisterSpaceID(r); spaceID != "" {
		spaceIDPtr = new(spaceID)
	}

	client, err := h.coordinator.RegisterDynamicOAuthClient(r.Context(), &iam.RegisterDynamicOAuthClientRequest{
		SpaceID:                 spaceIDPtr,
		Name:                    req.ClientName,
		RedirectURIs:            req.RedirectURIs,
		TokenEndpointAuthMethod: req.TokenEndpointAuthMethod,
		Scope:                   req.Scope,
	})
	if err != nil {
		writeMappedOAuthError(w, err, false)
		return
	}

	resp := dcrResponse{
		ClientID:                string(client.ID),
		ClientSecret:            client.RawSecret,
		ClientIDIssuedAt:        client.CreateTime.Unix(),
		ClientName:              client.Name,
		RedirectURIs:            client.RedirectURIs,
		TokenEndpointAuthMethod: string(client.TokenEndpointAuthMethod),
		GrantTypes:              []string{"authorization_code", "refresh_token"},
		ResponseTypes:           []string{"code"},
		Scope:                   strings.Join(client.AllowedScopes, " "),
	}
	if client.RawSecret != "" {
		resp.ClientSecretExpiresAt = new(int64(0))
	}

	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	writeJSON(w, http.StatusCreated, resp)
}

// ServeAuthorizeCallback consumes a short-lived handoff nonce and responds with HTTP 302 Found to the client redirect_uri.
func (h *Handler) ServeAuthorizeCallback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeOAuthError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
		return
	}

	handoff := strings.TrimSpace(r.URL.Query().Get("handoff"))
	if handoff == "" {
		writeOAuthError(w, http.StatusBadRequest, "invalid_request", "missing handoff parameter")
		return
	}

	res, err := h.coordinator.ConsumeOAuthRedirectHandoff(r.Context(), &iam.ConsumeOAuthRedirectHandoffRequest{
		HandoffToken: handoff,
	})
	if err != nil {
		writeMappedOAuthError(w, err, false)
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	http.Redirect(w, r, res.RedirectURL, http.StatusFound)
}

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int64  `json:"expires_in"`
	RefreshToken string `json:"refresh_token,omitempty"`
	Scope        string `json:"scope,omitempty"`
}

// ServeToken handles OAuth 2.1 `/oauth/token` exchanges (`authorization_code` and `refresh_token`).
func (h *Handler) ServeToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeOAuthError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")

	r.Body = http.MaxBytesReader(w, r.Body, maxOAuthBodyBytes)
	if err := r.ParseForm(); err != nil {
		writeOAuthError(w, http.StatusBadRequest, "invalid_request", "invalid form body")
		return
	}

	clientID, clientSecret, authMethodUsed, usedBasic, err := extractClientCredentials(r)
	if err != nil {
		writeOAuthError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if clientID == "" {
		writeOAuthError(w, http.StatusUnauthorized, "invalid_client", "client_id is required")
		return
	}

	res, err := h.coordinator.ExchangeOAuthToken(r.Context(), &iam.ExchangeOAuthTokenRequest{
		GrantType:      strings.TrimSpace(r.Form.Get("grant_type")),
		ClientID:       clientID,
		ClientSecret:   clientSecret,
		AuthMethodUsed: authMethodUsed,
		Code:           strings.TrimSpace(r.Form.Get("code")),
		RedirectURI:    strings.TrimSpace(r.Form.Get("redirect_uri")),
		CodeVerifier:   strings.TrimSpace(r.Form.Get("code_verifier")),
		RefreshToken:   strings.TrimSpace(r.Form.Get("refresh_token")),
		Resource:       strings.TrimSpace(r.Form.Get("resource")),
		IPAddress:      r.RemoteAddr,
		UserAgent:      r.UserAgent(),
	})
	if err != nil {
		writeMappedOAuthError(w, err, usedBasic)
		return
	}

	writeJSON(w, http.StatusOK, tokenResponse{
		AccessToken:  res.AccessToken,
		TokenType:    res.TokenType,
		ExpiresIn:    res.ExpiresIn,
		RefreshToken: res.RefreshToken,
		Scope:        res.Scope,
	})
}

// ServeRevoke handles RFC 7009 `/oauth/revoke`.
func (h *Handler) ServeRevoke(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeOAuthError(w, http.StatusMethodNotAllowed, "invalid_request", "method not allowed")
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")

	r.Body = http.MaxBytesReader(w, r.Body, maxOAuthBodyBytes)
	if err := r.ParseForm(); err != nil {
		writeOAuthError(w, http.StatusBadRequest, "invalid_request", "invalid form body")
		return
	}

	clientID, clientSecret, authMethodUsed, usedBasic, err := extractClientCredentials(r)
	if err != nil {
		writeOAuthError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}

	tokenStr := strings.TrimSpace(r.Form.Get("token"))
	if tokenStr == "" {
		writeOAuthError(w, http.StatusBadRequest, "invalid_request", "token parameter is required")
		return
	}

	if err := h.coordinator.RevokeOAuthToken(r.Context(), &iam.RevokeOAuthTokenRequest{
		Token:          tokenStr,
		ClientID:       clientID,
		ClientSecret:   clientSecret,
		AuthMethodUsed: authMethodUsed,
	}); err != nil {
		writeMappedOAuthError(w, err, usedBasic)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *Handler) resolveBaseURL(r *http.Request) string {
	if h.issuerURL != "" {
		return h.issuerURL
	}
	return ResolveRequestBaseURL(r)
}

// ResolveRequestBaseURL derives the public scheme://host base URL from the incoming HTTP request.
func ResolveRequestBaseURL(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if xfProto := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto"))); xfProto == "https" || xfProto == "http" {
		scheme = xfProto
	}

	host := strings.TrimSpace(r.Header.Get("X-Forwarded-Host"))
	if host == "" {
		host = strings.TrimSpace(r.Host)
	}
	if first, _, ok := strings.Cut(host, ","); ok {
		host = strings.TrimSpace(first)
	}
	if host == "" {
		host = "localhost:8080"
	}

	return scheme + "://" + host
}

func extractSpaceIDFromPath(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i := range len(parts) - 1 {
		if parts[i] == "spaces" && parts[i+1] != "" {
			return parts[i+1]
		}
	}
	return ""
}

func extractRegisterSpaceID(r *http.Request) string {
	if v := strings.TrimSpace(r.PathValue("space_id")); v != "" {
		return v
	}
	return extractSpaceIDFromPath(r.URL.Path)
}

func extractClientCredentials(r *http.Request) (clientID, clientSecret, authMethodUsed string, usedBasic bool, err error) {
	formClientID := strings.TrimSpace(r.Form.Get("client_id"))
	formClientSecret := r.Form.Get("client_secret")

	authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	if encoded, ok := strings.CutPrefix(authHeader, "Basic "); ok {
		decoded, decErr := base64.StdEncoding.DecodeString(strings.TrimSpace(encoded))
		if decErr != nil {
			return "", "", "", true, errors.New("malformed basic authorization header")
		}
		rawID, rawSecret, sepOK := strings.Cut(string(decoded), ":")
		if !sepOK {
			return "", "", "", true, errors.New("malformed basic authorization credentials")
		}
		unescID, idErr := url.QueryUnescape(rawID)
		if idErr == nil {
			rawID = unescID
		}
		unescSec, secErr := url.QueryUnescape(rawSecret)
		if secErr == nil {
			rawSecret = unescSec
		}
		if formClientID != "" && formClientID != rawID {
			return "", "", "", true, errors.New("client_id mismatch between Authorization header and form body")
		}
		if formClientSecret != "" {
			return "", "", "", true, errors.New("multiple client authentication methods provided")
		}
		return strings.TrimSpace(rawID), rawSecret, string(identity.TokenAuthMethodClientSecretBasic), true, nil
	}

	if formClientSecret != "" {
		return formClientID, formClientSecret, string(identity.TokenAuthMethodClientSecretPost), false, nil
	}
	return formClientID, "", string(identity.TokenAuthMethodNone), false, nil
}

type oauthErrorResponse struct {
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description,omitempty"`
}

func writeMappedOAuthError(w http.ResponseWriter, err error, usedBasic bool) {
	code := errors.CodeOf(err)
	desc := errors.UserMessage(err)

	switch code {
	case identity.OAuthInvalidClient, identity.InvalidOAuthClientID:
		if usedBasic {
			w.Header().Set("WWW-Authenticate", `Basic realm="saturn-oauth"`)
		}
		writeOAuthError(w, http.StatusUnauthorized, "invalid_client", desc)
	case identity.OAuthUnsupportedGrantType:
		writeOAuthError(w, http.StatusBadRequest, "unsupported_grant_type", desc)
	case identity.OAuthInvalidScope:
		writeOAuthError(w, http.StatusBadRequest, "invalid_scope", desc)
	case identity.OAuthInvalidTarget:
		writeOAuthError(w, http.StatusBadRequest, "invalid_target", desc)
	case identity.OAuthInvalidRedirectURI:
		writeOAuthError(w, http.StatusBadRequest, "invalid_redirect_uri", desc)
	case identity.OAuthInvalidGrant, identity.OAuthGrantRevoked:
		writeOAuthError(w, http.StatusBadRequest, "invalid_grant", desc)
	case identity.OAuthAccessDenied:
		writeOAuthError(w, http.StatusForbidden, "access_denied", desc)
	case identity.OAuthRegistrationDisabled:
		writeOAuthError(w, http.StatusForbidden, "access_denied", desc)
	case identity.OAuthSSRFBlocked:
		writeOAuthError(w, http.StatusBadRequest, "invalid_client_metadata", desc)
	default:
		switch errors.KindOf(err) {
		case errors.Unauthenticated:
			writeOAuthError(w, http.StatusUnauthorized, "invalid_client", desc)
		case errors.Permission:
			writeOAuthError(w, http.StatusForbidden, "access_denied", desc)
		case errors.NotExist:
			writeOAuthError(w, http.StatusNotFound, "invalid_request", desc)
		default:
			writeOAuthError(w, http.StatusBadRequest, "invalid_request", desc)
		}
	}
}

func writeOAuthError(w http.ResponseWriter, status int, errCode, desc string) {
	writeJSON(w, status, oauthErrorResponse{
		Error:            errCode,
		ErrorDescription: desc,
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.MarshalWrite(w, payload)
}
