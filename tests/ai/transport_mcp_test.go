//go:build integration

package ai_test

import (
	"context"
	"encoding/json/v2"
	"strings"
	"testing"

	loommcp "github.com/masterkeysrd/loom/mcp"
	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
	"github.com/masterkeysrd/saturn/tests/driver"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

func TestMCPTransport_StandaloneConformance(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().CreateApprovedUser(t).Login(t)
	userToken := d.State().AccessToken

	d.Space().Ensure(t, "MCP Space A")
	spaceA := d.State().SpaceID

	spaceBObj, err := d.Space().CreateSpace(t, "MCP Space B", "Second space")
	require.NoError(t, err)
	spaceB := spaceBObj.GetId()

	// Seed a financial account in Space A without configuring any AI provider/model.
	d.Finance().InitSettings(t, "USD").CreateAccount(t, driver.AccountOptions{
		Name:           "Standalone Checking",
		Type:           financev1.Account_BANK,
		Currency:       "USD",
		InitialBalance: 125000,
	})

	conn, err := grpc.NewClient("unix:"+d.Env().SocketPath,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(t, err)
	defer func() { _ = conn.Close() }()

	identClient := identityv1.NewIdentityClient(conn)
	authCtx := metadata.NewOutgoingContext(context.Background(), metadata.New(map[string]string{
		"authorization": "Bearer " + userToken,
	}))

	t.Run("Single-space API key works on /mcp without AI providers and enforces scopes", func(t *testing.T) {
		keyResp, err := identClient.CreateAPIKey(authCtx, &identityv1.CreateAPIKeyRequest{
			ApiKey: &identityv1.APIKey{
				Name:     "MCP Read + AI Exec Key",
				Scopes:   []string{"finance:read", "ai:execute"},
				SpaceIds: []string{spaceA},
			},
		})
		require.NoError(t, err)
		rawKey := keyResp.GetRawKey()

		client := loommcp.NewClient(loommcp.Config{
			Transport: "http",
			URL:       d.Env().ServerURL + "/mcp",
			Headers: map[string]string{
				"Authorization": "Bearer " + rawKey,
			},
		})
		defer func() { _ = client.Close() }()

		tools, err := client.Tools(t.Context())
		require.NoError(t, err)

		var toolNames []string
		for _, tl := range tools {
			toolNames = append(toolNames, tl.Definition.Name)
		}
		assert.Contains(t, toolNames, "finance_list_accounts")
		assert.Contains(t, toolNames, "agent__saturn-assistant")
		assert.NotContains(t, toolNames, "finance_create_transaction")

		stream, err := client.CallTool(t.Context(), "finance_list_accounts", map[string]any{})
		require.NoError(t, err)

		var sawChecking bool
		for chunk, chunkErr := range stream {
			require.NoError(t, chunkErr)
			require.False(t, chunk.IsError, "unexpected tool error: %+v", chunk)
			raw, mErr := json.Marshal(chunk)
			require.NoError(t, mErr)
			if strings.Contains(string(raw), "Standalone Checking") {
				sawChecking = true
			}
		}
		assert.True(t, sawChecking, "expected finance_list_accounts to return Standalone Checking")

		// Calling a write tool without finance:write scope must fail.
		writeStream, writeErr := client.CallTool(t.Context(), "finance_create_transaction", map[string]any{
			"type":         "INCOME",
			"amount_cents": 1000,
			"currency":     "USD",
			"description":  "Should be denied",
		})
		if writeErr == nil {
			var toolFailed bool
			for chunk, chunkErr := range writeStream {
				if chunkErr != nil || chunk.IsError {
					toolFailed = true
					break
				}
			}
			assert.True(t, toolFailed, "expected finance_create_transaction to be rejected without finance:write scope")
		}
	})

	t.Run("Multi-space API key requires space scoping via /spaces/{space_id}/mcp", func(t *testing.T) {
		keyResp, err := identClient.CreateAPIKey(authCtx, &identityv1.CreateAPIKeyRequest{
			ApiKey: &identityv1.APIKey{
				Name:     "Multi Space MCP Key",
				Scopes:   []string{"finance:read", "finance:write", "ai:execute"},
				SpaceIds: []string{spaceA, spaceB},
			},
		})
		require.NoError(t, err)
		rawKey := keyResp.GetRawKey()

		// Bare /mcp without Space-Id must fail for multi-space keys.
		bareClient := loommcp.NewClient(loommcp.Config{
			Transport: "http",
			URL:       d.Env().ServerURL + "/mcp",
			Headers: map[string]string{
				"Authorization": "Bearer " + rawKey,
			},
		})
		defer func() { _ = bareClient.Close() }()

		_, err = bareClient.Tools(t.Context())
		require.Error(t, err)

		// Path-scoped /spaces/{space_id}/mcp resolves Space A cleanly.
		scopedClient := loommcp.NewClient(loommcp.Config{
			Transport: "http",
			URL:       d.Env().ServerURL + "/spaces/" + spaceA + "/mcp",
			Headers: map[string]string{
				"Authorization": "Bearer " + rawKey,
			},
		})
		defer func() { _ = scopedClient.Close() }()

		tools, err := scopedClient.Tools(t.Context())
		require.NoError(t, err)
		var toolNames []string
		for _, tl := range tools {
			toolNames = append(toolNames, tl.Definition.Name)
		}
		assert.Contains(t, toolNames, "finance_list_accounts")
		assert.Contains(t, toolNames, "finance_create_transaction")
	})
}
