//go:build integration

package integration_test

import (
	"context"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/mail"
	mailstorage "github.com/masterkeysrd/saturn/internal/domain/mail/storage"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/crypto"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/migrations"
	"github.com/masterkeysrd/saturn/tests/driver"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMailMigrationUpDown(t *testing.T) {
	d := driver.New(t, testEnv)
	ctx := context.Background()

	// 1. Verify 053 tables exist initially
	tables := []string{
		"sync_states",
		"mailboxes",
		"threads",
		"messages",
		"message_bodies",
		"drafts",
	}

	for _, tbl := range tables {
		var exists bool
		err := d.Env().DB.GetContext(ctx, &exists, `
			SELECT EXISTS (
				SELECT FROM information_schema.tables 
				WHERE table_schema = 'mail' AND table_name = $1
			)
		`, tbl)
		require.NoError(t, err)
		assert.Truef(t, exists, "mail.%s must exist initially", tbl)
	}

	// 2. Roll back migration 053 (down to 052)
	err := migrations.DownTo(d.Env().DB.DB, 52)
	require.NoError(t, err, "migration down must succeed")

	// Verify tables dropped
	for _, tbl := range tables {
		var exists bool
		err := d.Env().DB.GetContext(ctx, &exists, `
			SELECT EXISTS (
				SELECT FROM information_schema.tables 
				WHERE table_schema = 'mail' AND table_name = $1
			)
		`, tbl)
		require.NoError(t, err)
		assert.Falsef(t, exists, "mail.%s must be dropped after migration down", tbl)
	}

	// 3. Migrate back up to 053
	err = migrations.Migrate(d.Env().DB.DB)
	require.NoError(t, err, "migration up must succeed")

	for _, tbl := range tables {
		var exists bool
		err := d.Env().DB.GetContext(ctx, &exists, `
			SELECT EXISTS (
				SELECT FROM information_schema.tables 
				WHERE table_schema = 'mail' AND table_name = $1
			)
		`, tbl)
		require.NoError(t, err)
		assert.Truef(t, exists, "mail.%s must exist after migrating up", tbl)
	}
}

func TestMailStore_UnifiedInbox_FTS_TTL_And_Purge(t *testing.T) {
	d := driver.New(t, testEnv)
	ctx := context.Background()

	d.Auth().CreateApprovedUser(t).Login(t)
	d.Space().Ensure(t, "Mail Test Space")
	spaceID := d.State().SpaceID
	userID := d.State().UserID

	dbClient := db.New(d.Env().DB)
	mbxStore := mailstorage.NewMailboxStore(dbClient)
	threadStore := mailstorage.NewThreadStore(dbClient)
	msgStore := mailstorage.NewMessageStore(dbClient)
	draftStore := mailstorage.NewDraftStore(dbClient)
	syncStore := mailstorage.NewSyncStateStore(dbClient)

	mailService := mail.NewService(mail.Dependencies{
		MailboxStore:   mbxStore,
		ThreadStore:    threadStore,
		MessageStore:   msgStore,
		DraftStore:     draftStore,
		SyncStateStore: syncStore,
	})
	connector.RegisterCleaner(connector.CapabilityMail, func(ctx context.Context, spaceID, accountID string) error {
		return mailService.PurgeConnectedAccountData(ctx, spaceID, accountID)
	})

	cipher, err := crypto.NewCipher("test-master-encryption-key-32b!!")
	require.NoError(t, err)
	encAccess, _ := cipher.Encrypt("access-token-mail")
	encRefresh, _ := cipher.Encrypt("refresh-token-mail")
	connectorStore := connector.NewStore(dbClient)

	// Create 2 connected accounts for Unified Inbox testing
	acc1 := &connector.ConnectedAccount{
		SpaceID:             spaceID,
		CreatedByUserID:     userID,
		Provider:            "google",
		ProviderAccountID:   "user_google_mail_1",
		Email:               "user1_mail@gmail.com",
		AccessTokenEnc:      encAccess,
		RefreshTokenEnc:     encRefresh,
		TokenExpiry:         time.Now().Add(1 * time.Hour),
		GrantedScopes:       []string{"https://www.googleapis.com/auth/gmail.modify"},
		EnabledCapabilities: []string{"mail"},
		Status:              connector.AccountStatusHealthy,
	}
	require.NoError(t, connectorStore.CreateAccount(ctx, acc1))

	acc2 := &connector.ConnectedAccount{
		SpaceID:             spaceID,
		CreatedByUserID:     userID,
		Provider:            "google",
		ProviderAccountID:   "user_google_mail_2",
		Email:               "user2_work@gmail.com",
		AccessTokenEnc:      encAccess,
		RefreshTokenEnc:     encRefresh,
		TokenExpiry:         time.Now().Add(1 * time.Hour),
		GrantedScopes:       []string{"https://www.googleapis.com/auth/gmail.modify"},
		EnabledCapabilities: []string{"mail"},
		Status:              connector.AccountStatusHealthy,
	}
	require.NoError(t, connectorStore.CreateAccount(ctx, acc2))

	// 1. Create SyncStates
	cursor1 := "hist_1001"
	require.NoError(t, syncStore.Upsert(ctx, &mail.SyncState{
		ConnectedAccountID: acc1.ID,
		SpaceID:            spaceID,
		SyncCursor:         &cursor1,
		WindowDays:         90,
	}))

	cursor2 := "hist_2001"
	require.NoError(t, syncStore.Upsert(ctx, &mail.SyncState{
		ConnectedAccountID: acc2.ID,
		SpaceID:            spaceID,
		SyncCursor:         &cursor2,
		WindowDays:         90,
	}))

	// 2. Create Mailboxes for both accounts
	mbx1ID, _ := mail.GenerateMailboxID()
	require.NoError(t, mbxStore.Create(ctx, &mail.Mailbox{
		ID:                 mbx1ID,
		SpaceID:            spaceID,
		ConnectedAccountID: acc1.ID,
		Name:               "Inbox",
		SystemRole:         mail.SystemBucketInbox,
	}))

	mbx2ID, _ := mail.GenerateMailboxID()
	require.NoError(t, mbxStore.Create(ctx, &mail.Mailbox{
		ID:                 mbx2ID,
		SpaceID:            spaceID,
		ConnectedAccountID: acc2.ID,
		Name:               "Inbox",
		SystemRole:         mail.SystemBucketInbox,
	}))

	// 3. Unified Space Inbox pagination across 2 ConnectedAccounts
	baseTime := time.Date(2025, 2, 10, 10, 0, 0, 0, time.UTC)
	for i := range 5 {
		thID, _ := mail.GenerateThreadID()
		require.NoError(t, threadStore.Create(ctx, &mail.Thread{
			ID:                 thID,
			SpaceID:            spaceID,
			ConnectedAccountID: acc1.ID,
			Subject:            "Account 1 Thread",
			Snippet:            "Account 1 Snippet",
			InInbox:            true,
			LastMessageAt:      baseTime.Add(time.Duration(i*2) * time.Hour),
		}))
	}

	for i := range 5 {
		thID, _ := mail.GenerateThreadID()
		require.NoError(t, threadStore.Create(ctx, &mail.Thread{
			ID:                 thID,
			SpaceID:            spaceID,
			ConnectedAccountID: acc2.ID,
			Subject:            "Account 2 Thread",
			Snippet:            "Account 2 Snippet",
			InInbox:            true,
			LastMessageAt:      baseTime.Add(time.Duration(i*2+1) * time.Hour),
		}))
	}

	inboxBucket := mail.SystemBucketInbox

	// Query page 1 (5 items)
	page1, err := threadStore.ListBySpace(ctx, spaceID, &mail.ListThreadsFilter{
		SystemBucket: &inboxBucket,
		Limit:        5,
		Offset:       0,
	})
	require.NoError(t, err)
	require.Len(t, page1, 5)

	// Verify chronological ordering (descending)
	for i := 0; i < len(page1)-1; i++ {
		assert.True(t, page1[i].LastMessageAt.After(page1[i+1].LastMessageAt) || page1[i].LastMessageAt.Equal(page1[i+1].LastMessageAt))
	}

	// Verify items from both accounts are present across the unified space inbox
	totalCount, err := threadStore.CountBySpace(ctx, spaceID, &mail.ListThreadsFilter{
		SystemBucket: &inboxBucket,
	})
	require.NoError(t, err)
	assert.Equal(t, 10, totalCount)

	// Filtering by specific connected account
	acc1Threads, err := threadStore.ListBySpace(ctx, spaceID, &mail.ListThreadsFilter{
		ConnectedAccountID: &acc1.ID,
		SystemBucket:       &inboxBucket,
	})
	require.NoError(t, err)
	assert.Len(t, acc1Threads, 5)
	for _, th := range acc1Threads {
		assert.Equal(t, acc1.ID, th.ConnectedAccountID)
	}

	// 4. search_tsv FTS ranking test
	// Thread A: Subject contains query terms (higher weight 'A')
	thAID, _ := mail.GenerateThreadID()
	require.NoError(t, threadStore.Create(ctx, &mail.Thread{
		ID:                 thAID,
		SpaceID:            spaceID,
		ConnectedAccountID: acc1.ID,
		Subject:            "Urgent Architecture Milestone Review",
		Snippet:            "General discussion summary here",
		LastMessageAt:      baseTime.Add(20 * time.Hour),
	}))

	// Thread B: Subject has general text, Snippet contains query terms (lower weight 'B')
	thBID, _ := mail.GenerateThreadID()
	require.NoError(t, threadStore.Create(ctx, &mail.Thread{
		ID:                 thBID,
		SpaceID:            spaceID,
		ConnectedAccountID: acc1.ID,
		Subject:            "General Meeting Notes",
		Snippet:            "We conducted an urgent architecture milestone review today",
		LastMessageAt:      baseTime.Add(25 * time.Hour), // Later timestamp, but lower search rank
	}))

	ftsResults, err := threadStore.ListBySpace(ctx, spaceID, &mail.ListThreadsFilter{
		Query: "Urgent Architecture Milestone",
	})
	require.NoError(t, err)
	require.True(t, len(ftsResults) >= 2)

	// Thread A must rank higher than Thread B despite Thread B having a later LastMessageAt
	assert.Equal(t, thAID, ftsResults[0].ID, "Thread with query terms in Subject should rank first")
	assert.Equal(t, thBID, ftsResults[1].ID, "Thread with query terms in Snippet should rank second")

	// 5. TTL Body eviction test
	msg1ID, _ := mail.GenerateMessageID()
	require.NoError(t, msgStore.Create(ctx, &mail.Message{
		ID:                 msg1ID,
		SpaceID:            spaceID,
		ConnectedAccountID: acc1.ID,
		ThreadID:           thAID,
		ReceivedAt:         baseTime,
		Subject:            "Msg 1",
	}))

	msg2ID, _ := mail.GenerateMessageID()
	require.NoError(t, msgStore.Create(ctx, &mail.Message{
		ID:                 msg2ID,
		SpaceID:            spaceID,
		ConnectedAccountID: acc1.ID,
		ThreadID:           thAID,
		ReceivedAt:         baseTime,
		Subject:            "Msg 2",
	}))

	// Body 1: Expired
	require.NoError(t, msgStore.SaveBody(ctx, &mail.MessageBody{
		MessageID:     msg1ID,
		SpaceID:       spaceID,
		SanitizedHTML: "<p>Expired Body</p>",
		PlainText:     "Expired Body",
		ExpiresAt:     time.Now().Add(-2 * time.Hour),
	}))

	// Body 2: Valid
	require.NoError(t, msgStore.SaveBody(ctx, &mail.MessageBody{
		MessageID:     msg2ID,
		SpaceID:       spaceID,
		SanitizedHTML: "<p>Active Body</p>",
		PlainText:     "Active Body",
		ExpiresAt:     time.Now().Add(24 * time.Hour),
	}))

	evictedCount, err := msgStore.DeleteExpiredBodies(ctx, time.Now())
	require.NoError(t, err)
	assert.Equal(t, int64(1), evictedCount)

	body1, err := msgStore.GetBody(ctx, spaceID, msg1ID)
	require.NoError(t, err)
	assert.Nil(t, body1, "Expired body should have been deleted")

	body2, err := msgStore.GetBody(ctx, spaceID, msg2ID)
	require.NoError(t, err)
	require.NotNil(t, body2, "Active body should still exist")
	assert.Equal(t, "<p>Active Body</p>", body2.SanitizedHTML)

	// 6. DeleteByConnectedAccount and RegisterCapabilityCleaner purge test
	err = connector.DefaultCleanerRegistry.RunCleaners(ctx, spaceID, acc1.ID, connector.CapabilityMail)
	require.NoError(t, err)

	// Verify Account 1 data is completely wiped
	acc1RemainingThreads, err := threadStore.ListBySpace(ctx, spaceID, &mail.ListThreadsFilter{
		ConnectedAccountID: &acc1.ID,
	})
	require.NoError(t, err)
	assert.Empty(t, acc1RemainingThreads)

	acc1Sync, err := syncStore.Get(ctx, spaceID, acc1.ID)
	require.NoError(t, err)
	assert.Nil(t, acc1Sync)

	acc1Mailboxes, err := mbxStore.ListBySpace(ctx, spaceID, &mail.ListMailboxesFilter{
		ConnectedAccountID: &acc1.ID,
	})
	require.NoError(t, err)
	assert.Empty(t, acc1Mailboxes)

	// Verify Account 2 data is intact
	acc2RemainingThreads, err := threadStore.ListBySpace(ctx, spaceID, &mail.ListThreadsFilter{
		ConnectedAccountID: &acc2.ID,
	})
	require.NoError(t, err)
	assert.Len(t, acc2RemainingThreads, 5)

	acc2Sync, err := syncStore.Get(ctx, spaceID, acc2.ID)
	require.NoError(t, err)
	assert.NotNil(t, acc2Sync)
}
