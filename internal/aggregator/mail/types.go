package mailaggregator

import (
	"context"

	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
)

// MailboxReader defines read operations for mailboxes.
type MailboxReader interface {
	GetByID(ctx context.Context, spaceID, id string) (*domainmail.Mailbox, error)
	ListBySpace(ctx context.Context, spaceID string, filter *domainmail.ListMailboxesFilter) ([]*domainmail.Mailbox, error)
}

// ThreadReader defines read and upsert operations for threads.
type ThreadReader interface {
	GetByID(ctx context.Context, spaceID, id string) (*domainmail.Thread, error)
	GetByProviderID(ctx context.Context, spaceID, connectedAccountID, providerThreadID string) (*domainmail.Thread, error)
	ListBySpace(ctx context.Context, spaceID string, filter *domainmail.ListThreadsFilter) ([]*domainmail.Thread, error)
	CountBySpace(ctx context.Context, spaceID string, filter *domainmail.ListThreadsFilter) (int, error)
	Upsert(ctx context.Context, thread *domainmail.Thread) error
}

// MessageReader defines read and caching operations for messages and message bodies.
type MessageReader interface {
	GetByID(ctx context.Context, spaceID, id string) (*domainmail.Message, error)
	ListByThreadID(ctx context.Context, spaceID, threadID string) ([]*domainmail.Message, error)
	GetBody(ctx context.Context, spaceID, messageID string) (*domainmail.MessageBody, error)
	SaveBody(ctx context.Context, body *domainmail.MessageBody) error
	Upsert(ctx context.Context, msg *domainmail.Message) error
}

// DraftReader defines read operations for drafts.
type DraftReader interface {
	GetByID(ctx context.Context, spaceID, id string) (*domainmail.Draft, error)
	ListBySpace(ctx context.Context, spaceID string, filter *domainmail.ListDraftsFilter) ([]*domainmail.Draft, error)
}

// ConnectedAccountReader defines read operations for platform connected accounts.
type ConnectedAccountReader interface {
	ListAccounts(ctx context.Context, spaceID string) ([]*connector.ConnectedAccount, error)
	GetAccount(ctx context.Context, spaceID, id string) (*connector.ConnectedAccount, error)
}

// ThreadProjection models an aggregated thread with all hydrated messages and attachments.
type ThreadProjection struct {
	Thread   *domainmail.Thread
	Messages []*MessageProjection
}

// MessageProjection models a hydrated message with body content and signed attachment links.
type MessageProjection struct {
	Message     *domainmail.Message
	BodyHTML    string
	BodyPlain   string
	Attachments []*AttachmentProjection
}

// AttachmentProjection models attachment metadata alongside an ephemeral signed streaming URL.
type AttachmentProjection struct {
	Meta        domainmail.AttachmentMeta
	DownloadURL string
}
