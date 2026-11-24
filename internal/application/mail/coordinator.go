package mail

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .
//go:generate go run github.com/masterkeysrd/saturn/tools/txgen -target=Coordinator
//go:generate go run github.com/masterkeysrd/saturn/tools/loggen -target=Coordinator

import (
	"context"
	"io"
	"slices"
	"strings"
	"time"

	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
	platformworkflow "github.com/masterkeysrd/saturn/internal/platform/workflow"
)

// Coordinator defines application use-case operations for mailboxes, threads, drafts, and sync.
//
// @Mock
// @logged
type Coordinator interface {
	// @transactional
	CreateMailbox(ctx context.Context, req *CreateMailboxRequest) (*domainmail.Mailbox, error)

	// @transactional
	UpdateMailbox(ctx context.Context, req *UpdateMailboxRequest) (*domainmail.Mailbox, error)

	// @transactional
	DeleteMailbox(ctx context.Context, req *DeleteMailboxRequest) error

	// @transactional
	ModifyThread(ctx context.Context, req *ModifyThreadRequest) (*domainmail.Thread, error)

	// @transactional
	SaveThreadSummary(ctx context.Context, req *SaveThreadSummaryRequest) (*domainmail.ThreadSummary, error)

	SummarizeThread(ctx context.Context, req *SummarizeThreadRequest) (*domainmail.ThreadSummary, error)

	// @transactional
	BatchModifyThreads(ctx context.Context, req *BatchModifyThreadsRequest) error

	// @transactional
	CreateDraft(ctx context.Context, req *CreateDraftRequest) (*domainmail.Draft, error)

	// @transactional
	UpdateDraft(ctx context.Context, req *UpdateDraftRequest) (*domainmail.Draft, error)

	// @transactional
	DeleteDraft(ctx context.Context, req *DeleteDraftRequest) error

	// @transactional
	SendDraft(ctx context.Context, req *SendDraftRequest) (*domainmail.Message, error)

	// @transactional
	UploadDraftAttachment(ctx context.Context, req *UploadDraftAttachmentRequest) (*domainmail.AttachmentMeta, error)

	SyncConnectedAccountMail(ctx context.Context, req *SyncConnectedAccountMailRequest) error

	SyncOlderThreads(ctx context.Context, req *SyncOlderThreadsRequest) (*SyncOlderThreadsResult, error)

	// @transactional
	PruneWindowAndBodies(ctx context.Context, req *PruneWindowAndBodiesRequest) error
}

// CreateMailboxRequest represents parameters to create a custom mailbox.
type CreateMailboxRequest struct {
	Mailbox *domainmail.Mailbox
}

// UpdateMailboxRequest represents parameters to update an existing mailbox.
type UpdateMailboxRequest struct {
	ID         string
	Mailbox    *domainmail.Mailbox
	UpdateMask []string
}

// DeleteMailboxRequest represents parameters to delete a custom mailbox.
type DeleteMailboxRequest struct {
	ID string
}

// ModifyThreadRequest represents parameters to modify thread flags and mailboxes.
type ModifyThreadRequest struct {
	ID               string
	AddMailboxIDs    []string
	RemoveMailboxIDs []string
	IsStarred        *bool
	IsUnread         *bool
	InInbox          *bool
	InTrash          *bool
	InSpam           *bool
}

// BatchModifyThreadsRequest represents parameters to batch modify threads.
type BatchModifyThreadsRequest struct {
	IDs              []string
	AddMailboxIDs    []string
	RemoveMailboxIDs []string
	IsStarred        *bool
	IsUnread         *bool
	InInbox          *bool
	InTrash          *bool
	InSpam           *bool
}

// SaveThreadSummaryRequest represents parameters to persist a thread summary produced by a workflow run.
type SaveThreadSummaryRequest struct {
	Summary *domainmail.ThreadSummary
}

// SummarizeThreadRequest represents parameters to generate or refresh an AI summary of a thread.
type SummarizeThreadRequest struct {
	ID              string
	ForceRegenerate bool
	Language        string
}

// CreateDraftRequest represents parameters to create a new draft.
type CreateDraftRequest struct {
	Draft *domainmail.Draft
}

// UpdateDraftRequest represents parameters to update an existing draft.
type UpdateDraftRequest struct {
	ID         string
	Draft      *domainmail.Draft
	UpdateMask []string
}

// DeleteDraftRequest represents parameters to delete a draft.
type DeleteDraftRequest struct {
	ID string
}

// SendDraftRequest represents parameters to send an existing draft.
type SendDraftRequest struct {
	ID string
}

// UploadDraftAttachmentRequest represents parameters to upload an attachment to a draft.
type UploadDraftAttachmentRequest struct {
	DraftID     string
	Filename    string
	ContentType string
	Body        io.Reader
}

// SyncConnectedAccountMailRequest represents parameters to synchronize a connected account.
type SyncConnectedAccountMailRequest struct {
	SpaceID            string
	ConnectedAccountID string
}

// SyncOlderThreadsRequest represents parameters to backfill older email threads from connected providers.
type SyncOlderThreadsRequest struct {
	ConnectedAccountID string
	SystemBucket       *domainmail.SystemBucket
	MailboxID          string
	PageSize           int
}

// SyncOlderThreadsResult summarizes an older-thread backfill pass.
type SyncOlderThreadsResult struct {
	SyncedCount int
	HasMore     bool
}

// PruneWindowAndBodiesRequest represents parameters to evict expired bodies and old threads.
type PruneWindowAndBodiesRequest struct {
	Now time.Time
}

// SummarizeFlowClient defines typed execution of the built-in thread summarization flow.
//
// @Mock
type SummarizeFlowClient interface {
	Execute(ctx context.Context, input SummarizeThreadFlowInput) (*platformworkflow.FlowRun, error)
}

// Dependencies encapsulates domain stores and external services for the Coordinator.
type Dependencies struct {
	DomainService     *domainmail.Service
	MailboxStore      domainmail.MailboxStore
	ThreadStore       domainmail.ThreadStore
	MessageStore      domainmail.MessageStore
	DraftStore        domainmail.DraftStore
	SyncStateStore    domainmail.SyncStateStore
	SummaryStore      domainmail.ThreadSummaryStore
	AccountStore      connector.Store
	TokenManager      *connector.TokenManager
	ExternalProviders map[string]domainmail.ExternalMailProvider
	Events            eventbus.EventPublisher
	SummarizeFlow     SummarizeFlowClient
	HMACSecret        []byte
}

type coordinator struct {
	domainService     *domainmail.Service
	mailboxStore      domainmail.MailboxStore
	threadStore       domainmail.ThreadStore
	messageStore      domainmail.MessageStore
	draftStore        domainmail.DraftStore
	syncStateStore    domainmail.SyncStateStore
	summaryStore      domainmail.ThreadSummaryStore
	accountStore      connector.Store
	tokenManager      *connector.TokenManager
	externalProviders map[string]domainmail.ExternalMailProvider
	events            eventbus.EventPublisher
	summarizeFlow     SummarizeFlowClient
	hmacSecret        []byte
}

// NewCoordinator constructs a new Mail application coordinator.
func NewCoordinator(deps Dependencies) Coordinator {
	return &coordinator{
		domainService:     deps.DomainService,
		mailboxStore:      deps.MailboxStore,
		threadStore:       deps.ThreadStore,
		messageStore:      deps.MessageStore,
		draftStore:        deps.DraftStore,
		syncStateStore:    deps.SyncStateStore,
		summaryStore:      deps.SummaryStore,
		accountStore:      deps.AccountStore,
		tokenManager:      deps.TokenManager,
		externalProviders: deps.ExternalProviders,
		events:            deps.Events,
		summarizeFlow:     deps.SummarizeFlow,
		hmacSecret:        deps.HMACSecret,
	}
}

func (c *coordinator) checkMutationPermission(ctx context.Context, op errors.Op) error {
	role, ok := auth.SpaceRoleFromContext(ctx)
	if !ok || role == string(space.RoleViewer) || role == "viewer" {
		return errors.E(op, errors.Permission, "viewer role cannot perform mail mutations")
	}
	return nil
}

func (c *coordinator) getSpaceID(ctx context.Context, op errors.Op) (string, error) {
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok || spaceID == "" {
		return "", errors.E(op, errors.Unauthenticated, "missing active space context")
	}
	return spaceID, nil
}

// CreateMailbox creates a new custom mailbox.
func (c *coordinator) CreateMailbox(ctx context.Context, req *CreateMailboxRequest) (*domainmail.Mailbox, error) {
	const op errors.Op = "application/mail.CreateMailbox"

	if err := c.checkMutationPermission(ctx, op); err != nil {
		return nil, err
	}
	if req == nil || req.Mailbox == nil {
		return nil, errors.E(op, errors.Invalid, "mailbox is required")
	}

	spaceID, err := c.getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}
	req.Mailbox.SpaceID = spaceID

	if err := c.domainService.CreateMailbox(ctx, req.Mailbox); err != nil {
		return nil, errors.E(op, err)
	}
	return req.Mailbox, nil
}

// UpdateMailbox updates an existing mailbox attributes.
func (c *coordinator) UpdateMailbox(ctx context.Context, req *UpdateMailboxRequest) (*domainmail.Mailbox, error) {
	const op errors.Op = "application/mail.UpdateMailbox"

	if err := c.checkMutationPermission(ctx, op); err != nil {
		return nil, err
	}
	if req == nil || req.ID == "" || req.Mailbox == nil {
		return nil, errors.E(op, errors.Invalid, "mailbox and id are required")
	}

	spaceID, err := c.getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	existing, err := c.domainService.GetMailbox(ctx, spaceID, req.ID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	if req.Mailbox.Name != "" {
		existing.Name = req.Mailbox.Name
	}
	if req.Mailbox.Color != nil {
		existing.Color = req.Mailbox.Color
	}

	if err := c.domainService.UpdateMailbox(ctx, existing); err != nil {
		return nil, errors.E(op, err)
	}
	return existing, nil
}

// DeleteMailbox deletes a custom mailbox. System mailboxes cannot be deleted.
func (c *coordinator) DeleteMailbox(ctx context.Context, req *DeleteMailboxRequest) error {
	const op errors.Op = "application/mail.DeleteMailbox"

	if err := c.checkMutationPermission(ctx, op); err != nil {
		return err
	}
	if req == nil || req.ID == "" {
		return errors.E(op, errors.Invalid, "id is required")
	}

	spaceID, err := c.getSpaceID(ctx, op)
	if err != nil {
		return err
	}

	existing, err := c.domainService.GetMailbox(ctx, spaceID, req.ID)
	if err != nil {
		return errors.E(op, err)
	}
	if existing.SystemRole != domainmail.SystemBucketCustom {
		return errors.E(op, errors.Invalid, "system mailboxes cannot be deleted")
	}

	if err := c.domainService.DeleteMailbox(ctx, spaceID, req.ID); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// ModifyThread applies label/bucket modifications to a thread with write-through to provider.
func (c *coordinator) ModifyThread(ctx context.Context, req *ModifyThreadRequest) (*domainmail.Thread, error) {
	const op errors.Op = "application/mail.ModifyThread"

	if err := c.checkMutationPermission(ctx, op); err != nil {
		return nil, err
	}
	if req == nil || req.ID == "" {
		return nil, errors.E(op, errors.Invalid, "thread id is required")
	}

	spaceID, err := c.getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	thread, err := c.domainService.GetThread(ctx, spaceID, req.ID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	var addLabels, removeLabels []string

	if req.IsStarred != nil {
		thread.IsStarred = *req.IsStarred
		if *req.IsStarred {
			addLabels = append(addLabels, "STARRED")
		} else {
			removeLabels = append(removeLabels, "STARRED")
		}
	}
	if req.IsUnread != nil {
		thread.IsUnread = *req.IsUnread
		if *req.IsUnread {
			addLabels = append(addLabels, "UNREAD")
		} else {
			removeLabels = append(removeLabels, "UNREAD")
		}
	}
	if req.InInbox != nil {
		thread.InInbox = *req.InInbox
		if *req.InInbox {
			addLabels = append(addLabels, "INBOX")
		} else {
			removeLabels = append(removeLabels, "INBOX")
		}
	}
	if req.InTrash != nil {
		thread.InTrash = *req.InTrash
		if *req.InTrash {
			thread.InInbox = false
			addLabels = append(addLabels, "TRASH")
			removeLabels = append(removeLabels, "INBOX")
		} else {
			removeLabels = append(removeLabels, "TRASH")
		}
	}
	if req.InSpam != nil {
		thread.InSpam = *req.InSpam
		if *req.InSpam {
			thread.InInbox = false
			addLabels = append(addLabels, "SPAM")
			removeLabels = append(removeLabels, "INBOX")
		} else {
			removeLabels = append(removeLabels, "SPAM")
		}
	}

	resolveProviderMailboxID := func(mbxID string) string {
		if mbx, mbxErr := c.mailboxStore.GetByID(ctx, spaceID, mbxID); mbxErr == nil && mbx != nil && mbx.ProviderMailboxID != nil && *mbx.ProviderMailboxID != "" {
			return *mbx.ProviderMailboxID
		}
		if strings.HasPrefix(mbxID, "mbx_") {
			return ""
		}
		return mbxID
	}

	for _, addID := range req.AddMailboxIDs {
		if !slices.Contains(thread.MailboxIDs, addID) {
			thread.MailboxIDs = append(thread.MailboxIDs, addID)
		}
		if lbl := resolveProviderMailboxID(addID); lbl != "" {
			addLabels = append(addLabels, lbl)
		}
	}
	for _, rmID := range req.RemoveMailboxIDs {
		thread.MailboxIDs = slices.DeleteFunc(thread.MailboxIDs, func(s string) bool {
			return s == rmID
		})
		if lbl := resolveProviderMailboxID(rmID); lbl != "" {
			removeLabels = append(removeLabels, lbl)
		}
	}

	if err := c.domainService.UpdateThread(ctx, thread); err != nil {
		return nil, errors.E(op, err)
	}

	// Write-through to upstream provider if thread is synced to external connected account
	if thread.ConnectedAccountID != "" && thread.ProviderThreadID != nil && *thread.ProviderThreadID != "" && c.tokenManager != nil {
		acc, err := c.accountStore.GetAccount(ctx, spaceID, thread.ConnectedAccountID)
		if err == nil && acc != nil {
			if prov, ok := c.externalProviders[acc.Provider]; ok {
				token, err := c.tokenManager.TokenSource(ctx, spaceID, thread.ConnectedAccountID)
				if err == nil && token != "" {
					_ = prov.ModifyThread(ctx, token, *thread.ProviderThreadID, addLabels, removeLabels)
				}
			}
		}
	}

	return thread, nil
}

// BatchModifyThreads applies label modifications to multiple threads.
func (c *coordinator) BatchModifyThreads(ctx context.Context, req *BatchModifyThreadsRequest) error {
	const op errors.Op = "application/mail.BatchModifyThreads"

	if err := c.checkMutationPermission(ctx, op); err != nil {
		return err
	}
	if req == nil || len(req.IDs) == 0 {
		return errors.E(op, errors.Invalid, "thread ids are required")
	}

	for _, id := range req.IDs {
		singleReq := &ModifyThreadRequest{
			ID:               id,
			AddMailboxIDs:    req.AddMailboxIDs,
			RemoveMailboxIDs: req.RemoveMailboxIDs,
			IsStarred:        req.IsStarred,
			IsUnread:         req.IsUnread,
			InInbox:          req.InInbox,
			InTrash:          req.InTrash,
			InSpam:           req.InSpam,
		}
		if _, err := c.ModifyThread(ctx, singleReq); err != nil {
			return errors.E(op, err)
		}
	}

	return nil
}
