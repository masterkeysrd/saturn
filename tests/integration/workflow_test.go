//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"encoding/json/v2"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	calendarv1 "github.com/masterkeysrd/saturn/apis/saturn/calendar/v1"
	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
	mailv1 "github.com/masterkeysrd/saturn/apis/saturn/mail/v1"
	workflowv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/workflow/v1"
	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/id"
	eventtransport "github.com/masterkeysrd/saturn/internal/transport/event"
	eventmiddleware "github.com/masterkeysrd/saturn/internal/transport/event/middleware"
	"github.com/masterkeysrd/saturn/tests/driver"
	pdfcpuapi "github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
	"google.golang.org/protobuf/types/known/structpb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func dialWorkflowGRPC(tb testing.TB, d *driver.Driver) (workflowv1.WorkflowServiceClient, identityv1.IdentityClient, calendarv1.CalendarServiceClient) {
	tb.Helper()
	conn, err := grpc.NewClient("unix:"+d.Env().SocketPath,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(tb, err)
	tb.Cleanup(func() { _ = conn.Close() })
	return workflowv1.NewWorkflowServiceClient(conn), identityv1.NewIdentityClient(conn), calendarv1.NewCalendarServiceClient(conn)
}

func authSpaceCtx(token, spaceID string) context.Context {
	pairs := map[string]string{"authorization": "Bearer " + token}
	if spaceID != "" {
		pairs["space-id"] = spaceID
	}
	return metadata.NewOutgoingContext(context.Background(), metadata.New(pairs))
}

func mustStructPB(tb testing.TB, m map[string]any) *structpb.Struct {
	tb.Helper()
	st, err := structpb.NewStruct(m)
	require.NoError(tb, err)
	return st
}

func pollCondition(tb testing.TB, timeout time.Duration, desc string, fn func() bool) {
	tb.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if fn() {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	tb.Fatalf("timed out waiting for %s after %s", desc, timeout)
}

func buildMinimalTextPDF(text string) []byte {
	streamBody := fmt.Sprintf("BT /F1 12 Tf 72 720 Td (%s) Tj ET", text)
	objs := []string{
		"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
		"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
		"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
		fmt.Sprintf("4 0 obj << /Length %d >>\nstream\n%s\nendstream\nendobj\n", len(streamBody), streamBody),
		"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
	}

	var buf bytes.Buffer
	buf.WriteString("%PDF-1.4\n")
	offsets := make([]int, len(objs)+1)
	for i, obj := range objs {
		offsets[i+1] = buf.Len()
		buf.WriteString(obj)
	}
	xrefOffset := buf.Len()
	fmt.Fprintf(&buf, "xref\n0 %d\n", len(objs)+1)
	buf.WriteString("0000000000 65535 f \n")
	for i := 1; i <= len(objs); i++ {
		fmt.Fprintf(&buf, "%010d 00000 n \n", offsets[i])
	}
	fmt.Fprintf(&buf, "trailer << /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objs)+1, xrefOffset)
	return buf.Bytes()
}

func TestWorkflow_SystemFlowLifecycleAndDeleteProtection(t *testing.T) {
	d := driver.New(t, testEnv)
	d.Auth().CreateApprovedUser(t).Login(t)
	d.Space().Ensure(t, "Workflow Lifecycle Space")
	spaceID := d.State().SpaceID

	// 1. Verify lazy seeding: no flows exist in PostgreSQL prior to ListFlows/GetFlow
	var preCount int
	err := d.Env().DB.Get(&preCount, `SELECT COUNT(*) FROM platform.flows WHERE space_id = $1`, spaceID)
	require.NoError(t, err)
	assert.Equal(t, 0, preCount)

	// 2. ListFlows lazily seeds all 3 system blueprints
	listResp := d.Workflow().ListFlows(t, nil)
	bySystemKey := make(map[string]*workflowv1.Flow)
	for _, f := range listResp.GetFlows() {
		if f.GetIsSystem() {
			bySystemKey[f.GetSystemKey()] = f
		}
	}
	require.Contains(t, bySystemKey, "system.finance.inbox_ingestion")
	require.Contains(t, bySystemKey, "system.finance.transaction_suggestions")
	require.Contains(t, bySystemKey, "system.finance.statement_ingestion")

	inboxFlow := bySystemKey["system.finance.inbox_ingestion"]
	origName := inboxFlow.GetName()
	assert.Equal(t, int64(1), inboxFlow.GetVersion())

	// 3. Customize system flow via UpdateFlow
	wfGRPC, _, _ := dialWorkflowGRPC(t, d)
	ctx := authSpaceCtx(d.State().AccessToken, spaceID)

	customized, err := wfGRPC.UpdateFlow(ctx, &workflowv1.UpdateFlowRequest{
		Id: inboxFlow.GetId(),
		Flow: &workflowv1.Flow{
			Name:        "Custom Inbox Pipeline",
			Description: "Tailored description",
		},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"name", "description"}},
	})
	require.NoError(t, err)
	assert.Equal(t, "Custom Inbox Pipeline", customized.GetName())
	assert.Equal(t, "Tailored description", customized.GetDescription())
	assert.Equal(t, int64(2), customized.GetVersion())

	// 4. DeleteFlow on system flow must fail with FailedPrecondition
	_, err = wfGRPC.DeleteFlow(ctx, &workflowv1.DeleteFlowRequest{Id: inboxFlow.GetId()})
	require.Error(t, err)
	assert.Equal(t, codes.FailedPrecondition, status.Code(err))

	// 5. ResetFlow restores blueprint defaults and preserves flw_ ID
	reset, err := wfGRPC.ResetFlow(ctx, &workflowv1.ResetFlowRequest{Id: "system.finance.inbox_ingestion"})
	require.NoError(t, err)
	assert.Equal(t, inboxFlow.GetId(), reset.GetId())
	assert.Equal(t, origName, reset.GetName())
	assert.Equal(t, int64(3), reset.GetVersion())

	// 6. User-defined flow CRUD + Enable/Disable + Delete
	createdUser, err := wfGRPC.CreateFlow(ctx, &workflowv1.CreateFlowRequest{
		Flow: &workflowv1.Flow{
			Name:        "User Echo Flow",
			Description: "Custom user automation",
			IsEnabled:   true,
			Triggers: []*workflowv1.Flow_Trigger{
				{Name: "Manual", Type: "manual", IsEnabled: true},
			},
			Steps: []*workflowv1.Flow_StepNode{
				{
					Id:   "out",
					Name: new("Return Echo"),
					Type: "output",
					Inputs: mustStructPB(t, map[string]any{
						"value": map[string]any{"ok": true},
					}),
				},
			},
		},
	})
	require.NoError(t, err)
	assert.False(t, createdUser.GetIsSystem())

	disabled, err := wfGRPC.DisableFlow(ctx, &workflowv1.DisableFlowRequest{Id: createdUser.GetId()})
	require.NoError(t, err)
	assert.False(t, disabled.GetIsEnabled())

	enabled, err := wfGRPC.EnableFlow(ctx, &workflowv1.EnableFlowRequest{Id: createdUser.GetId()})
	require.NoError(t, err)
	assert.True(t, enabled.GetIsEnabled())

	_, err = wfGRPC.DeleteFlow(ctx, &workflowv1.DeleteFlowRequest{Id: createdUser.GetId()})
	require.NoError(t, err)

	_, err = wfGRPC.GetFlow(ctx, &workflowv1.GetFlowRequest{Id: createdUser.GetId()})
	require.Error(t, err)
	assert.Equal(t, codes.NotFound, status.Code(err))
}

func TestWorkflow_MailReceivedToFinanceInboxAndIdempotency(t *testing.T) {
	d := driver.New(t, testEnv)
	d.Auth().CreateApprovedUser(t).Login(t)
	d.Space().Ensure(t, "Mail Ingestion Workflow Space")
	spaceID := d.State().SpaceID

	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Primary Card",
			Type:           financev1.Account_CREDIT_CARD,
			Currency:       "USD",
			InitialBalance: 0,
			LastFour:       "4321",
		}).
		CreateBudget(t, driver.BudgetOptions{
			Name:        "Dining",
			LimitAmount: 50000,
			Currency:    "USD",
		})

	mock := driver.StartMockLLMServer(t, "")
	mock.SetResponseFunc(func(body map[string]any) string {
		raw, _ := json.Marshal(body)
		s := string(raw)
		if strings.Contains(s, "Classify this document:") {
			return `{"category": "receipt", "confidence": 0.98, "reason": "coffee shop receipt"}`
		}
		if strings.Contains(s, "Extracted transaction:") {
			return `{"is_duplicate": false, "reason": "unique transaction"}`
		}
		return `{
			"transaction_type": "EXPENSE",
			"vendor": "Coffee Roasters",
			"amount": 18.50,
			"currency": "USD",
			"date": "2026-09-15",
			"card_last_four": "4321",
			"budget_name": "Dining"
		}`
	})

	_, err := d.Agent().CreateProvider(t, driver.CreateProviderOptions{
		Name:              "Mock OpenAI",
		CompatibilityMode: "OPENAI_COMPATIBLE",
		APIUrl:            mock.URL,
		APIKey:            "sk-test-mail-wf",
	})
	require.NoError(t, err)

	// Lazily seed system.finance.inbox_ingestion and set an explicit default_model
	flows := d.Workflow().ListFlows(t, nil)
	var inboxFlow *workflowv1.Flow
	for _, f := range flows.GetFlows() {
		if f.GetSystemKey() == "system.finance.inbox_ingestion" {
			inboxFlow = f
			break
		}
	}
	require.NotNil(t, inboxFlow)
	inboxFlowID := inboxFlow.GetId()
	require.NotEmpty(t, inboxFlowID)

	wfGRPC, _, _ := dialWorkflowGRPC(t, d)
	ctx := authSpaceCtx(d.State().AccessToken, spaceID)
	inboxFlow.Config = &workflowv1.Flow_Config{
		DefaultModel: &workflowv1.ModelConfig{
			ModelName: new("gpt-4o"),
		},
	}
	_, err = wfGRPC.UpdateFlow(ctx, &workflowv1.UpdateFlowRequest{
		Id:         inboxFlowID,
		Flow:       inboxFlow,
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"config"}},
	})
	require.NoError(t, err)

	mailMsgID, err := id.Generate("msg_")
	require.NoError(t, err)

	evPayload, err := proto.Marshal(&mailv1.MessageReceivedEvent{
		Message: &mailv1.Message{
			Id:                 mailMsgID,
			SpaceId:            spaceID,
			ConnectedAccountId: "cac_1",
			ThreadId:           "thr_1",
			Subject:            "Receipt from Coffee Roasters",
			Snippet:            "You spent $18.50",
			BodyPlain:          "Thanks for visiting Coffee Roasters. Charged $18.50 to card ending in 4321.",
			From:               &mailv1.Participant{Name: "Coffee Roasters", Email: "receipts@roasters.test"},
			ReceivedAt:         timestamppb.Now(),
			CreateTime:         timestamppb.Now(),
			UpdateTime:         timestamppb.Now(),
		},
	})
	require.NoError(t, err)

	pubCtx := auth.WithSpaceID(t.Context(), spaceID)
	require.NoError(t, d.Env().EventBus().Publish(pubCtx, domainmail.TopicMessageReceived, evPayload))

	var firstRun *workflowv1.FlowRun
	pollCondition(t, 15*time.Second, "system.finance.inbox_ingestion FlowRun completion", func() bool {
		runs, rErr := d.Workflow().Client().ListFlowRuns(t.Context(), &workflowv1.ListFlowRunsRequest{
			FlowId: &inboxFlowID,
		})
		if rErr != nil || len(runs.GetRuns()) == 0 {
			return false
		}
		if runs.GetRuns()[0].GetStatus() == "completed" {
			firstRun = runs.GetRuns()[0]
			return true
		}
		return false
	})
	require.NotNil(t, firstRun)

	// Verify InboxItem staged with flow_run_id
	inboxResp, err := d.Finance().ListInboxItems(t, nil)
	require.NoError(t, err)
	require.Len(t, inboxResp.GetInboxItems(), 1)
	item := inboxResp.GetInboxItems()[0]
	assert.Equal(t, "Coffee Roasters", item.GetVendorName())
	assert.Equal(t, int64(1850), item.GetAmount())
	assert.Equal(t, firstRun.GetId(), item.GetFlowRunId())

	// Publish duplicate mail.message.received with the same message.id -> idempotency deduplication
	require.NoError(t, d.Env().EventBus().Publish(pubCtx, domainmail.TopicMessageReceived, evPayload))

	pollCondition(t, 15*time.Second, "second inbox ingestion FlowRun completion", func() bool {
		runs, rErr := d.Workflow().Client().ListFlowRuns(t.Context(), &workflowv1.ListFlowRunsRequest{
			FlowId: &inboxFlowID,
		})
		if rErr != nil || len(runs.GetRuns()) < 2 {
			return false
		}
		completedCount := 0
		for _, r := range runs.GetRuns() {
			if r.GetStatus() == "completed" {
				completedCount++
			}
		}
		return completedCount >= 2
	})

	// Must still have exactly 1 InboxItem due to idempotency_key ("mail:<msg_id>")
	inboxAfterDup, err := d.Finance().ListInboxItems(t, nil)
	require.NoError(t, err)
	assert.Len(t, inboxAfterDup.GetInboxItems(), 1)
}

func TestWorkflow_WebhookTriggerWithSingleSpaceAPIKey(t *testing.T) {
	d := driver.New(t, testEnv)
	d.Auth().CreateApprovedUser(t).Login(t)
	d.Space().Ensure(t, "Webhook API Key Space")
	spaceA := d.State().SpaceID
	userToken := d.State().AccessToken

	spaceBObj, err := d.Space().CreateSpace(t, "Other Space", "")
	require.NoError(t, err)
	spaceB := spaceBObj.GetId()

	wfGRPC, identGRPC, _ := dialWorkflowGRPC(t, d)
	ctxA := authSpaceCtx(userToken, spaceA)

	flow, err := wfGRPC.CreateFlow(ctxA, &workflowv1.CreateFlowRequest{
		Flow: &workflowv1.Flow{
			Name:      "Order Webhook Flow",
			IsEnabled: true,
			Triggers: []*workflowv1.Flow_Trigger{
				{
					Name:      "Order Hook",
					Type:      "webhook",
					IsEnabled: true,
				},
			},
			Steps: []*workflowv1.Flow_StepNode{
				{
					Id:   "echo",
					Name: new("Echo Payload"),
					Type: "output",
					Inputs: mustStructPB(t, map[string]any{
						"value": map[string]any{
							"order_id": "{{ input.order_id }}",
							"amount":   "{{ input.amount }}",
						},
					}),
				},
			},
		},
	})
	require.NoError(t, err)
	require.Len(t, flow.GetTriggers(), 1)
	trigID := flow.GetTriggers()[0].GetId()

	// Create 1-Space sat_ API key scoped to workflows:execute
	apiKeyResp, err := identGRPC.CreateAPIKey(authSpaceCtx(userToken, ""), &identityv1.CreateAPIKeyRequest{
		ApiKey: &identityv1.APIKey{
			Name:     "Webhook Trigger Key",
			Scopes:   []string{"workflows:execute"},
			SpaceIds: []string{spaceA},
		},
	})
	require.NoError(t, err)
	rawKey := apiKeyResp.GetRawKey()
	require.True(t, strings.HasPrefix(rawKey, "sat_"))

	// Invoke POST /api/v1/platform/workflows/triggers/{trigger_id}:webhook WITHOUT space-id header
	webhookURL := fmt.Sprintf("%s/api/v1/platform/workflows/triggers/%s:webhook", d.Env().ServerURL, trigID)
	req, err := http.NewRequestWithContext(t.Context(), http.MethodPost, webhookURL, strings.NewReader(`{"order_id":"ord_99","amount":4200}`))
	require.NoError(t, err)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	req.Header.Set("Content-Type", "application/json")

	httpResp, err := d.HTTPClient().Do(req)
	require.NoError(t, err)
	defer func() { _ = httpResp.Body.Close() }()
	respBody, err := io.ReadAll(httpResp.Body)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, httpResp.StatusCode, "webhook response body: %s", string(respBody))

	var runPayload map[string]any
	require.NoError(t, json.Unmarshal(respBody, &runPayload))
	runID, _ := runPayload["id"].(string)
	require.True(t, strings.HasPrefix(runID, "wfr_"), "expected wfr_ ID, got %v", runPayload)
	assert.Equal(t, spaceA, runPayload["spaceId"])

	// Poll FlowRun until async EventBus worker finishes execution
	var completedRun *workflowv1.FlowRun
	pollCondition(t, 10*time.Second, "webhook FlowRun completion", func() bool {
		r, gErr := wfGRPC.GetFlowRun(ctxA, &workflowv1.GetFlowRunRequest{Id: runID})
		if gErr != nil {
			return false
		}
		if r.GetStatus() == "completed" {
			completedRun = r
			return true
		}
		return false
	})
	require.NotNil(t, completedRun)
	outFields := completedRun.GetOutput().GetFields()
	assert.Equal(t, "ord_99", outFields["order_id"].GetStringValue())
	assert.Equal(t, float64(4200), outFields["amount"].GetNumberValue())

	// Calling webhook with mismatched space-id header must be rejected
	badReq, err := http.NewRequestWithContext(t.Context(), http.MethodPost, webhookURL, strings.NewReader(`{"order_id":"ord_bad"}`))
	require.NoError(t, err)
	badReq.Header.Set("Authorization", "Bearer "+rawKey)
	badReq.Header.Set("Content-Type", "application/json")
	badReq.Header.Set("space-id", spaceB)
	badResp, err := d.HTTPClient().Do(badReq)
	require.NoError(t, err)
	defer func() { _ = badResp.Body.Close() }()
	assert.Equal(t, http.StatusForbidden, badResp.StatusCode)
}

func TestWorkflow_ScheduledTransactionUpsertCalendarEvent(t *testing.T) {
	d := driver.New(t, testEnv)
	d.Auth().CreateApprovedUser(t).Login(t)
	d.Space().Ensure(t, "Scheduled Tx Calendar Space")
	spaceID := d.State().SpaceID
	token := d.State().AccessToken

	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Bill Pay Checking",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 200000,
		}).
		CreateBudget(t, driver.BudgetOptions{
			Name:        "Bills",
			LimitAmount: 50000,
			Currency:    "USD",
		})

	wfGRPC, _, calGRPC := dialWorkflowGRPC(t, d)
	ctx := authSpaceCtx(token, spaceID)

	defaultCal, err := calGRPC.EnsureDefaultCalendar(ctx, &calendarv1.EnsureDefaultCalendarRequest{})
	require.NoError(t, err)

	mapping := mustStructPB(t, map[string]any{
		"external_ref": "{{ 'scheduled_tx:' + trigger.data.scheduled_transaction.id }}",
		"title":        "{{ trigger.data.scheduled_transaction.metadata.vendor_name + ' - ' + string(trigger.data.scheduled_transaction.amount) }}",
		"start_date":   "{{ trigger.data.scheduled_transaction.due_date.substring(0, 10) }}",
		"description":  "{{ 'Bill amount: ' + string(trigger.data.scheduled_transaction.amount) + ' ' + trigger.data.scheduled_transaction.currency }}",
	})

	flow, err := wfGRPC.CreateFlow(ctx, &workflowv1.CreateFlowRequest{
		Flow: &workflowv1.Flow{
			Name:      "Scheduled Bill to Calendar",
			IsEnabled: true,
			Triggers: []*workflowv1.Flow_Trigger{
				{
					Name:      "Scheduled Tx Created",
					Type:      "event",
					IsEnabled: true,
					Config: &workflowv1.Flow_Trigger_Config{
						Topic:        new("finance.scheduled_transaction.created"),
						InputMapping: mapping,
					},
				},
				{
					Name:      "Scheduled Tx Updated",
					Type:      "event",
					IsEnabled: true,
					Config: &workflowv1.Flow_Trigger_Config{
						Topic:        new("finance.scheduled_transaction.updated"),
						InputMapping: mapping,
					},
				},
			},
			Steps: []*workflowv1.Flow_StepNode{
				{
					Id:   "upsert_cal",
					Name: new("Upsert Calendar Event"),
					Type: "calendar.upsert_event",
					Inputs: mustStructPB(t, map[string]any{
						"calendar_id":  "primary",
						"external_ref": "{{ input.external_ref }}",
						"title":        "{{ input.title }}",
						"is_all_day":   true,
						"start_date":   "{{ input.start_date }}",
						"description":  "{{ input.description }}",
					}),
				},
				{
					Id:   "out",
					Name: new("Return Event"),
					Type: "output",
					Inputs: mustStructPB(t, map[string]any{
						"value": "{{ steps.upsert_cal }}",
					}),
				},
			},
		},
	})
	require.NoError(t, err)

	// 1. Stage & approve an unlinked INVOICE -> creates ScheduledTransaction & emits finance.scheduled_transaction.created
	d.Finance().
		StageInboxItem(t, driver.StageInboxItemOptions{
			Key:        "inv_created",
			DocType:    financev1.InboxItem_INVOICE,
			Amount:     12000,
			Currency:   "USD",
			Vendor:     "Electric Co",
			BudgetName: "Bills",
		}).
		ApproveInboxItem(t, "inv_created")

	var stxID string
	d.Finance().AssertPendingScheduledTransaction(t, func(sp *financev1.ScheduledTransaction) {
		stxID = sp.GetId()
	})
	require.NotEmpty(t, stxID)

	var firstRun *workflowv1.FlowRun
	pollCondition(t, 10*time.Second, "first calendar upsert FlowRun", func() bool {
		runs, rErr := wfGRPC.ListFlowRuns(ctx, &workflowv1.ListFlowRunsRequest{FlowId: new(flow.GetId())})
		if rErr != nil || len(runs.GetRuns()) < 1 {
			return false
		}
		if runs.GetRuns()[0].GetStatus() == "completed" {
			firstRun = runs.GetRuns()[0]
			return true
		}
		return false
	})
	firstRunDetail, err := wfGRPC.GetFlowRun(ctx, &workflowv1.GetFlowRunRequest{Id: firstRun.GetId()})
	require.NoError(t, err)
	cevID := firstRunDetail.GetOutput().GetFields()["event_id"].GetStringValue()
	require.True(t, strings.HasPrefix(cevID, "cev_"))
	assert.True(t, firstRunDetail.GetOutput().GetFields()["created"].GetBoolValue())

	// 2. Stage, link, and approve a second INVOICE linked to stxID -> emits finance.scheduled_transaction.updated
	d.Finance().
		StageInboxItem(t, driver.StageInboxItemOptions{
			Key:        "inv_updated",
			DocType:    financev1.InboxItem_INVOICE,
			Amount:     13500,
			Currency:   "USD",
			Vendor:     "Electric Co Updated",
			BudgetName: "Bills",
		}).
		UpdateInboxItem(t, "inv_updated", driver.StageInboxItemOptions{
			ScheduledTransactionID: stxID,
		}).
		ApproveInboxItem(t, "inv_updated")

	var secondRun *workflowv1.FlowRun
	pollCondition(t, 10*time.Second, "second calendar upsert FlowRun", func() bool {
		runs, rErr := wfGRPC.ListFlowRuns(ctx, &workflowv1.ListFlowRunsRequest{FlowId: new(flow.GetId())})
		if rErr != nil || len(runs.GetRuns()) < 2 {
			return false
		}
		for _, r := range runs.GetRuns() {
			if r.GetId() != firstRun.GetId() && r.GetStatus() == "completed" {
				secondRun = r
				return true
			}
		}
		return false
	})
	secondRunDetail, err := wfGRPC.GetFlowRun(ctx, &workflowv1.GetFlowRunRequest{Id: secondRun.GetId()})
	require.NoError(t, err)
	assert.Equal(t, cevID, secondRunDetail.GetOutput().GetFields()["event_id"].GetStringValue())
	assert.False(t, secondRunDetail.GetOutput().GetFields()["created"].GetBoolValue())

	// Verify only 1 event exists in Calendar and its title was updated in place
	now := time.Now().UTC()
	calEvents, err := calGRPC.ListEvents(ctx, &calendarv1.ListEventsRequest{
		CalendarIds: []string{defaultCal.GetId()},
		TimeMin:     timestamppb.New(now.Add(-48 * time.Hour)),
		TimeMax:     timestamppb.New(now.Add(48 * time.Hour)),
	})
	require.NoError(t, err)
	require.Len(t, calEvents.GetOccurrences(), 1)
	assert.Equal(t, cevID, calEvents.GetOccurrences()[0].GetEventId())
	assert.Equal(t, "Electric Co - 13500", calEvents.GetOccurrences()[0].GetTitle())
}

func TestWorkflow_StepRunCheckpointReplayAndLoopGuards(t *testing.T) {
	d := driver.New(t, testEnv)
	d.Auth().CreateApprovedUser(t).Login(t)
	d.Space().Ensure(t, "Replay & Loop Guard Space")
	spaceID := d.State().SpaceID
	token := d.State().AccessToken

	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Checking",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 100000,
		}).
		CreateBudget(t, driver.BudgetOptions{
			Name:        "Food",
			LimitAmount: 50000,
			Currency:    "USD",
		})

	var step2FailOnce atomic.Bool
	step2FailOnce.Store(true)

	mock := driver.StartMockLLMServer(t, "")
	mock.SetResponseFunc(func(body map[string]any) string {
		raw, _ := json.Marshal(body)
		s := string(raw)
		if strings.Contains(s, "Step1Prompt") {
			return `{"stage": "one"}`
		}
		if step2FailOnce.Swap(false) {
			return `not-valid-json`
		}
		return `{"stage": "two"}`
	})

	_, err := d.Agent().CreateProvider(t, driver.CreateProviderOptions{
		Name:              "Mock Replay OpenAI",
		CompatibilityMode: "OPENAI_COMPATIBLE",
		APIUrl:            mock.URL,
		APIKey:            "sk-test-replay",
	})
	require.NoError(t, err)

	wfGRPC, _, _ := dialWorkflowGRPC(t, d)
	ctx := authSpaceCtx(token, spaceID)

	stepSchema := mustStructPB(t, map[string]any{
		"type": "object",
		"properties": map[string]any{
			"stage": map[string]any{"type": "string"},
		},
		"required": []any{"stage"},
	})

	flow, err := wfGRPC.CreateFlow(ctx, &workflowv1.CreateFlowRequest{
		Flow: &workflowv1.Flow{
			Name:      "Checkpoint Replay Flow",
			IsEnabled: true,
			Config: &workflowv1.Flow_Config{
				DefaultModel: &workflowv1.ModelConfig{
					ModelName: new("gpt-4o"),
				},
			},
			Triggers: []*workflowv1.Flow_Trigger{
				{
					Name:      "On Tx Created",
					Type:      "event",
					IsEnabled: true,
					Config: &workflowv1.Flow_Trigger_Config{
						Topic: new("finance.transaction.created"),
					},
				},
			},
			Steps: []*workflowv1.Flow_StepNode{
				{
					Id:   "step1",
					Name: new("First LLM Step"),
					Type: "llm.generate",
					Inputs: mustStructPB(t, map[string]any{
						"prompt":        "Step1Prompt",
						"output_schema": stepSchema.AsMap(),
					}),
				},
				{
					Id:   "step2",
					Name: new("Second LLM Step"),
					Type: "llm.generate",
					Inputs: mustStructPB(t, map[string]any{
						"prompt":        "Step2Prompt after {{ steps.step1.stage }}",
						"output_schema": stepSchema.AsMap(),
					}),
				},
				{
					Id:   "out",
					Name: new("Done"),
					Type: "output",
					Inputs: mustStructPB(t, map[string]any{
						"value": map[string]any{
							"first":  "{{ steps.step1.stage }}",
							"second": "{{ steps.step2.stage }}",
						},
					}),
				},
			},
		},
	})
	require.NoError(t, err)

	// 1. Trigger flow via Finance CreateExpense -> step1 passes, step2 fails on malformed JSON
	d.Finance().CreateExpense(t, driver.ExpenseOptions{
		Account:         "Checking",
		Budget:          "Food",
		Currency:        "USD",
		Amount:          1500,
		Description:     "Lunch",
		TransactionDate: time.Now().UTC(),
	})

	var failedRun *workflowv1.FlowRun
	pollCondition(t, 10*time.Second, "FlowRun failure at step2", func() bool {
		runs, rErr := wfGRPC.ListFlowRuns(ctx, &workflowv1.ListFlowRunsRequest{FlowId: new(flow.GetId())})
		if rErr != nil || len(runs.GetRuns()) == 0 {
			return false
		}
		if runs.GetRuns()[0].GetStatus() == "failed" {
			failedRun = runs.GetRuns()[0]
			return true
		}
		return false
	})
	require.Equal(t, 2, mock.RequestCount())

	failedDetail, err := wfGRPC.GetFlowRun(ctx, &workflowv1.GetFlowRunRequest{Id: failedRun.GetId()})
	require.NoError(t, err)
	require.Len(t, failedDetail.GetStepRuns(), 2)
	assert.Equal(t, "completed", failedDetail.GetStepRuns()[0].GetStatus())
	assert.Equal(t, "failed", failedDetail.GetStepRuns()[1].GetStatus())

	// 2. Re-dispatch the same FlowRun on EventBus -> step1 replays from PostgreSQL checkpoint, only step2 calls LLM
	dispatchPayload, err := json.Marshal(eventtransport.WorkflowRunDispatchMessage{
		SpaceID:   spaceID,
		FlowRunID: failedRun.GetId(),
	})
	require.NoError(t, err)
	require.NoError(t, d.Env().EventBus().Publish(auth.WithSpaceID(t.Context(), spaceID), eventtransport.TopicWorkflowRunDispatch, dispatchPayload))

	var replayedRun *workflowv1.FlowRun
	pollCondition(t, 10*time.Second, "checkpoint replay FlowRun completion", func() bool {
		r, gErr := wfGRPC.GetFlowRun(ctx, &workflowv1.GetFlowRunRequest{Id: failedRun.GetId()})
		if gErr != nil {
			return false
		}
		if r.GetStatus() == "completed" {
			replayedRun = r
			return true
		}
		return false
	})
	assert.Equal(t, 3, mock.RequestCount(), "step1 must replay from checkpoint without calling LLM again")
	assert.Equal(t, "one", replayedRun.GetOutput().GetFields()["first"].GetStringValue())
	assert.Equal(t, "two", replayedRun.GetOutput().GetFields()["second"].GetStringValue())

	// 3. Verify x-workflow-hop >= MaxWorkflowHop (3) and x-workflow-chain cycle guards suppress dispatch
	txPayload, err := proto.Marshal(&financev1.TransactionCreatedEvent{
		Transaction: &financev1.Transaction{Id: "txn_guard_test", Amount: 100, Currency: "USD"},
	})
	require.NoError(t, err)

	hopCtx := eventmiddleware.WithWorkflowHop(auth.WithSpaceID(t.Context(), spaceID), eventmiddleware.MaxWorkflowHop)
	require.NoError(t, d.Env().EventBus().Publish(hopCtx, "finance.transaction.created", txPayload))

	chainCtx := eventmiddleware.WithWorkflowChain(auth.WithSpaceID(t.Context(), spaceID), []string{flow.GetId()})
	require.NoError(t, d.Env().EventBus().Publish(chainCtx, "finance.transaction.created", txPayload))

	// Wait until both eventbus messages are processed by deliveries worker
	subID := "platform.workflow.trigger.finance.transaction.created"
	pollCondition(t, 10*time.Second, "loop guard deliveries completion", func() bool {
		var delivered int
		qErr := d.Env().DB.Get(&delivered, `
			SELECT COUNT(*) FROM platform.message_deliveries
			WHERE subscriber_id = $1 AND status = 'completed'
		`, subID)
		return qErr == nil && delivered >= 3
	})

	runsAfterGuards, err := wfGRPC.ListFlowRuns(ctx, &workflowv1.ListFlowRunsRequest{FlowId: new(flow.GetId())})
	require.NoError(t, err)
	assert.Len(t, runsAfterGuards.GetRuns(), 1, "loop guards must prevent additional FlowRuns")
}

func TestWorkflow_StatementIngestionEncryptedPDF(t *testing.T) {
	d := driver.New(t, testEnv)
	d.Auth().CreateApprovedUser(t).Login(t)
	d.Space().Ensure(t, "Statement Ingestion Space")
	spaceID := d.State().SpaceID
	token := d.State().AccessToken

	d.Finance().
		InitSettings(t, "USD").
		CreateAccount(t, driver.AccountOptions{
			Name:           "Chase Checking",
			Type:           financev1.Account_BANK,
			Currency:       "USD",
			InitialBalance: 100000,
			LastFour:       "1122",
		})

	var chaseAccID string
	d.Finance().AssertAccount(t, "Chase Checking", func(acc *financev1.Account) {
		chaseAccID = acc.GetId()
	})

	mock := driver.StartMockLLMServer(t, "")
	mock.SetResponseFunc(func(_ map[string]any) string {
		return fmt.Sprintf(`{
			"institution_name": "Chase",
			"card_last_four": "1122",
			"statement_date": "2026-08-31",
			"sections": [
				{
					"currency": "USD",
					"card_last_four": "1122",
					"suggested_account_id": %q,
					"starting_balance": 1000.00,
					"ending_balance": 975.00,
					"lines": [
						{
							"date_str": "2026-08-10",
							"description": "Coffee Shop",
							"amount": -25.00
						}
					]
				}
			]
		}`, chaseAccID)
	})

	_, err := d.Agent().CreateProvider(t, driver.CreateProviderOptions{
		Name:              "Mock Janus OpenAI",
		CompatibilityMode: "OPENAI_COMPATIBLE",
		APIUrl:            mock.URL,
		APIKey:            "sk-test-janus",
	})
	require.NoError(t, err)

	// Build & encrypt a minimal readable PDF
	rawPDF := buildMinimalTextPDF("2026-08-10 Coffee Shop -25.00")
	conf := model.NewAESConfiguration("secret123", "owner123", 256)
	var encBuf bytes.Buffer
	require.NoError(t, pdfcpuapi.Encrypt(t.Context(), bytes.NewReader(rawPDF), &encBuf, conf))
	encPDF := encBuf.Bytes()

	wfGRPC, _, _ := dialWorkflowGRPC(t, d)
	ctx := authSpaceCtx(token, spaceID)

	stmtFlow, err := wfGRPC.GetFlow(ctx, &workflowv1.GetFlowRequest{Id: "system.finance.statement_ingestion"})
	require.NoError(t, err)
	stmtFlow.Config = &workflowv1.Flow_Config{
		DefaultModel: &workflowv1.ModelConfig{
			ModelName: new("gpt-4o"),
		},
	}
	_, err = wfGRPC.UpdateFlow(ctx, &workflowv1.UpdateFlowRequest{
		Id:         stmtFlow.GetId(),
		Flow:       stmtFlow,
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"config"}},
	})
	require.NoError(t, err)

	// 1. Execute without password -> returns needs_password: true without calling LLM
	noPWRun, err := wfGRPC.ExecuteFlow(ctx, &workflowv1.ExecuteFlowRequest{
		Id: "system.finance.statement_ingestion",
		Input: mustStructPB(t, map[string]any{
			"filename":     "aug_stmt.pdf",
			"content_type": "application/pdf",
		}),
		Artifacts: []*workflowv1.InlineArtifact{
			{
				Filename:    "aug_stmt.pdf",
				ContentType: "application/pdf",
				Data:        encPDF,
				FieldName:   new("document"),
			},
		},
	})
	require.NoError(t, err)
	assert.Equal(t, "completed", noPWRun.GetStatus())
	assert.True(t, noPWRun.GetOutput().GetFields()["needs_password"].GetBoolValue())
	assert.Equal(t, 0, mock.RequestCount())

	// 2. Execute with valid password -> decrypts, calls LLM, and stages Finance Statement draft
	withPWRun, err := wfGRPC.ExecuteFlow(ctx, &workflowv1.ExecuteFlowRequest{
		Id: "system.finance.statement_ingestion",
		Input: mustStructPB(t, map[string]any{
			"filename":     "aug_stmt.pdf",
			"content_type": "application/pdf",
			"password":     "secret123",
			"dry_run":      false,
		}),
		Artifacts: []*workflowv1.InlineArtifact{
			{
				Filename:    "aug_stmt.pdf",
				ContentType: "application/pdf",
				Data:        encPDF,
				FieldName:   new("document"),
			},
		},
	})
	require.NoError(t, err)
	assert.Equal(t, "completed", withPWRun.GetStatus())
	assert.Equal(t, 1, mock.RequestCount())

	createdStmts := withPWRun.GetOutput().GetFields()["created_statements"].GetListValue().GetValues()
	require.Len(t, createdStmts, 1)
	stmtFields := createdStmts[0].GetStructValue().GetFields()
	assert.True(t, strings.HasPrefix(stmtFields["id"].GetStringValue(), "stmt_"))
	assert.Equal(t, chaseAccID, stmtFields["account_id"].GetStringValue())

	// Confirm the draft was persisted in PostgreSQL via FinanceService
	d.Finance().ListStatements(t, nil, func(tb testing.TB, stmts []*financev1.Statement) {
		require.Len(tb, stmts, 1)
		assert.Equal(tb, stmtFields["id"].GetStringValue(), stmts[0].GetId())
		assert.Equal(tb, financev1.Statement_IN_PROGRESS, stmts[0].GetStatus())
	})
}
