package mail

import (
	"context"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// Dependencies holds all storage interfaces required by the mail Service.
type Dependencies struct {
	MailboxStore   MailboxStore
	ThreadStore    ThreadStore
	MessageStore   MessageStore
	DraftStore     DraftStore
	SyncStateStore SyncStateStore
}

// Service coordinates pure domain logic across mail entities and stores.
type Service struct {
	deps Dependencies
}

// NewService constructs a new mail domain Service.
func NewService(deps Dependencies) *Service {
	return &Service{deps: deps}
}

// --- Mailbox Operations ---

// CreateMailbox validates and persists a new Mailbox.
func (s *Service) CreateMailbox(ctx context.Context, mbx *Mailbox) error {
	if mbx == nil {
		return errors.E(errors.Invalid, "mailbox is required")
	}

	if mbx.ID == "" {
		newID, err := GenerateMailboxID()
		if err != nil {
			return errors.E(errors.Internal, "generate mailbox id: %w", err)
		}
		mbx.ID = newID
	}

	now := time.Now().UTC()
	if mbx.CreateTime.IsZero() {
		mbx.CreateTime = now
	}
	if mbx.UpdateTime.IsZero() {
		mbx.UpdateTime = now
	}

	if err := mbx.Validate(); err != nil {
		return err
	}

	return s.deps.MailboxStore.Create(ctx, mbx)
}

// GetMailbox retrieves a Mailbox by ID.
func (s *Service) GetMailbox(ctx context.Context, spaceID, id string) (*Mailbox, error) {
	mbx, err := s.deps.MailboxStore.GetByID(ctx, spaceID, id)
	if err != nil {
		return nil, err
	}
	if mbx == nil {
		return nil, errors.E(errors.NotExist, ErrMailboxNotFound, "mailbox not found")
	}
	return mbx, nil
}

// UpdateMailbox validates and updates an existing Mailbox.
func (s *Service) UpdateMailbox(ctx context.Context, mbx *Mailbox) error {
	if mbx == nil {
		return errors.E(errors.Invalid, "mailbox is required")
	}
	mbx.UpdateTime = time.Now().UTC()
	if err := mbx.Validate(); err != nil {
		return err
	}
	return s.deps.MailboxStore.Update(ctx, mbx)
}

// DeleteMailbox deletes a Mailbox by ID.
func (s *Service) DeleteMailbox(ctx context.Context, spaceID, id string) error {
	return s.deps.MailboxStore.Delete(ctx, spaceID, id)
}

// ListMailboxes retrieves mailboxes matching optional filters.
func (s *Service) ListMailboxes(ctx context.Context, spaceID string, filter *ListMailboxesFilter) ([]*Mailbox, error) {
	return s.deps.MailboxStore.ListBySpace(ctx, spaceID, filter)
}

// GetOrCreateSystemMailbox retrieves or creates a system mailbox (e.g. Inbox, Trash).
func (s *Service) GetOrCreateSystemMailbox(ctx context.Context, spaceID, connectedAccountID string, role SystemBucket, name string) (*Mailbox, error) {
	existing, err := s.deps.MailboxStore.GetBySystemRole(ctx, spaceID, connectedAccountID, role)
	if err == nil && existing != nil {
		return existing, nil
	}

	mbxID, err := GenerateMailboxID()
	if err != nil {
		return nil, errors.E(errors.Internal, "generate mailbox id: %w", err)
	}

	now := time.Now().UTC()
	mbx := &Mailbox{
		ID:                 mbxID,
		SpaceID:            spaceID,
		ConnectedAccountID: connectedAccountID,
		Name:               name,
		SystemRole:         role,
		CreateTime:         now,
		UpdateTime:         now,
	}

	if err := s.deps.MailboxStore.Upsert(ctx, mbx); err != nil {
		return nil, err
	}
	return mbx, nil
}

// --- Thread Operations ---

// CreateThread validates and persists a new Thread.
func (s *Service) CreateThread(ctx context.Context, thread *Thread) error {
	if thread == nil {
		return errors.E(errors.Invalid, "thread is required")
	}

	if thread.ID == "" {
		newID, err := GenerateThreadID()
		if err != nil {
			return errors.E(errors.Internal, "generate thread id: %w", err)
		}
		thread.ID = newID
	}

	now := time.Now().UTC()
	if thread.CreateTime.IsZero() {
		thread.CreateTime = now
	}
	if thread.UpdateTime.IsZero() {
		thread.UpdateTime = now
	}
	if thread.LastMessageAt.IsZero() {
		thread.LastMessageAt = now
	}

	if err := thread.Validate(); err != nil {
		return err
	}

	return s.deps.ThreadStore.Create(ctx, thread)
}

// GetThread retrieves a Thread by ID.
func (s *Service) GetThread(ctx context.Context, spaceID, id string) (*Thread, error) {
	thread, err := s.deps.ThreadStore.GetByID(ctx, spaceID, id)
	if err != nil {
		return nil, err
	}
	if thread == nil {
		return nil, errors.E(errors.NotExist, ErrThreadNotFound, "thread not found")
	}
	return thread, nil
}

// UpdateThread validates and updates an existing Thread.
func (s *Service) UpdateThread(ctx context.Context, thread *Thread) error {
	if thread == nil {
		return errors.E(errors.Invalid, "thread is required")
	}
	thread.UpdateTime = time.Now().UTC()
	if err := thread.Validate(); err != nil {
		return err
	}
	return s.deps.ThreadStore.Update(ctx, thread)
}

// DeleteThread removes a Thread by ID.
func (s *Service) DeleteThread(ctx context.Context, spaceID, id string) error {
	return s.deps.ThreadStore.Delete(ctx, spaceID, id)
}

// ListThreads retrieves threads matching space and filter criteria.
func (s *Service) ListThreads(ctx context.Context, spaceID string, filter *ListThreadsFilter) ([]*Thread, error) {
	return s.deps.ThreadStore.ListBySpace(ctx, spaceID, filter)
}

// CountThreads returns the total number of threads matching space and filter criteria.
func (s *Service) CountThreads(ctx context.Context, spaceID string, filter *ListThreadsFilter) (int, error) {
	return s.deps.ThreadStore.CountBySpace(ctx, spaceID, filter)
}

// RecomputeThread aggregates thread flags, snippet, subject, and participants across all its messages.
func (s *Service) RecomputeThread(ctx context.Context, spaceID, threadID string) (*Thread, error) {
	thread, err := s.GetThread(ctx, spaceID, threadID)
	if err != nil {
		return nil, err
	}

	msgs, err := s.deps.MessageStore.ListByThreadID(ctx, spaceID, threadID)
	if err != nil {
		return nil, err
	}

	thread.AggregateFromMessages(msgs)
	thread.UpdateTime = time.Now().UTC()

	if err := s.deps.ThreadStore.Update(ctx, thread); err != nil {
		return nil, err
	}

	return thread, nil
}

// --- Message Operations ---

// CreateMessage validates and persists a new Message.
func (s *Service) CreateMessage(ctx context.Context, msg *Message) error {
	if msg == nil {
		return errors.E(errors.Invalid, "message is required")
	}

	if msg.ID == "" {
		newID, err := GenerateMessageID()
		if err != nil {
			return errors.E(errors.Internal, "generate message id: %w", err)
		}
		msg.ID = newID
	}

	now := time.Now().UTC()
	if msg.CreateTime.IsZero() {
		msg.CreateTime = now
	}
	if msg.UpdateTime.IsZero() {
		msg.UpdateTime = now
	}
	if msg.ReceivedAt.IsZero() {
		msg.ReceivedAt = now
	}

	if err := msg.Validate(); err != nil {
		return err
	}

	return s.deps.MessageStore.Create(ctx, msg)
}

// GetMessage retrieves a Message by ID.
func (s *Service) GetMessage(ctx context.Context, spaceID, id string) (*Message, error) {
	msg, err := s.deps.MessageStore.GetByID(ctx, spaceID, id)
	if err != nil {
		return nil, err
	}
	if msg == nil {
		return nil, errors.E(errors.NotExist, ErrMessageNotFound, "message not found")
	}
	return msg, nil
}

// ListMessagesByThread retrieves all messages belonging to a thread.
func (s *Service) ListMessagesByThread(ctx context.Context, spaceID, threadID string) ([]*Message, error) {
	return s.deps.MessageStore.ListByThreadID(ctx, spaceID, threadID)
}

// SaveMessageBody caches a sanitized message body with a TTL.
func (s *Service) SaveMessageBody(ctx context.Context, body *MessageBody) error {
	if body == nil {
		return errors.E(errors.Invalid, "message body is required")
	}
	if body.FetchedAt.IsZero() {
		body.FetchedAt = time.Now().UTC()
	}
	if err := body.Validate(); err != nil {
		return err
	}
	return s.deps.MessageStore.SaveBody(ctx, body)
}

// GetMessageBody retrieves the cached body for a message.
func (s *Service) GetMessageBody(ctx context.Context, spaceID, messageID string) (*MessageBody, error) {
	body, err := s.deps.MessageStore.GetBody(ctx, spaceID, messageID)
	if err != nil {
		return nil, err
	}
	if body == nil {
		return nil, errors.E(errors.NotExist, ErrMessageBodyNotFound, "message body not found")
	}
	return body, nil
}

// PruneExpiredBodies evicts message bodies that have passed their expiration date.
func (s *Service) PruneExpiredBodies(ctx context.Context, now time.Time) (int64, error) {
	return s.deps.MessageStore.DeleteExpiredBodies(ctx, now)
}

// --- Draft Operations ---

// CreateDraft validates and persists a new Draft.
func (s *Service) CreateDraft(ctx context.Context, draft *Draft) error {
	if draft == nil {
		return errors.E(errors.Invalid, "draft is required")
	}

	if draft.ID == "" {
		newID, err := GenerateDraftID()
		if err != nil {
			return errors.E(errors.Internal, "generate draft id: %w", err)
		}
		draft.ID = newID
	}

	now := time.Now().UTC()
	if draft.CreateTime.IsZero() {
		draft.CreateTime = now
	}
	if draft.UpdateTime.IsZero() {
		draft.UpdateTime = now
	}
	if draft.Version == 0 {
		draft.Version = 1
	}

	if err := draft.Validate(); err != nil {
		return err
	}

	return s.deps.DraftStore.Create(ctx, draft)
}

// GetDraft retrieves a Draft by ID.
func (s *Service) GetDraft(ctx context.Context, spaceID, id string) (*Draft, error) {
	draft, err := s.deps.DraftStore.GetByID(ctx, spaceID, id)
	if err != nil {
		return nil, err
	}
	if draft == nil {
		return nil, errors.E(errors.NotExist, ErrDraftNotFound, "draft not found")
	}
	return draft, nil
}

// UpdateDraft validates and updates an existing Draft.
func (s *Service) UpdateDraft(ctx context.Context, draft *Draft) error {
	if draft == nil {
		return errors.E(errors.Invalid, "draft is required")
	}
	draft.Version++
	draft.UpdateTime = time.Now().UTC()
	if err := draft.Validate(); err != nil {
		return err
	}
	return s.deps.DraftStore.Update(ctx, draft)
}

// PatchDraft applies field mask partial updates to a Draft.
func (s *Service) PatchDraft(ctx context.Context, spaceID, id string, incoming *Draft, mask []string) (*Draft, error) {
	draft, err := s.GetDraft(ctx, spaceID, id)
	if err != nil {
		return nil, err
	}

	if err := draft.ApplyPatch(incoming, mask); err != nil {
		return nil, err
	}

	draft.Version++
	if err := s.deps.DraftStore.Update(ctx, draft); err != nil {
		return nil, err
	}

	return draft, nil
}

// DeleteDraft removes a Draft by ID.
func (s *Service) DeleteDraft(ctx context.Context, spaceID, id string) error {
	return s.deps.DraftStore.Delete(ctx, spaceID, id)
}

// ListDrafts retrieves drafts matching optional filter criteria.
func (s *Service) ListDrafts(ctx context.Context, spaceID string, filter *ListDraftsFilter) ([]*Draft, error) {
	return s.deps.DraftStore.ListBySpace(ctx, spaceID, filter)
}

// --- Sync State Operations ---

// GetSyncState retrieves the synchronization state for a connected account.
func (s *Service) GetSyncState(ctx context.Context, spaceID, connectedAccountID string) (*SyncState, error) {
	state, err := s.deps.SyncStateStore.Get(ctx, spaceID, connectedAccountID)
	if err != nil {
		return nil, err
	}
	if state == nil {
		return nil, errors.E(errors.NotExist, ErrSyncStateNotFound, "sync state not found")
	}
	return state, nil
}

// SaveSyncState validates and saves the synchronization state.
func (s *Service) SaveSyncState(ctx context.Context, state *SyncState) error {
	if state == nil {
		return errors.E(errors.Invalid, "sync state is required")
	}
	if err := state.Validate(); err != nil {
		return err
	}
	return s.deps.SyncStateStore.Upsert(ctx, state)
}

// PurgeConnectedAccountData purges all synchronized mail data for a connected account.
func (s *Service) PurgeConnectedAccountData(ctx context.Context, spaceID, connectedAccountID string) error {
	spaceID = strings.TrimSpace(spaceID)
	connectedAccountID = strings.TrimSpace(connectedAccountID)
	if spaceID == "" || connectedAccountID == "" {
		return errors.E(errors.Invalid, "space_id and connected_account_id are required")
	}

	if err := s.deps.DraftStore.DeleteByConnectedAccount(ctx, spaceID, connectedAccountID); err != nil {
		return err
	}
	if err := s.deps.MessageStore.DeleteByConnectedAccount(ctx, spaceID, connectedAccountID); err != nil {
		return err
	}
	if err := s.deps.ThreadStore.DeleteByConnectedAccount(ctx, spaceID, connectedAccountID); err != nil {
		return err
	}
	if err := s.deps.MailboxStore.DeleteByConnectedAccount(ctx, spaceID, connectedAccountID); err != nil {
		return err
	}
	if err := s.deps.SyncStateStore.Delete(ctx, spaceID, connectedAccountID); err != nil {
		return err
	}

	return nil
}
