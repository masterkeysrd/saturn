package mcpmail

import (
	"context"
	"testing"
	"time"

	mailaggregator "github.com/masterkeysrd/saturn/internal/aggregator/mail"
	mailapp "github.com/masterkeysrd/saturn/internal/application/mail"
	spaceapp "github.com/masterkeysrd/saturn/internal/application/space"
	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	mcptransport "github.com/masterkeysrd/saturn/internal/transport/mcp"
	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestMailHandler(t *testing.T) {
	tests := []struct {
		name       string
		toolName   string
		args       map[string]any
		setupMocks func(agg *MailAggregatorMock, coord *MailCoordinatorMock, ss *SpaceSettingsReaderMock)
		wantErr    bool
		assertOut  func(t *testing.T, out map[string]any)
	}{
		{
			name:     "list threads clamps limit and formats timestamp",
			toolName: "mail_list_threads",
			args:     map[string]any{"query": "invoice", "limit": 200},
			setupMocks: func(agg *MailAggregatorMock, _ *MailCoordinatorMock, ss *SpaceSettingsReaderMock) {
				ss.GetSettingsFunc = func(_ context.Context, _ *spaceapp.GetSettingsRequest) (*settings.Entry[space.Settings], error) {
					return &settings.Entry[space.Settings]{Value: space.Settings{Timezone: "UTC"}}, nil
				}
				agg.ListThreadsFunc = func(_ context.Context, _ string, filter *domainmail.ListThreadsFilter) ([]*domainmail.Thread, int, error) {
					if filter.Limit != maxThreadsLimit {
						t.Errorf("expected clamped limit %d, got %d", maxThreadsLimit, filter.Limit)
					}
					return []*domainmail.Thread{
						{
							ID:            "mth_1",
							Subject:       "April Invoice",
							Snippet:       "Attached is your invoice",
							Participants:  []domainmail.Participant{{Name: "Billing", Email: "billing@acme.com"}},
							MessageCount:  1,
							IsUnread:      true,
							LastMessageAt: time.Date(2026, 4, 15, 12, 0, 0, 0, time.UTC),
						},
					}, 1, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				ths := out["threads"].([]any)
				if len(ths) != 1 || ths[0].(map[string]any)["subject"] != "April Invoice" {
					t.Errorf("unexpected threads: %+v", ths)
				}
			},
		},
		{
			name:     "get thread hydrates messages",
			toolName: "mail_get_thread",
			args:     map[string]any{"id": "mth_1"},
			setupMocks: func(agg *MailAggregatorMock, _ *MailCoordinatorMock, ss *SpaceSettingsReaderMock) {
				ss.GetSettingsFunc = func(_ context.Context, _ *spaceapp.GetSettingsRequest) (*settings.Entry[space.Settings], error) {
					return nil, errors.E(errors.NotExist, "none")
				}
				agg.GetThreadFunc = func(_ context.Context, _, id string) (*mailaggregator.ThreadProjection, error) {
					if id != "mth_1" {
						return nil, errors.E(errors.NotExist, "not found")
					}
					return &mailaggregator.ThreadProjection{
						Thread: &domainmail.Thread{
							ID:                 "mth_1",
							ConnectedAccountID: "cac_1",
							Subject:            "Hello",
						},
						Messages: []*mailaggregator.MessageProjection{
							{
								Message: &domainmail.Message{
									ID:         "msg_1",
									From:       domainmail.Participant{Email: "alice@example.com"},
									Subject:    "Hello",
									ReceivedAt: time.Date(2026, 4, 15, 9, 0, 0, 0, time.UTC),
								},
								BodyPlain: "Hi there!",
							},
						},
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				msgs := out["messages"].([]any)
				if msgs[0].(map[string]any)["body_plain"] != "Hi there!" {
					t.Errorf("unexpected messages: %+v", msgs)
				}
			},
		},
		{
			name:     "create draft succeeds",
			toolName: "mail_create_draft",
			args: map[string]any{
				"connected_account_id": "cac_1",
				"to":                   []string{"bob@example.com"},
				"subject":              "Follow-up",
				"body_text":            "Checking in",
			},
			setupMocks: func(_ *MailAggregatorMock, coord *MailCoordinatorMock, _ *SpaceSettingsReaderMock) {
				coord.CreateDraftFunc = func(_ context.Context, req *mailapp.CreateDraftRequest) (*domainmail.Draft, error) {
					req.Draft.ID = "mdf_1"
					return req.Draft, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["id"] != "mdf_1" {
					t.Errorf("unexpected draft: %+v", out)
				}
			},
		},
		{
			name:     "archive thread modifies inbox flag",
			toolName: "mail_archive_thread",
			args:     map[string]any{"id": "mth_1"},
			setupMocks: func(_ *MailAggregatorMock, coord *MailCoordinatorMock, _ *SpaceSettingsReaderMock) {
				coord.ModifyThreadFunc = func(_ context.Context, req *mailapp.ModifyThreadRequest) (*domainmail.Thread, error) {
					if req.InInbox == nil || *req.InInbox {
						t.Errorf("expected InInbox=false, got %v", req.InInbox)
					}
					return &domainmail.Thread{ID: req.ID, InInbox: false}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["in_inbox"] != false {
					t.Errorf("expected in_inbox=false, got %+v", out)
				}
			},
		},
		{
			name:     "send message via existing draft_id",
			toolName: "mail_send_message",
			args:     map[string]any{"draft_id": "mdf_1"},
			setupMocks: func(_ *MailAggregatorMock, coord *MailCoordinatorMock, _ *SpaceSettingsReaderMock) {
				coord.SendDraftFunc = func(_ context.Context, req *mailapp.SendDraftRequest) (*domainmail.Message, error) {
					return &domainmail.Message{
						ID:       "msg_sent",
						ThreadID: "mth_1",
						Subject:  "Sent!",
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["message_id"] != "msg_sent" {
					t.Errorf("unexpected sent message: %+v", out)
				}
			},
		},
		{
			name:     "send message missing draft and recipient fails",
			toolName: "mail_send_message",
			args:     map[string]any{},
			wantErr:  true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			agg := &MailAggregatorMock{}
			coord := &MailCoordinatorMock{}
			ss := &SpaceSettingsReaderMock{}
			if tc.setupMocks != nil {
				tc.setupMocks(agg, coord, ss)
			}

			srv := mcptransport.NewServer(mcptransport.ServerConfig{})
			NewHandler(Dependencies{
				Aggregator:    agg,
				Coordinator:   coord,
				SpaceSettings: ss,
			}).Register(srv.Registry())

			ctx := auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1"}),
				"spc_1",
				string(space.RoleMember),
			)
			session, err := srv.ConnectInMemory(ctx)
			if err != nil {
				t.Fatalf("ConnectInMemory failed: %v", err)
			}
			defer func() { _ = session.Close() }()

			res, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
				Name:      tc.toolName,
				Arguments: tc.args,
			})
			if err != nil {
				t.Fatalf("CallTool failed: %v", err)
			}
			if tc.wantErr {
				if !res.IsError {
					t.Fatal("expected IsError=true")
				}
				return
			}
			if res.IsError {
				t.Fatalf("unexpected tool error: %+v", res.Content)
			}
			tc.assertOut(t, res.StructuredContent.(map[string]any))
		})
	}
}
