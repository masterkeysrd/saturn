//go:build integration

package ai_test

import (
	"context"
	"encoding/json/v2"
	"strings"
	"testing"
	"time"

	loommcp "github.com/masterkeysrd/loom/mcp"
	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
	aiv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/ai/v1"
	workflowv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/workflow/v1"
	"github.com/masterkeysrd/saturn/internal/platform/ai"
	"github.com/masterkeysrd/saturn/tests/driver"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/types/known/structpb"
)

func TestAI_ExternalMCP_HeadlessAgent_And_Workflow(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().CreateApprovedUser(t).Login(t)
	userToken := d.State().AccessToken

	d.Space().Ensure(t, "AI Runtime Space")
	spaceID := d.State().SpaceID

	mockLLM := driver.StartMockLLMServer(t, "Done.")
	_, model := d.AI().SetupMockOpenAIProvider(t, "Runtime Mock OpenAI", mockLLM.URL, "gpt-4o")

	mockExtMCP := driver.StartMockMCPServer(t, "ext-secret-tok")

	// Register external HTTP MCP server with bearer auth.
	mcpSrv, err := d.AI().Client().CreateMCPServer(t.Context(), &aiv1.CreateMCPServerRequest{
		McpServer: &aiv1.MCPServer{
			Slug:        "weather-mcp",
			Name:        "Weather Service",
			Description: "External weather MCP server",
			IsEnabled:   true,
			Config: &aiv1.MCPServerConfig{
				Url:            mockExtMCP.URL,
				AuthType:       "bearer",
				TrustReadHints: true,
				TimeoutSeconds: 10,
			},
			AuthSecret: &aiv1.MCPAuthSecretInput{
				BearerToken: new("ext-secret-tok"),
			},
		},
	})
	require.NoError(t, err)
	assert.True(t, mcpSrv.GetHasAuthSecret())
	assert.Nil(t, mcpSrv.GetAuthSecret())

	testedMCP, err := d.AI().Client().TestMCPServer(t.Context(), &aiv1.TestMCPServerRequest{Id: mcpSrv.GetId()})
	require.NoError(t, err)
	require.NotNil(t, testedMCP.GetDiscovery())
	assert.Equal(t, "healthy", testedMCP.GetDiscovery().GetHealthStatus())

	syncedMCP, err := d.AI().Client().SyncMCPServer(t.Context(), &aiv1.SyncMCPServerRequest{Id: mcpSrv.GetId()})
	require.NoError(t, err)
	var extTools []string
	for _, tl := range syncedMCP.GetDiscovery().GetTools() {
		extTools = append(extTools, tl.GetName())
	}
	assert.Contains(t, extTools, "ext_lookup_weather")
	assert.Contains(t, extTools, "ext_deploy_release")

	// Create custom agent bound to the external MCP server's weather tool.
	agent, err := d.AI().Client().CreateAgent(t.Context(), &aiv1.CreateAgentRequest{
		Agent: &aiv1.Agent{
			Slug:        "weather-helper",
			Name:        "Weather Helper",
			Description: "Looks up weather using external MCP.",
			ModelId:     new(model.GetId()),
			IsEnabled:   true,
			Config: &aiv1.AgentConfig{
				SystemInstruction: new("Use weather tools when asked."),
				Execution: &aiv1.ExecutionConfig{
					ApprovalPolicy: "auto",
					MaxSteps:       5,
				},
				McpBindings: []*aiv1.MCPBinding{{
					McpServerId:  mcpSrv.GetId(),
					AllowedTools: []string{"ext_lookup_weather"},
				}},
			},
		},
	})
	require.NoError(t, err)

	namespacedTool := ai.NamespaceMCPToolName("weather-mcp", "ext_lookup_weather")

	mockLLM.SetTurnFunc(func(body map[string]any) driver.MockLLMTurn {
		// Check if structured output JSON schema is requested (Generate test).
		if rf, ok := body["response_format"].(map[string]any); ok && rf["type"] == "json_schema" {
			return driver.MockLLMTurn{Text: `{"summary":"Sunny 24C"}`}
		}

		msgs, _ := body["messages"].([]any)
		for _, raw := range msgs {
			m, _ := raw.(map[string]any)
			if m["role"] == "tool" && m["tool_call_id"] == "call_weather" {
				return driver.MockLLMTurn{Text: "Tokyo is Sunny at 24C."}
			}
		}
		return driver.MockLLMTurn{
			ToolCalls: []driver.MockToolCall{{
				ID:        "call_weather",
				Name:      namespacedTool,
				Arguments: `{"city":"Tokyo"}`,
			}},
		}
	})

	t.Run("ExecuteAgent invokes external HTTP MCP tool and records run steps", func(t *testing.T) {
		run, err := d.AI().Client().ExecuteAgent(t.Context(), &aiv1.ExecuteAgentRequest{
			Id:     agent.GetId(),
			Prompt: "What is the weather in Tokyo?",
		})
		require.NoError(t, err)
		assert.Equal(t, "completed", run.GetStatus())
		assert.Equal(t, "api", run.GetSource())
		assert.Equal(t, "Tokyo is Sunny at 24C.", run.GetOutput().GetText())

		calls := mockExtMCP.Calls()
		require.NotEmpty(t, calls)
		assert.Equal(t, "ext_lookup_weather", calls[0].ToolName)

		detailed, err := d.AI().Client().GetRun(t.Context(), &aiv1.GetRunRequest{Id: run.GetId()})
		require.NoError(t, err)
		assert.GreaterOrEqual(t, len(detailed.GetSteps()), 2)
	})

	t.Run("Generate supports structured output_schema", func(t *testing.T) {
		schemaSt, err := structpb.NewStruct(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"summary": map[string]any{"type": "string"},
			},
			"required": []any{"summary"},
		})
		require.NoError(t, err)

		run, err := d.AI().Client().Generate(t.Context(), &aiv1.GenerateRequest{
			Prompt:       "Summarize weather",
			ModelId:      new(model.GetId()),
			OutputSchema: schemaSt,
		})
		require.NoError(t, err)
		assert.Equal(t, "completed", run.GetStatus())
		require.NotNil(t, run.GetOutput())
		require.NotNil(t, run.GetOutput().GetData())
		assert.Equal(t, "Sunny 24C", run.GetOutput().GetData().AsMap()["summary"])
	})

	t.Run("Workflow ai.agent_run links StepRun.AiRunId and completes", func(t *testing.T) {
		conn, err := grpc.NewClient("unix:"+d.Env().SocketPath,
			grpc.WithTransportCredentials(insecure.NewCredentials()),
		)
		require.NoError(t, err)
		defer func() { _ = conn.Close() }()

		wfClient := workflowv1.NewWorkflowServiceClient(conn)
		wfCtx := metadata.NewOutgoingContext(context.Background(), metadata.New(map[string]string{
			"authorization": "Bearer " + userToken,
			"space-id":      spaceID,
		}))

		stepCfg, err := structpb.NewStruct(map[string]any{
			"agent_id": agent.GetId(),
			"prompt":   "Check Tokyo weather",
		})
		require.NoError(t, err)

		flow, err := wfClient.CreateFlow(wfCtx, &workflowv1.CreateFlowRequest{
			Flow: &workflowv1.Flow{
				Name:      "Weather Agent Flow",
				IsEnabled: true,
				Triggers: []*workflowv1.Flow_Trigger{{
					Name:      "Manual",
					Type:      "manual",
					IsEnabled: true,
				}},
				Steps: []*workflowv1.Flow_StepNode{{
					Id:     "run_weather_agent",
					Name:   new("Run Weather Agent"),
					Type:   "ai.agent_run",
					Inputs: stepCfg,
				}},
			},
		})
		require.NoError(t, err)

		runResp, err := wfClient.ExecuteFlow(wfCtx, &workflowv1.ExecuteFlowRequest{
			Id: flow.GetId(),
		})
		require.NoError(t, err)

		var completedFlowRun *workflowv1.FlowRun
		deadline := time.Now().Add(10 * time.Second)
		for time.Now().Before(deadline) {
			fr, getErr := wfClient.GetFlowRun(wfCtx, &workflowv1.GetFlowRunRequest{Id: runResp.GetId()})
			require.NoError(t, getErr)
			if fr.GetStatus() == "completed" || fr.GetStatus() == "failed" {
				completedFlowRun = fr
				break
			}
			time.Sleep(50 * time.Millisecond)
		}
		require.NotNil(t, completedFlowRun)
		assert.Equal(t, "completed", completedFlowRun.GetStatus())
		require.Len(t, completedFlowRun.GetStepRuns(), 1)
		aiRunID := completedFlowRun.GetStepRuns()[0].GetAiRunId()
		assert.NotEmpty(t, aiRunID)

		aiRun, err := d.AI().Client().GetRun(t.Context(), &aiv1.GetRunRequest{Id: aiRunID})
		require.NoError(t, err)
		assert.Equal(t, "workflow", aiRun.GetSource())
		assert.Equal(t, "completed", aiRun.GetStatus())
	})

	t.Run("External MCP client invokes agent__weather-helper with RunSourceMCP", func(t *testing.T) {
		conn, err := grpc.NewClient("unix:"+d.Env().SocketPath,
			grpc.WithTransportCredentials(insecure.NewCredentials()),
		)
		require.NoError(t, err)
		defer func() { _ = conn.Close() }()

		identClient := identityv1.NewIdentityClient(conn)
		authCtx := metadata.NewOutgoingContext(context.Background(), metadata.New(map[string]string{
			"authorization": "Bearer " + userToken,
		}))

		keyResp, err := identClient.CreateAPIKey(authCtx, &identityv1.CreateAPIKeyRequest{
			ApiKey: &identityv1.APIKey{
				Name:     "Agent MCP Runner Key",
				Scopes:   []string{"ai:execute"},
				SpaceIds: []string{spaceID},
			},
		})
		require.NoError(t, err)

		mcpClient := loommcp.NewClient(loommcp.Config{
			Transport: "http",
			URL:       d.Env().ServerURL + "/mcp",
			Headers: map[string]string{
				"Authorization": "Bearer " + keyResp.GetRawKey(),
			},
		})
		defer func() { _ = mcpClient.Close() }()

		tools, err := mcpClient.Tools(t.Context())
		require.NoError(t, err)
		var names []string
		for _, tl := range tools {
			names = append(names, tl.Definition.Name)
		}
		assert.Contains(t, names, "agent__weather-helper")

		stream, err := mcpClient.CallTool(t.Context(), "agent__weather-helper", map[string]any{
			"prompt": "Report Tokyo weather",
		})
		require.NoError(t, err)

		var sawWeatherText bool
		for chunk, chunkErr := range stream {
			require.NoError(t, chunkErr)
			require.False(t, chunk.IsError, "unexpected tool error: %+v", chunk)
			raw, mErr := json.Marshal(chunk)
			require.NoError(t, mErr)
			if strings.Contains(string(raw), "Tokyo is Sunny at 24C.") {
				sawWeatherText = true
			}
		}
		assert.True(t, sawWeatherText)

		mcpRuns, err := d.AI().Client().ListRuns(t.Context(), &aiv1.ListRunsRequest{
			Source: new("mcp"),
		})
		require.NoError(t, err)
		assert.NotEmpty(t, mcpRuns.GetRuns(), "expected mcp-sourced run to be persisted in platform.ai_runs")
	})
}
