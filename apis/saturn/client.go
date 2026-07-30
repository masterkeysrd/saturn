package saturn

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

// Config holds shared configuration for Saturn HTTP SDK clients.
type Config struct {
	BaseURL     string
	AccessToken string
	SpaceID     string
	HTTPClient  *http.Client
}

// Client is the base HTTP requester used by domain SDK clients.
type Client struct {
	cfg Config
}

// NewClient initializes a base HTTP client with sensible defaults.
func NewClient(cfg Config) *Client {
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &Client{cfg: cfg}
}

var protoMarshaler = protojson.MarshalOptions{
	EmitUnpopulated: false,
	UseProtoNames:   false, // camelCase for gRPC-Gateway
}

var protoUnmarshaler = protojson.UnmarshalOptions{
	DiscardUnknown: true,
}

// Do executes an HTTP request against the Saturn server using the base configuration.
func (c *Client) Do(ctx context.Context, method, path string, payload any, target any) error {
	var bodyReader io.Reader
	if payload != nil {
		var data []byte
		var err error
		if msg, ok := payload.(proto.Message); ok {
			data, err = protoMarshaler.Marshal(msg)
		} else {
			data, err = json.Marshal(payload)
		}
		if err != nil {
			return fmt.Errorf("marshal request payload for %s %s: %w", method, path, err)
		}
		bodyReader = bytes.NewReader(data)
	}

	url := c.cfg.BaseURL + path
	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return fmt.Errorf("construct request %s %s: %w", method, path, err)
	}

	req.Header.Set("Content-Type", "application/json")
	if c.cfg.AccessToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.cfg.AccessToken)
	}
	if c.cfg.SpaceID != "" {
		req.Header.Set("Space-Id", c.cfg.SpaceID)
	}

	resp, err := c.cfg.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("execute HTTP %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("HTTP %s %s returned status %d: %s", method, path, resp.StatusCode, string(respBody))
	}

	if target != nil && len(respBody) > 0 {
		if msg, ok := target.(proto.Message); ok {
			if err := protoUnmarshaler.Unmarshal(respBody, msg); err != nil {
				return fmt.Errorf("protojson unmarshal response for %s %s: %w (body: %s)", method, path, err, string(respBody))
			}
		} else {
			if err := json.Unmarshal(respBody, target); err != nil {
				return fmt.Errorf("unmarshal response for %s %s: %w (body: %s)", method, path, err, string(respBody))
			}
		}
	}
	return nil
}
