//go:build integration

package ai_test

import (
	"fmt"
	"strings"
	"testing"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	aiv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/ai/v1"
	spacev1 "github.com/masterkeysrd/saturn/apis/saturn/space/v1"
	"github.com/masterkeysrd/saturn/tests/driver"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
)

func TestAI_PrivateThreadsAndToolApprovals(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().CreateApprovedUser(t).Login(t)
	user1Token := d.State().AccessToken

	d.Space().Ensure(t, "AI Chat Workspace")
	spaceID := d.State().SpaceID

	// Add User 2 as a member in the same workspace.
	d.Auth().CreateApprovedUser(t).Login(t)
	user2ID := d.State().UserID
	user2Token := d.State().AccessToken

	d.State().AccessToken = user1Token
	_, err := d.Space().CreateSpaceMember(t, spaceID, user2ID, spacev1.SpaceMember_MEMBER)
	require.NoError(t, err)

	// Seed Finance account and budget in Space A.
	d.Finance().InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Primary Checking",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 50000,
		}).
		CreateBudget(t, driver.BudgetOptions{
			Name:        "Groceries",
			LimitAmount: 40000,
			Currency:    "USD",
		})
	groceriesBudgetID := d.State().Budgets["Groceries"]
	require.NotEmpty(t, groceriesBudgetID)

	mockLLM := driver.StartMockLLMServer(t, "Hello!")
	_, model := d.AI().SetupMockOpenAIProvider(t, "Thread Mock OpenAI", mockLLM.URL, "gpt-4o")

	t.Run("Paired lazy seeding and ResetAgent", func(t *testing.T) {
		mcpResp, err := d.AI().Client().ListMCPServers(t.Context(), &aiv1.ListMCPServersRequest{})
		require.NoError(t, err)
		var sysMCP *aiv1.MCPServer
		for _, srv := range mcpResp.GetMcpServers() {
			if srv.GetSystemKey() == "system.saturn.mcp" {
				sysMCP = srv
				break
			}
		}
		require.NotNil(t, sysMCP, "expected system.saturn.mcp to be lazily seeded")
		require.NotNil(t, sysMCP.GetDiscovery())
		var discoveredToolNames []string
		for _, tl := range sysMCP.GetDiscovery().GetTools() {
			discoveredToolNames = append(discoveredToolNames, tl.GetName())
		}
		assert.Contains(t, discoveredToolNames, "finance_list_accounts")
		assert.Contains(t, discoveredToolNames, "finance_create_transaction")

		agentsResp, err := d.AI().Client().ListAgents(t.Context(), &aiv1.ListAgentsRequest{})
		require.NoError(t, err)
		var assistant *aiv1.Agent
		for _, ag := range agentsResp.GetAgents() {
			if ag.GetSystemKey() == "system.saturn.assistant" {
				assistant = ag
				break
			}
		}
		require.NotNil(t, assistant, "expected system.saturn.assistant to be lazily seeded")
		origInstruction := assistant.GetConfig().GetSystemInstruction()

		patched, err := d.AI().Client().UpdateAgent(t.Context(), &aiv1.UpdateAgentRequest{
			Id: assistant.GetId(),
			Agent: &aiv1.Agent{
				Config: &aiv1.AgentConfig{
					SystemInstruction: new("Temporary override instruction"),
				},
			},
			UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"config.system_instruction"}},
		})
		require.NoError(t, err)
		assert.Equal(t, "Temporary override instruction", patched.GetConfig().GetSystemInstruction())

		reset, err := d.AI().Client().ResetAgent(t.Context(), &aiv1.ResetAgentRequest{Id: assistant.GetId()})
		require.NoError(t, err)
		assert.Equal(t, origInstruction, reset.GetConfig().GetSystemInstruction())
	})

	t.Run("Private thread isolation, auto-run read tool, and approve/reject write tool", func(t *testing.T) {
		thread, err := d.AI().Client().CreateThread(t.Context(), &aiv1.CreateThreadRequest{
			Thread: &aiv1.Thread{
				Title:   "Finance Review",
				ModelId: new(model.GetId()),
			},
		})
		require.NoError(t, err)

		// User 2 in the same space cannot view, update, or delete User 1's private thread.
		d.State().AccessToken = user2Token
		_, err = d.AI().Client().GetThread(t.Context(), &aiv1.GetThreadRequest{Id: thread.GetId()})
		require.Error(t, err)
		_, err = d.AI().Client().UpdateThread(t.Context(), &aiv1.UpdateThreadRequest{
			Id:         thread.GetId(),
			Thread:     &aiv1.Thread{Title: "Hijacked"},
			UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"title"}},
		})
		require.Error(t, err)
		_, err = d.AI().Client().DeleteThread(t.Context(), &aiv1.DeleteThreadRequest{Id: thread.GetId()})
		require.Error(t, err)
		d.State().AccessToken = user1Token

		// Configure mock LLM:
		// 1) Call read-only finance_list_accounts
		// 2) After receiving list result, call mutating finance_create_transaction (requires approval)
		// 3) After receiving transaction result, return final assistant text
		mockLLM.SetTurnFunc(func(body map[string]any) driver.MockLLMTurn {
			msgs, _ := body["messages"].([]any)
			var sawListResult, sawCreateResult, wasDeclined bool
			for _, raw := range msgs {
				m, _ := raw.(map[string]any)
				if m["role"] == "tool" {
					callID, _ := m["tool_call_id"].(string)
					switch callID {
					case "call_list_accounts":
						sawListResult = true
					case "call_create_txn":
						sawCreateResult = true
						contentStr, _ := m["content"].(string)
						if strings.Contains(contentStr, "declined") {
							wasDeclined = true
						}
					}
				}
			}
			if !sawListResult {
				return driver.MockLLMTurn{
					ToolCalls: []driver.MockToolCall{{
						ID:        "call_list_accounts",
						Name:      "finance_list_accounts",
						Arguments: `{}`,
					}},
				}
			}
			if !sawCreateResult {
				return driver.MockLLMTurn{
					ToolCalls: []driver.MockToolCall{{
						ID:   "call_create_txn",
						Name: "finance_create_transaction",
						Arguments: fmt.Sprintf(
							`{"type":"EXPENSE","budget_id":%q,"amount_cents":2500,"currency":"USD","description":"Coffee Beans"}`,
							groceriesBudgetID,
						),
					}},
				}
			}
			if wasDeclined {
				return driver.MockLLMTurn{Text: "Understood, transaction cancelled."}
			}
			return driver.MockLLMTurn{Text: "Recorded $25.00 for Coffee Beans."}
		})

		// First turn auto-runs finance_list_accounts and pauses on finance_create_transaction.
		events := d.AI().StreamThreadTurn(t, thread.GetId(), map[string]any{
			"content": "Check my accounts and log $25 for Coffee Beans.",
		})

		var eventTypes []string
		var approvalCallID string
		for _, ev := range events {
			eventTypes = append(eventTypes, ev.Event)
			if ev.Event == "tool.approval.required" {
				approvals, _ := ev.Data["approvals"].([]any)
				require.Len(t, approvals, 1)
				first, _ := approvals[0].(map[string]any)
				approvalCallID, _ = first["toolCallId"].(string)
				assert.Equal(t, "finance_create_transaction", first["toolName"])
			}
		}
		assert.Contains(t, eventTypes, "run.started")
		assert.Contains(t, eventTypes, "tool.call.started")
		assert.Contains(t, eventTypes, "tool.call.completed")
		assert.Contains(t, eventTypes, "tool.approval.required")
		require.NotEmpty(t, approvalCallID)

		pausedThread, err := d.AI().Client().GetThread(t.Context(), &aiv1.GetThreadRequest{Id: thread.GetId()})
		require.NoError(t, err)
		assert.Equal(t, "awaiting_approval", pausedThread.GetStatus())
		require.NotNil(t, pausedThread.GetState())
		require.Len(t, pausedThread.GetState().GetPendingApprovals(), 1)
		d.Finance().AssertTransactionCount(t, 0)

		// Approve the pending write tool call.
		resumeEvents := d.AI().ResolveApprovals(t, thread.GetId(), []map[string]any{
			{"toolCallId": approvalCallID, "approved": true},
		})
		var resumeTypes []string
		for _, ev := range resumeEvents {
			resumeTypes = append(resumeTypes, ev.Event)
		}
		assert.Contains(t, resumeTypes, "tool.call.completed")
		assert.Contains(t, resumeTypes, "message.completed")
		assert.Contains(t, resumeTypes, "run.completed")

		// Verify transaction persisted in PostgreSQL.
		d.Finance().AssertTransactionCount(t, 1)

		// Second thread tests Reject continuation.
		thread2, err := d.AI().Client().CreateThread(t.Context(), &aiv1.CreateThreadRequest{
			Thread: &aiv1.Thread{
				Title:   "Reject Flow",
				ModelId: new(model.GetId()),
			},
		})
		require.NoError(t, err)

		events2 := d.AI().StreamThreadTurn(t, thread2.GetId(), map[string]any{
			"content": "Log another expense.",
		})
		var rejectCallID string
		for _, ev := range events2 {
			if ev.Event == "tool.approval.required" {
				approvals, _ := ev.Data["approvals"].([]any)
				require.Len(t, approvals, 1)
				first, _ := approvals[0].(map[string]any)
				rejectCallID, _ = first["toolCallId"].(string)
			}
		}
		require.NotEmpty(t, rejectCallID)

		rejectEvents := d.AI().ResolveApprovals(t, thread2.GetId(), []map[string]any{
			{"toolCallId": rejectCallID, "approved": false},
		})
		var sawDeclinedTool, sawRunCompleted bool
		for _, ev := range rejectEvents {
			if ev.Event == "tool.call.completed" {
				if isErr, _ := ev.Data["isError"].(bool); isErr {
					sawDeclinedTool = true
				}
			}
			if ev.Event == "run.completed" {
				sawRunCompleted = true
			}
		}
		assert.True(t, sawDeclinedTool, "expected declined tool.call.completed with isError=true")
		assert.True(t, sawRunCompleted, "expected run.completed after rejection")
		d.Finance().AssertTransactionCount(t, 1)
	})
}
