package mail

import (
	"context"
	"io"
	"time"
)

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

// MailboxStore defines persistence operations for Mailbox entities.
//
// @Mock
type MailboxStore interface {
	// Create persists a new Mailbox entity.
	Create(ctx context.Context, mailbox *Mailbox) error

	// GetByID retrieves a Mailbox by space ID and mailbox ID.
	GetByID(ctx context.Context, spaceID, id string) (*Mailbox, error)

	// GetByProviderID retrieves a mailbox by its upstream provider ID.
	GetByProviderID(ctx context.Context, spaceID, connectedAccountID, providerMailboxID string) (*Mailbox, error)

	// GetBySystemRole retrieves a system mailbox for a connected account.
	GetBySystemRole(ctx context.Context, spaceID, connectedAccountID string, role SystemBucket) (*Mailbox, error)

	// Update updates mutable attributes of an existing Mailbox.
	Update(ctx context.Context, mailbox *Mailbox) error

	// Delete removes a Mailbox.
	Delete(ctx context.Context, spaceID, id string) error

	// ListBySpace retrieves mailboxes matching optional filter criteria.
	ListBySpace(ctx context.Context, spaceID string, filter *ListMailboxesFilter) ([]*Mailbox, error)

	// Upsert inserts or updates a Mailbox entity.
	Upsert(ctx context.Context, mailbox *Mailbox) error

	// DeleteByConnectedAccount removes all mailboxes associated with a connected account.
	DeleteByConnectedAccount(ctx context.Context, spaceID, connectedAccountID string) error
}

// ListMailboxesFilter encapsulates filter options for listing mailboxes.
type ListMailboxesFilter struct {
	ConnectedAccountID *string
	SystemRole         *SystemBucket
}

// ThreadStore defines persistence operations for Thread entities.
//
// @Mock
type ThreadStore interface {
	// Create persists a new Thread entity.
	Create(ctx context.Context, thread *Thread) error

	// GetByID retrieves a Thread by space ID and thread ID.
	GetByID(ctx context.Context, spaceID, id string) (*Thread, error)

	// GetByProviderID retrieves a Thread by its upstream provider thread ID.
	GetByProviderID(ctx context.Context, spaceID, connectedAccountID, providerThreadID string) (*Thread, error)

	// Update updates mutable attributes of an existing Thread.
	Update(ctx context.Context, thread *Thread) error

	// Delete removes a Thread and cascades to all its messages and message bodies.
	Delete(ctx context.Context, spaceID, id string) error

	// ListBySpace retrieves threads matching space and filter criteria.
	ListBySpace(ctx context.Context, spaceID string, filter *ListThreadsFilter) ([]*Thread, error)

	// CountBySpace returns the total number of threads matching space and filter criteria.
	CountBySpace(ctx context.Context, spaceID string, filter *ListThreadsFilter) (int, error)

	// Upsert inserts or updates a Thread entity.
	Upsert(ctx context.Context, thread *Thread) error

	// PruneThreadsOlderThanWindow removes non-starred cached threads older than the given timestamp.
	PruneThreadsOlderThanWindow(ctx context.Context, olderThan time.Time) (int64, error)

	// DeleteByConnectedAccount removes all threads associated with a connected account.
	DeleteByConnectedAccount(ctx context.Context, spaceID, connectedAccountID string) error
}

// ListThreadsFilter encapsulates filter and pagination options for threads.
type ListThreadsFilter struct {
	ConnectedAccountID *string
	MailboxID          *string
	SystemBucket       *SystemBucket
	IsUnread           *bool
	IsStarred          *bool
	Query              string
	Limit              int
	Offset             int
}

// MessageStore defines persistence operations for Message and MessageBody entities.
//
// @Mock
type MessageStore interface {
	// Create persists a new Message entity.
	Create(ctx context.Context, msg *Message) error

	// GetByID retrieves a Message by space ID and message ID.
	GetByID(ctx context.Context, spaceID, id string) (*Message, error)

	// GetByProviderID retrieves a message by its upstream provider message ID.
	GetByProviderID(ctx context.Context, spaceID, connectedAccountID, providerMessageID string) (*Message, error)

	// ListByThreadID retrieves all messages belonging to a thread, ordered chronologically.
	ListByThreadID(ctx context.Context, spaceID, threadID string) ([]*Message, error)

	// Update updates mutable attributes of an existing Message.
	Update(ctx context.Context, msg *Message) error

	// Delete removes a Message.
	Delete(ctx context.Context, spaceID, id string) error

	// Upsert inserts or updates a Message entity.
	Upsert(ctx context.Context, msg *Message) error

	// SaveBody caches a sanitized message body with a TTL.
	SaveBody(ctx context.Context, body *MessageBody) error

	// GetBody retrieves the cached body for a message.
	GetBody(ctx context.Context, spaceID, messageID string) (*MessageBody, error)

	// DeleteExpiredBodies evicts message bodies whose expires_at is before now.
	DeleteExpiredBodies(ctx context.Context, now time.Time) (int64, error)

	// DeleteByConnectedAccount removes all messages associated with a connected account.
	DeleteByConnectedAccount(ctx context.Context, spaceID, connectedAccountID string) error
}

// DraftStore defines persistence operations for Draft entities.
//
// @Mock
type DraftStore interface {
	// Create persists a new Draft entity.
	Create(ctx context.Context, draft *Draft) error

	// GetByID retrieves a Draft by space ID and draft ID.
	GetByID(ctx context.Context, spaceID, id string) (*Draft, error)

	// GetByProviderID retrieves a draft by its upstream provider draft ID.
	GetByProviderID(ctx context.Context, spaceID, connectedAccountID, providerDraftID string) (*Draft, error)

	// Update updates mutable attributes of an existing Draft.
	Update(ctx context.Context, draft *Draft) error

	// Delete removes a Draft.
	Delete(ctx context.Context, spaceID, id string) error

	// ListBySpace retrieves drafts matching optional filter criteria.
	ListBySpace(ctx context.Context, spaceID string, filter *ListDraftsFilter) ([]*Draft, error)

	// DeleteByConnectedAccount removes all drafts associated with a connected account.
	DeleteByConnectedAccount(ctx context.Context, spaceID, connectedAccountID string) error
}

// ListDraftsFilter encapsulates filter and pagination options for drafts.
type ListDraftsFilter struct {
	ConnectedAccountID *string
	ThreadID           *string
	Limit              int
	Offset             int
}

// SyncStateStore defines persistence operations for mail synchronization positions.
//
// @Mock
type SyncStateStore interface {
	// Get retrieves the sync state for a connected account.
	Get(ctx context.Context, spaceID, connectedAccountID string) (*SyncState, error)

	// Upsert stores or updates the sync state for a connected account.
	Upsert(ctx context.Context, state *SyncState) error

	// Delete removes the sync state for a connected account.
	Delete(ctx context.Context, spaceID, connectedAccountID string) error
}

// SyncThreadsRequest encapsulates inputs for synchronizing threads from an upstream provider.
type SyncThreadsRequest struct {
	SyncCursor         string
	OldestTime         *time.Time
	WindowDays         int
	PrewarmBodiesCount int
}

// SyncThreadsResult encapsulates the output of a thread synchronization pass.
type SyncThreadsResult struct {
	Threads       []*Thread
	Messages      []*Message
	Bodies        []*MessageBody
	NewSyncCursor string
	ExpiredCursor bool
}

// ExternalMailProvider defines the port interface for external email providers (e.g. Google, Microsoft).
//
// @Mock
type ExternalMailProvider interface {
	// Provider returns the provider name (e.g. "google", "microsoft").
	Provider() string

	// ListMailboxes fetches all mailboxes/labels accessible to the connected account.
	ListMailboxes(ctx context.Context, accessToken string) ([]*Mailbox, error)

	// SyncThreads bootstraps or incrementally synchronizes threads.
	SyncThreads(ctx context.Context, accessToken string, req *SyncThreadsRequest) (*SyncThreadsResult, error)

	// FetchThread fetches the full thread and its messages metadata.
	FetchThread(ctx context.Context, accessToken, providerThreadID string) (*Thread, []*Message, error)

	// FetchMessageBody fetches and sanitizes a message body from the provider.
	FetchMessageBody(ctx context.Context, accessToken, providerMessageID string) (*MessageBody, error)

	// SearchThreads queries remote threads on the upstream provider for hybrid search.
	SearchThreads(ctx context.Context, accessToken, query string, limit int) ([]*Thread, error)

	// ModifyThread applies label/bucket modifications to a thread on the provider.
	ModifyThread(ctx context.Context, accessToken, providerThreadID string, addLabelIDs, removeLabelIDs []string) error

	// BatchModifyThreads applies label modifications to multiple threads on the provider.
	BatchModifyThreads(ctx context.Context, accessToken string, providerThreadIDs []string, addLabelIDs, removeLabelIDs []string) error

	// CreateDraft creates a draft on the provider.
	CreateDraft(ctx context.Context, accessToken string, draft *Draft) (*Draft, error)

	// UpdateDraft updates an existing draft on the provider.
	UpdateDraft(ctx context.Context, accessToken string, draft *Draft) (*Draft, error)

	// DeleteDraft removes a draft from the provider.
	DeleteDraft(ctx context.Context, accessToken, providerDraftID string) error

	// SendDraft sends an existing draft via the provider.
	SendDraft(ctx context.Context, accessToken, providerDraftID string) (*Message, error)

	// OpenAttachmentStream opens a readable binary stream for an attachment.
	OpenAttachmentStream(ctx context.Context, accessToken, providerMessageID, attachmentID string) (io.ReadCloser, string, int64, error)

	// UploadDraftAttachment streams a draft attachment to the provider.
	UploadDraftAttachment(ctx context.Context, accessToken, providerDraftID, filename, contentType string, r io.Reader) (*AttachmentMeta, error)
}
