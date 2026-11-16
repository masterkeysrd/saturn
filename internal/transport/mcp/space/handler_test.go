package mcpspace

import (
	"context"
	"encoding/json/v2"
	"testing"

	spaceapp "github.com/masterkeysrd/saturn/internal/application/space"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	mcptransport "github.com/masterkeysrd/saturn/internal/transport/mcp"
	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestSpaceHandler(t *testing.T) {
	tests := []struct {
		name         string
		ctx          context.Context
		setupMocks   func(agg *SpaceAggregatorMock, coord *SpaceSettingsCoordinatorMock)
		wantVisible  bool
		wantToolErr  bool
		wantTimezone string
		wantName     string
	}{
		{
			name: "success with workspace timezone",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1"}),
				"spc_1",
				string(space.RoleMember),
			),
			setupMocks: func(agg *SpaceAggregatorMock, coord *SpaceSettingsCoordinatorMock) {
				agg.GetSpaceFunc = func(_ context.Context, sid space.SpaceID, uid space.UserID) (*space.Space, error) {
					if sid != "spc_1" || uid != "usr_1" {
						t.Errorf("unexpected args: sid=%s uid=%s", sid, uid)
					}
					return &space.Space{
						ID:          "spc_1",
						Name:        "Personal",
						Description: "My workspace",
					}, nil
				}
				coord.GetSettingsFunc = func(_ context.Context, _ *spaceapp.GetSettingsRequest) (*settings.Entry[space.Settings], error) {
					return &settings.Entry[space.Settings]{
						Value: space.Settings{Timezone: "America/New_York"},
					}, nil
				}
			},
			wantVisible:  true,
			wantTimezone: "America/New_York",
			wantName:     "Personal",
		},
		{
			name: "viewer sees space_get_context",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_2"}),
				"spc_2",
				string(space.RoleViewer),
			),
			setupMocks: func(agg *SpaceAggregatorMock, coord *SpaceSettingsCoordinatorMock) {
				agg.GetSpaceFunc = func(_ context.Context, _ space.SpaceID, _ space.UserID) (*space.Space, error) {
					return &space.Space{ID: "spc_2", Name: "Shared"}, nil
				}
				coord.GetSettingsFunc = func(_ context.Context, _ *spaceapp.GetSettingsRequest) (*settings.Entry[space.Settings], error) {
					return nil, errors.E(errors.NotExist, "not configured")
				}
			},
			wantVisible:  true,
			wantTimezone: "UTC",
			wantName:     "Shared",
		},
		{
			name: "API key without spaces:read hides tool",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{
					Subject:  "usr_1",
					APIKeyID: "apk_1",
					Scopes:   []string{string(identity.ScopeFinanceRead)},
				}),
				"spc_1",
				string(space.RoleMember),
			),
			wantVisible: false,
		},
		{
			name: "propagates domain error",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1"}),
				"spc_1",
				string(space.RoleMember),
			),
			setupMocks: func(agg *SpaceAggregatorMock, _ *SpaceSettingsCoordinatorMock) {
				agg.GetSpaceFunc = func(_ context.Context, _ space.SpaceID, _ space.UserID) (*space.Space, error) {
					return nil, errors.E(errors.Permission, "access denied")
				}
			},
			wantVisible: true,
			wantToolErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			agg := &SpaceAggregatorMock{}
			coord := &SpaceSettingsCoordinatorMock{}
			if tc.setupMocks != nil {
				tc.setupMocks(agg, coord)
			}

			srv := mcptransport.NewServer(mcptransport.ServerConfig{})
			NewHandler(Dependencies{Aggregator: agg, Coordinator: coord}).Register(srv.Registry())

			session, err := srv.ConnectInMemory(tc.ctx)
			if err != nil {
				t.Fatalf("ConnectInMemory failed: %v", err)
			}
			defer func() { _ = session.Close() }()

			tools, err := session.ListTools(context.Background(), &sdkmcp.ListToolsParams{})
			if err != nil {
				t.Fatalf("ListTools failed: %v", err)
			}
			if !tc.wantVisible {
				if len(tools.Tools) != 0 {
					t.Fatalf("expected 0 tools, got %d", len(tools.Tools))
				}
				return
			}
			if len(tools.Tools) != 1 || tools.Tools[0].Name != "space_get_context" {
				t.Fatalf("unexpected tools: %+v", tools.Tools)
			}

			callRes, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
				Name:      "space_get_context",
				Arguments: map[string]any{},
			})
			if err != nil {
				t.Fatalf("CallTool failed: %v", err)
			}
			if tc.wantToolErr {
				if !callRes.IsError {
					t.Fatal("expected tool IsError=true")
				}
				return
			}
			if callRes.IsError {
				t.Fatalf("unexpected tool error: %+v", callRes.Content)
			}

			out, ok := callRes.StructuredContent.(map[string]any)
			if !ok {
				t.Fatalf("expected StructuredContent map, got %T", callRes.StructuredContent)
			}
			if out["timezone"] != tc.wantTimezone || out["name"] != tc.wantName {
				t.Errorf("got %v, want name=%q tz=%q", out, tc.wantName, tc.wantTimezone)
			}

			res, err := session.ReadResource(context.Background(), &sdkmcp.ReadResourceParams{URI: "saturn://space/context"})
			if err != nil {
				t.Fatalf("ReadResource failed: %v", err)
			}
			var decoded SpaceContextOutput
			if err := json.Unmarshal([]byte(res.Contents[0].Text), &decoded); err != nil {
				t.Fatalf("unmarshal resource: %v", err)
			}
			if decoded.Timezone != tc.wantTimezone {
				t.Errorf("resource timezone = %q, want %q", decoded.Timezone, tc.wantTimezone)
			}
		})
	}
}
