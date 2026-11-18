package mail_test

import (
	"context"
	"testing"
	"time"

	appmail "github.com/masterkeysrd/saturn/internal/application/mail"
	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/crypto"
)

type mockEventPublisher struct {
	published []struct {
		topic string
		event any
	}
}

func (m *mockEventPublisher) Publish(_ context.Context, topic string, event any) error {
	m.published = append(m.published, struct {
		topic string
		event any
	}{topic: topic, event: event})
	return nil
}

func TestCoordinator_SyncConnectedAccountMail_Events(t *testing.T) {
	now := time.Now().UTC()
	cipher, err := crypto.NewCipher("01234567890123456789012345678901")
	if err != nil {
		t.Fatalf("NewCipher failed: %v", err)
	}
	encAccess, err := cipher.Encrypt("tok_access")
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}
	encRefresh, err := cipher.Encrypt("tok_refresh")
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	tests := []struct {
		name          string
		initialCursor *string
		expiredCursor bool
		existingMsg   bool
		isDraft       bool
		wantEvents    int
	}{
		{
			name:          "Initial 90-day bootstrap (nil cursor) emits zero events",
			initialCursor: nil,
			wantEvents:    0,
		},
		{
			name:          "Expired cursor re-bootstrap emits zero events",
			initialCursor: new("old_cursor"),
			expiredCursor: true,
			wantEvents:    0,
		},
		{
			name:          "Delta sync emits event for newly inserted inbound message",
			initialCursor: new("hist_100"),
			wantEvents:    1,
		},
		{
			name:          "Delta sync skips already-existing message",
			initialCursor: new("hist_100"),
			existingMsg:   true,
			wantEvents:    0,
		},
		{
			name:          "Delta sync skips outbound/draft messages",
			initialCursor: new("hist_100"),
			isDraft:       true,
			wantEvents:    0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			events := &mockEventPublisher{}
			mbxStore := newMockMailboxStore()
			thStore := newMockThreadStore()
			msgStore := newMockMessageStore()
			dftStore := newMockDraftStore()
			syncStore := newMockSyncStateStore()
			accStore := &mockAccountStore{
				accounts: map[string]*connector.ConnectedAccount{
					"cac_1": {
						ID:                  "cac_1",
						SpaceID:             "spc_1",
						Provider:            "google",
						Status:              connector.AccountStatusHealthy,
						EnabledCapabilities: []string{string(connector.CapabilityMail)},
						AccessTokenEnc:      encAccess,
						RefreshTokenEnc:     encRefresh,
						TokenExpiry:         now.Add(time.Hour),
					},
				},
			}

			if tc.initialCursor != nil {
				_ = syncStore.Upsert(t.Context(), &domainmail.SyncState{
					ConnectedAccountID: "cac_1",
					SpaceID:            "spc_1",
					WindowDays:         90,
					SyncCursor:         tc.initialCursor,
				})
			}

			if tc.existingMsg {
				_ = msgStore.Upsert(t.Context(), &domainmail.Message{
					ID:                 "msg_existing",
					SpaceID:            "spc_1",
					ConnectedAccountID: "cac_1",
					ThreadID:           "mth_tmp",
					ProviderMessageID:  new("prov_msg_1"),
					ReceivedAt:         now,
				})
			}

			firstCall := true
			extProv := &mockExternalMailProvider{
				syncThreadsFunc: func(_ context.Context, _ string, _ *domainmail.SyncThreadsRequest) (*domainmail.SyncThreadsResult, error) {
					if firstCall && tc.expiredCursor {
						firstCall = false
						return &domainmail.SyncThreadsResult{ExpiredCursor: true}, nil
					}
					return &domainmail.SyncThreadsResult{
						NewSyncCursor: "hist_200",
						Threads: []*domainmail.Thread{
							{ID: "mth_tmp", Subject: "Invoice"},
						},
						Messages: []*domainmail.Message{
							{
								ID:                "msg_tmp",
								ThreadID:          "mth_tmp",
								ProviderMessageID: new("prov_msg_1"),
								Subject:           "Invoice",
								IsDraft:           tc.isDraft,
								ReceivedAt:        now,
							},
						},
						Bodies: []*domainmail.MessageBody{
							{MessageID: "msg_tmp", PlainText: "Invoice total $42.00"},
						},
					}, nil
				},
			}

			tokenMgr := connector.NewTokenManager(accStore, cipher, connector.NewProviderRegistry(), nil)
			svc := domainmail.NewService(domainmail.Dependencies{
				MailboxStore:   mbxStore,
				ThreadStore:    thStore,
				MessageStore:   msgStore,
				DraftStore:     dftStore,
				SyncStateStore: syncStore,
			})

			coord := appmail.NewCoordinator(appmail.Dependencies{
				DomainService:     svc,
				MailboxStore:      mbxStore,
				ThreadStore:       thStore,
				MessageStore:      msgStore,
				DraftStore:        dftStore,
				SyncStateStore:    syncStore,
				AccountStore:      accStore,
				TokenManager:      tokenMgr,
				ExternalProviders: map[string]domainmail.ExternalMailProvider{"google": extProv},
				Events:            events,
				HMACSecret:        []byte("test-super-secret-hmac-key-32bytes"),
			})

			if err := coord.SyncConnectedAccountMail(t.Context(), &appmail.SyncConnectedAccountMailRequest{
				SpaceID:            "spc_1",
				ConnectedAccountID: "cac_1",
			}); err != nil {
				t.Fatalf("SyncConnectedAccountMail failed: %v", err)
			}

			if len(events.published) != tc.wantEvents {
				t.Fatalf("expected %d published events, got %d", tc.wantEvents, len(events.published))
			}
			if tc.wantEvents > 0 {
				if events.published[0].topic != domainmail.TopicMessageReceived {
					t.Errorf("expected topic %q, got %q", domainmail.TopicMessageReceived, events.published[0].topic)
				}
				ev, ok := events.published[0].event.(*domainmail.MessageReceivedEvent)
				if !ok || ev.BodyPlain != "Invoice total $42.00" {
					t.Errorf("unexpected published payload: %+v", events.published[0].event)
				}
			}
		})
	}
}

func TestCoordinator_SyncConnectedAccountMail_NilAccount(t *testing.T) {
	accStore := &mockAccountStore{accounts: map[string]*connector.ConnectedAccount{}}
	coord := appmail.NewCoordinator(appmail.Dependencies{
		AccountStore: accStore,
	})
	err := coord.SyncConnectedAccountMail(t.Context(), &appmail.SyncConnectedAccountMailRequest{
		SpaceID:            "spc_1",
		ConnectedAccountID: "cac_missing",
	})
	if err != nil {
		t.Fatalf("expected nil error for missing account, got %v", err)
	}
}
