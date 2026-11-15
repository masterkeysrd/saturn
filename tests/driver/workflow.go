//go:build integration

package driver

import (
	"testing"

	"github.com/masterkeysrd/saturn/apis/saturn"
	workflowv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/workflow/v1"
)

// WorkflowDriver provides helper methods for interacting with WorkflowService in integration tests.
type WorkflowDriver struct {
	driver      *Driver
	client      *workflowv1.Client
	lastToken   string
	lastSpaceID string
}

// Client returns a cached HTTP SDK client configured with the current user token and active space ID.
func (w *WorkflowDriver) Client() *workflowv1.Client {
	if w.client == nil || w.lastToken != w.driver.state.AccessToken || w.lastSpaceID != w.driver.state.SpaceID {
		w.lastToken = w.driver.state.AccessToken
		w.lastSpaceID = w.driver.state.SpaceID
		w.client = workflowv1.NewClient(saturn.Config{
			BaseURL:     w.driver.env.ServerURL,
			AccessToken: w.lastToken,
			SpaceID:     w.lastSpaceID,
			HTTPClient:  w.driver.httpClient,
		})
	}
	return w.client
}

// ListFlows returns all flows for the active workspace, lazily seeding system blueprints.
func (w *WorkflowDriver) ListFlows(tb testing.TB, req *workflowv1.ListFlowsRequest) *workflowv1.ListFlowsResponse {
	tb.Helper()
	if req == nil {
		req = &workflowv1.ListFlowsRequest{}
	}
	resp, err := w.Client().ListFlows(tb.Context(), req)
	if err != nil {
		tb.Fatalf("ListFlows failed: %v", err)
	}
	return resp
}

// GetFlow fetches a flow by flw_... ID or system.* key.
func (w *WorkflowDriver) GetFlow(tb testing.TB, id string) *workflowv1.Flow {
	tb.Helper()
	resp, err := w.Client().GetFlow(tb.Context(), &workflowv1.GetFlowRequest{Id: id})
	if err != nil {
		tb.Fatalf("GetFlow(%q) failed: %v", id, err)
	}
	return resp
}
