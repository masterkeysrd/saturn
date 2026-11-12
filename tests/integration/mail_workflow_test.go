//go:build integration

package integration_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	mailv1 "github.com/masterkeysrd/saturn/apis/saturn/mail/v1"
	connectorv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/connector/v1"
	spacev1 "github.com/masterkeysrd/saturn/apis/saturn/space/v1"
	appmail "github.com/masterkeysrd/saturn/internal/application/mail"
	"github.com/masterkeysrd/saturn/tests/driver"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func TestMailWorkflow_EndToEnd(t *testing.T) {
	d := driver.New(t, testEnv)

	// 1. Authenticate owner user and create primary workspace
	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().Ensure(t, "Mail Test Workspace")

	ownerToken := d.State().AccessToken
	spaceID := d.State().SpaceID

	// 2. Connect to gRPC server via Unix socket to test full interceptor chain
	conn, err := grpc.NewClient("unix:"+d.Env().SocketPath,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(t, err)
	defer func() { _ = conn.Close() }()

	mailClient := mailv1.NewMailServiceClient(conn)
	connClient := connectorv1.NewConnectorServiceClient(conn)

	// Context helper with metadata
	authCtx := func(token, sID string) context.Context {
		md := metadata.New(map[string]string{
			"authorization": "Bearer " + token,
			"space-id":      sID,
		})
		return metadata.NewOutgoingContext(context.Background(), md)
	}

	ctx := authCtx(ownerToken, spaceID)

	// 3. Connect External Google Account with Mail capability
	initRes, err := connClient.InitiateOAuth(ctx, &connectorv1.InitiateOAuthRequest{
		Provider:     "google",
		ReturnUrl:    "http://localhost:8080/settings",
		Capabilities: []string{"mail", "calendar"},
	})
	require.NoError(t, err)
	assert.NotEmpty(t, initRes.GetAuthUrl())

	// Simulate OAuth callback code exchange
	_, err = d.HTTPClient().Get(d.Env().ServerURL + "/api/v1/platform/connectors/oauth/google/callback?code=mock_auth_code&state=" + initRes.GetState())
	require.NoError(t, err)

	// Verify connected account exists
	accsRes, err := connClient.ListConnectedAccounts(ctx, &connectorv1.ListConnectedAccountsRequest{})
	require.NoError(t, err)
	require.NotEmpty(t, accsRes.GetAccounts())
	connectedAccID := accsRes.GetAccounts()[0].GetId()

	// 4. Trigger Mail Sync on Coordinator
	err = d.Env().MailCoordinator().SyncConnectedAccountMail(ctx, &appmail.SyncConnectedAccountMailRequest{
		SpaceID:            spaceID,
		ConnectedAccountID: connectedAccID,
	})
	require.NoError(t, err)

	// 5. Verify Mailboxes listed via gRPC
	mbxRes, err := mailClient.ListMailboxes(ctx, &mailv1.ListMailboxesRequest{})
	require.NoError(t, err)
	assert.NotEmpty(t, mbxRes.GetMailboxes())

	// 6. Verify Unified Space Inbox listing
	threadsRes, err := mailClient.ListThreads(ctx, &mailv1.ListThreadsRequest{
		SystemBucket: mailv1.MailboxRole_MAILBOX_ROLE_INBOX,
	})
	require.NoError(t, err)
	require.NotEmpty(t, threadsRes.GetThreads())
	syncedThread := threadsRes.GetThreads()[0]
	assert.True(t, syncedThread.GetInInbox())
	assert.Equal(t, "Mock Thread Subject", syncedThread.GetSubject())

	// 7. Verify Hybrid Search hydration
	searchRes, err := mailClient.ListThreads(ctx, &mailv1.ListThreadsRequest{
		Query: "Mock",
	})
	require.NoError(t, err)
	require.NotEmpty(t, searchRes.GetThreads())
	assert.Contains(t, searchRes.GetThreads()[0].GetSubject(), "Mock")

	// 8. Verify GetThread hydrates messages, body cache, and signed attachment URLs
	threadView, err := mailClient.GetThread(ctx, &mailv1.GetThreadRequest{
		Id: syncedThread.GetId(),
	})
	require.NoError(t, err)
	assert.Equal(t, syncedThread.GetId(), threadView.GetId())
	require.NotEmpty(t, threadView.GetMessages())
	assert.NotEmpty(t, threadView.GetMessages()[0].GetBodyHtml())

	// 9. Write-through to Google: ModifyThread (Star and Archive)
	inInbox := false
	isStarred := true
	modifiedThread, err := mailClient.ModifyThread(ctx, &mailv1.ModifyThreadRequest{
		Id:        syncedThread.GetId(),
		InInbox:   &inInbox,
		IsStarred: &isStarred,
	})
	require.NoError(t, err)
	assert.False(t, modifiedThread.GetInInbox())
	assert.True(t, modifiedThread.GetIsStarred())

	// 10. Draft Lifecycle: Create -> Update -> Send -> Thread Update
	createdDraft, err := mailClient.CreateDraft(ctx, &mailv1.CreateDraftRequest{
		Draft: &mailv1.Draft{
			ConnectedAccountId: connectedAccID,
			Mode:               mailv1.DraftMode_DRAFT_MODE_REPLY,
			ThreadId:           syncedThread.GetId(),
			Subject:            "Re: Mock Thread Subject",
			BodyHtml:           "<p>This is an automated reply test.</p>",
			To: []*mailv1.Participant{
				{Name: "Sender", Email: "sender@example.com"},
			},
		},
	})
	require.NoError(t, err)
	assert.NotEmpty(t, createdDraft.GetId())

	// Update draft
	updatedDraft, err := mailClient.UpdateDraft(ctx, &mailv1.UpdateDraftRequest{
		Id: createdDraft.GetId(),
		Draft: &mailv1.Draft{
			Subject:  "Re: Mock Thread Subject (Updated)",
			BodyHtml: "<p>Updated automated reply content.</p>",
		},
	})
	require.NoError(t, err)
	assert.Equal(t, "Re: Mock Thread Subject (Updated)", updatedDraft.GetSubject())

	// Send draft
	sentMsg, err := mailClient.SendDraft(ctx, &mailv1.SendDraftRequest{
		Id: createdDraft.GetId(),
	})
	require.NoError(t, err)
	assert.NotEmpty(t, sentMsg.GetId())

	// 11. Viewer Role Mutation Denial
	t.Run("viewer role mutation denial", func(t *testing.T) {
		// Register and approve Viewer User
		userBEmail := fmt.Sprintf("viewer_%d@saturn.local", time.Now().UnixNano())
		userBPass := "Password123!"
		uB, err := d.Auth().RegisterUser(t, driver.RegisterUserOptions{
			Name:     "Viewer Bob",
			Email:    userBEmail,
			Username: fmt.Sprintf("viewer_%d", time.Now().UnixNano()),
			Password: userBPass,
		})
		require.NoError(t, err)

		_, err = d.Auth().ApproveUser(t, uB.GetId())
		require.NoError(t, err)

		// Owner adds User B as viewer
		d.State().AccessToken = ownerToken
		_, err = d.Space().CreateSpaceMember(t, spaceID, uB.GetId(), spacev1.SpaceMember_VIEWER)
		require.NoError(t, err)

		loginB, err := d.Auth().LoginAs(t, userBEmail, userBPass)
		require.NoError(t, err)
		viewerToken := loginB.GetAccessToken()

		viewerCtx := authCtx(viewerToken, spaceID)

		// Viewer CAN read threads
		_, err = mailClient.ListThreads(viewerCtx, &mailv1.ListThreadsRequest{})
		require.NoError(t, err)

		// Viewer CANNOT modify threads
		_, err = mailClient.ModifyThread(viewerCtx, &mailv1.ModifyThreadRequest{
			Id:        syncedThread.GetId(),
			IsStarred: &isStarred,
		})
		require.Error(t, err)
		st, ok := status.FromError(err)
		require.True(t, ok)
		assert.Equal(t, codes.PermissionDenied, st.Code())

		// Viewer CANNOT create drafts
		_, err = mailClient.CreateDraft(viewerCtx, &mailv1.CreateDraftRequest{
			Draft: &mailv1.Draft{
				ConnectedAccountId: connectedAccID,
				Subject:            "Forbidden Draft",
			},
		})
		require.Error(t, err)
		st, ok = status.FromError(err)
		require.True(t, ok)
		assert.Equal(t, codes.PermissionDenied, st.Code())
	})
}
