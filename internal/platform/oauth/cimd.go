package oauth

import (
	"context"
	"encoding/json/v2"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

const maxCIMDMetadataBytes = 64 * 1024

// CIMDMetadata represents the JSON payload of an IETF Client ID Metadata Document.
type CIMDMetadata struct {
	ClientID                string   `json:"client_id"`
	ClientName              string   `json:"client_name"`
	ClientURI               string   `json:"client_uri"`
	RedirectURIs            []string `json:"redirect_uris"`
	TokenEndpointAuthMethod string   `json:"token_endpoint_auth_method"`
	Scope                   string   `json:"scope"`
	GrantTypes              []string `json:"grant_types"`
	ResponseTypes           []string `json:"response_types"`
}

// CIMDFetchResult represents the result of fetching or revalidating a CIMD document.
type CIMDFetchResult struct {
	Metadata    *CIMDMetadata
	ETag        string
	NotModified bool
}

// CIMDClient fetches and validates HTTPS Client ID Metadata Documents with SSRF protections.
type CIMDClient struct {
	httpClient *http.Client
	policy     ai.OutboundURLPolicy
}

// NewCIMDClient creates a new SSRF-safe CIMDClient.
// If httpClient is nil, a default SSRF-safe HTTP client with a 5s timeout is constructed.
func NewCIMDClient(allowPrivateNetworks bool, customHTTPClient *http.Client) *CIMDClient {
	policy := ai.OutboundURLPolicy{
		Label:                "CIMD client_id URL",
		AllowPrivateNetworks: allowPrivateNetworks,
		InvalidURLErr:        errors.E(errors.Invalid, identity.InvalidOAuthClientID, "invalid CIMD client_id URL"),
		SSRFBlockedErr:       errors.E(errors.Permission, identity.OAuthSSRFBlocked, "CIMD URL blocked by SSRF policy"),
	}
	client := customHTTPClient
	if client == nil {
		client = ai.NewSSRFSafeHTTPClient(policy, 5*time.Second)
		origCheckRedirect := client.CheckRedirect
		client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
			if !strings.EqualFold(req.URL.Scheme, "https") {
				return errors.E(errors.Invalid, identity.InvalidOAuthClientID, "CIMD redirects must use https")
			}
			if origCheckRedirect != nil {
				return origCheckRedirect(req, via)
			}
			return nil
		}
	}
	return &CIMDClient{
		httpClient: client,
		policy:     policy,
	}
}

// FetchMetadata resolves and validates an HTTPS Client ID Metadata Document.
func (c *CIMDClient) FetchMetadata(ctx context.Context, clientIDURL string, ifNoneMatch string) (*CIMDFetchResult, error) {
	const op errors.Op = "platform/oauth.FetchMetadata"

	u, err := url.Parse(strings.TrimSpace(clientIDURL))
	if err != nil || !strings.EqualFold(u.Scheme, "https") || u.Hostname() == "" || u.User != nil || u.Fragment != "" {
		return nil, errors.E(op, errors.Invalid, identity.InvalidOAuthClientID, "CIMD client_id must be a valid https URL")
	}

	if err := ai.ValidateOutboundURL(clientIDURL, c.policy); err != nil {
		return nil, errors.E(op, err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, clientIDURL, nil)
	if err != nil {
		return nil, errors.E(op, errors.Invalid, identity.InvalidOAuthClientID, err)
	}
	req.Header.Set("Accept", "application/json")
	if strings.TrimSpace(ifNoneMatch) != "" {
		req.Header.Set("If-None-Match", strings.TrimSpace(ifNoneMatch))
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		if errors.CodeOf(err) == identity.OAuthSSRFBlocked {
			return nil, errors.E(op, err)
		}
		return nil, errors.E(op, errors.Unavailable, identity.OAuthInvalidClient, fmt.Sprintf("fetch CIMD metadata: %v", err))
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusNotModified {
		return &CIMDFetchResult{
			NotModified: true,
			ETag:        ifNoneMatch,
		}, nil
	}

	if resp.StatusCode != http.StatusOK {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidClient, fmt.Sprintf("CIMD endpoint returned status %d", resp.StatusCode))
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxCIMDMetadataBytes+1))
	if err != nil {
		return nil, errors.E(op, errors.Unavailable, identity.OAuthInvalidClient, "read CIMD metadata response failed")
	}
	if len(body) > maxCIMDMetadataBytes {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidClient, "CIMD metadata document exceeds maximum size")
	}

	var meta CIMDMetadata
	if err := json.Unmarshal(body, &meta); err != nil {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidClient, "invalid CIMD JSON document")
	}

	if meta.ClientID != clientIDURL {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidClient, "CIMD client_id in document does not match URL")
	}
	if meta.TokenEndpointAuthMethod != "" && meta.TokenEndpointAuthMethod != string(identity.TokenAuthMethodNone) {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidClient, "CIMD clients must use token_endpoint_auth_method 'none'")
	}
	if len(meta.RedirectURIs) == 0 {
		return nil, errors.E(op, errors.Invalid, identity.OAuthInvalidRedirectURI, "CIMD metadata must specify at least one redirect_uri")
	}
	if strings.TrimSpace(meta.ClientName) == "" {
		meta.ClientName = u.Hostname()
	}

	return &CIMDFetchResult{
		Metadata: &meta,
		ETag:     strings.TrimSpace(resp.Header.Get("ETag")),
	}, nil
}
