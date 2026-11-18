package mcpmail

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

import (
	"context"
	"strings"
	"time"

	mailaggregator "github.com/masterkeysrd/saturn/internal/aggregator/mail"
	mailapp "github.com/masterkeysrd/saturn/internal/application/mail"
	spaceapp "github.com/masterkeysrd/saturn/internal/application/space"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	mcptransport "github.com/masterkeysrd/saturn/internal/transport/mcp"
)

const (
	defaultThreadsLimit = 20
	maxThreadsLimit     = 50
)

// MailAggregator defines read-only mail thread and draft queries.
// @Mock
type MailAggregator interface {
	ListThreads(ctx context.Context, spaceID string, filter *domainmail.ListThreadsFilter) ([]*domainmail.Thread, int, error)
	GetThread(ctx context.Context, spaceID, id string) (*mailaggregator.ThreadProjection, error)
	ListDrafts(ctx context.Context, spaceID string, filter *domainmail.ListDraftsFilter) ([]*domainmail.Draft, error)
	GetDraft(ctx context.Context, spaceID, id string) (*domainmail.Draft, error)
}

// MailCoordinator defines mail thread and draft mutations.
// @Mock
type MailCoordinator interface {
	ModifyThread(ctx context.Context, req *mailapp.ModifyThreadRequest) (*domainmail.Thread, error)
	CreateDraft(ctx context.Context, req *mailapp.CreateDraftRequest) (*domainmail.Draft, error)
	UpdateDraft(ctx context.Context, req *mailapp.UpdateDraftRequest) (*domainmail.Draft, error)
	DeleteDraft(ctx context.Context, req *mailapp.DeleteDraftRequest) error
	SendDraft(ctx context.Context, req *mailapp.SendDraftRequest) (*domainmail.Message, error)
}

// SpaceSettingsReader retrieves the workspace IANA timezone.
// @Mock
type SpaceSettingsReader interface {
	GetSettings(ctx context.Context, req *spaceapp.GetSettingsRequest) (*settings.Entry[space.Settings], error)
}

// Dependencies holds the collaborators required by the mail MCP handler.
type Dependencies struct {
	Aggregator    MailAggregator
	Coordinator   MailCoordinator
	SpaceSettings SpaceSettingsReader
}

// Handler adapts mail operations into curated MCP tools.
type Handler struct {
	agg           MailAggregator
	coord         MailCoordinator
	spaceSettings SpaceSettingsReader
}

// NewHandler constructs a new mail MCP Handler.
func NewHandler(deps Dependencies) *Handler {
	return &Handler{
		agg:           deps.Aggregator,
		coord:         deps.Coordinator,
		spaceSettings: deps.SpaceSettings,
	}
}

// Register registers mail MCP tools onto the registry.
func (h *Handler) Register(reg *mcptransport.Registry) {
	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "mail_list_threads",
		Domain:        "mail",
		Title:         "List Mail Threads",
		Description:   "Searches or lists workspace email threads with unread/starred filters and bounded pagination.",
		RequiredScope: identity.ScopeMailRead,
		ReadOnly:      true,
	}, h.listThreads)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "mail_get_thread",
		Domain:        "mail",
		Title:         "Get Mail Thread",
		Description:   "Retrieves a mail thread along with its hydrated messages, participants, plain bodies, and attachment names.",
		RequiredScope: identity.ScopeMailRead,
		ReadOnly:      true,
	}, h.getThread)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "mail_create_draft",
		Domain:        "mail",
		Title:         "Create Mail Draft",
		Description:   "Creates an email draft in the workspace (and syncs to the connected provider).",
		RequiredScope: identity.ScopeMailWrite,
		ReadOnly:      false,
		Destructive:   false,
	}, h.createDraft)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "mail_archive_thread",
		Domain:        "mail",
		Title:         "Archive Mail Thread",
		Description:   "Archives an email thread by removing it from the inbox.",
		RequiredScope: identity.ScopeMailWrite,
		ReadOnly:      false,
		Destructive:   false,
	}, h.archiveThread)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "mail_send_message",
		Domain:        "mail",
		Title:         "Send Email Message",
		Description:   "Sends an existing mail draft by draft_id (or composes and sends directly when connected_account_id, to, and subject are supplied).",
		RequiredScope: identity.ScopeMailWrite,
		ReadOnly:      false,
		Destructive:   true,
	}, h.sendMessage)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "mail_modify_thread",
		Domain:        "mail",
		Title:         "Modify Mail Thread",
		Description:   "Updates flags (starred, unread, inbox, trash, spam) or mailbox labels on an email thread.",
		RequiredScope: identity.ScopeMailWrite,
		ReadOnly:      false,
		Destructive:   false,
	}, h.modifyThread)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "mail_list_drafts",
		Domain:        "mail",
		Title:         "List Mail Drafts",
		Description:   "Lists email drafts in the workspace with optional connected account filter.",
		RequiredScope: identity.ScopeMailRead,
		ReadOnly:      true,
	}, h.listDrafts)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "mail_update_draft",
		Domain:        "mail",
		Title:         "Update Mail Draft",
		Description:   "Updates recipients, subject, or body fields on an existing mail draft.",
		RequiredScope: identity.ScopeMailWrite,
		ReadOnly:      false,
		Destructive:   false,
	}, h.updateDraft)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "mail_delete_draft",
		Domain:        "mail",
		Title:         "Delete Mail Draft",
		Description:   "Deletes an email draft from the workspace and connected provider.",
		RequiredScope: identity.ScopeMailWrite,
		ReadOnly:      false,
		Destructive:   true,
	}, h.deleteDraft)
}

// ListThreadsInput defines parameters for mail_list_threads.
type ListThreadsInput struct {
	Query              string `json:"query,omitempty" jsonschema:"Full-text search query"`
	ConnectedAccountID string `json:"connected_account_id,omitempty" jsonschema:"Optional connected account ID filter"`
	MailboxID          string `json:"mailbox_id,omitempty" jsonschema:"Optional mailbox/label ID filter"`
	IsUnread           *bool  `json:"is_unread,omitempty" jsonschema:"Filter by unread state"`
	IsStarred          *bool  `json:"is_starred,omitempty" jsonschema:"Filter by starred state"`
	Limit              int    `json:"limit,omitempty" jsonschema:"Maximum threads to return (1-50, default 20)"`
	Offset             int    `json:"offset,omitempty" jsonschema:"Pagination offset"`
}

// ThreadSummary summarizes an email conversation.
type ThreadSummary struct {
	ID            string   `json:"id"`
	Subject       string   `json:"subject"`
	Snippet       string   `json:"snippet"`
	Participants  []string `json:"participants"`
	MessageCount  int      `json:"message_count"`
	IsUnread      bool     `json:"is_unread"`
	IsStarred     bool     `json:"is_starred"`
	LastMessageAt string   `json:"last_message_at"`
}

// ListThreadsOutput is returned by mail_list_threads.
type ListThreadsOutput struct {
	Threads []ThreadSummary `json:"threads"`
	Total   int             `json:"total"`
}

func (h *Handler) listThreads(ctx context.Context, in ListThreadsInput) (ListThreadsOutput, error) {
	spaceID, err := mcptransport.RequireSpaceID(ctx)
	if err != nil {
		return ListThreadsOutput{}, err
	}

	filter := &domainmail.ListThreadsFilter{
		Query:     strings.TrimSpace(in.Query),
		IsUnread:  in.IsUnread,
		IsStarred: in.IsStarred,
		Limit:     mcptransport.ClampLimit(in.Limit, defaultThreadsLimit, maxThreadsLimit),
		Offset:    max(in.Offset, 0),
	}
	if acc := strings.TrimSpace(in.ConnectedAccountID); acc != "" {
		filter.ConnectedAccountID = new(acc)
	}
	if mbx := strings.TrimSpace(in.MailboxID); mbx != "" {
		filter.MailboxID = new(mbx)
	}

	threads, total, err := h.agg.ListThreads(ctx, spaceID, filter)
	if err != nil {
		return ListThreadsOutput{}, err
	}

	loc := mcptransport.ResolveLocation(ctx, h.spaceSettings.GetSettings, spaceID)
	items := make([]ThreadSummary, 0, len(threads))
	for _, th := range threads {
		participants := make([]string, 0, len(th.Participants))
		for _, p := range th.Participants {
			participants = append(participants, p.String())
		}
		items = append(items, ThreadSummary{
			ID:            th.ID,
			Subject:       th.Subject,
			Snippet:       th.Snippet,
			Participants:  participants,
			MessageCount:  th.MessageCount,
			IsUnread:      th.IsUnread,
			IsStarred:     th.IsStarred,
			LastMessageAt: th.LastMessageAt.In(loc).Format(time.RFC3339),
		})
	}

	return ListThreadsOutput{
		Threads: items,
		Total:   total,
	}, nil
}

// GetThreadInput defines parameters for mail_get_thread.
type GetThreadInput struct {
	ID string `json:"id" jsonschema:"Mail thread ID (mth_...)"`
}

// MessageItem represents a hydrated email message inside a thread.
type MessageItem struct {
	ID          string   `json:"id"`
	From        string   `json:"from"`
	To          []string `json:"to"`
	Subject     string   `json:"subject"`
	BodyPlain   string   `json:"body_plain"`
	Timestamp   string   `json:"timestamp"`
	Attachments []string `json:"attachments,omitempty"`
}

// GetThreadOutput is returned by mail_get_thread.
type GetThreadOutput struct {
	ID                 string        `json:"id"`
	ConnectedAccountID string        `json:"connected_account_id"`
	Subject            string        `json:"subject"`
	IsUnread           bool          `json:"is_unread"`
	Messages           []MessageItem `json:"messages"`
}

func (h *Handler) getThread(ctx context.Context, in GetThreadInput) (GetThreadOutput, error) {
	spaceID, err := mcptransport.RequireSpaceID(ctx)
	if err != nil {
		return GetThreadOutput{}, err
	}
	id := strings.TrimSpace(in.ID)
	if id == "" {
		return GetThreadOutput{}, errors.E(errors.Invalid, "thread id is required")
	}

	proj, err := h.agg.GetThread(ctx, spaceID, id)
	if err != nil {
		return GetThreadOutput{}, err
	}

	loc := mcptransport.ResolveLocation(ctx, h.spaceSettings.GetSettings, spaceID)
	msgs := make([]MessageItem, 0, len(proj.Messages))
	for _, m := range proj.Messages {
		toList := make([]string, 0, len(m.Message.To))
		for _, p := range m.Message.To {
			toList = append(toList, p.String())
		}
		atts := make([]string, 0, len(m.Attachments))
		for _, a := range m.Attachments {
			atts = append(atts, a.Meta.Filename)
		}
		msgs = append(msgs, MessageItem{
			ID:          m.Message.ID,
			From:        m.Message.From.String(),
			To:          toList,
			Subject:     m.Message.Subject,
			BodyPlain:   m.BodyPlain,
			Timestamp:   m.Message.EffectiveTime().In(loc).Format(time.RFC3339),
			Attachments: atts,
		})
	}

	return GetThreadOutput{
		ID:                 proj.Thread.ID,
		ConnectedAccountID: proj.Thread.ConnectedAccountID,
		Subject:            proj.Thread.Subject,
		IsUnread:           proj.Thread.IsUnread,
		Messages:           msgs,
	}, nil
}

// CreateDraftInput defines parameters for mail_create_draft.
type CreateDraftInput struct {
	ConnectedAccountID string   `json:"connected_account_id" jsonschema:"Connected account ID to send from"`
	To                 []string `json:"to" jsonschema:"Recipient email addresses"`
	Cc                 []string `json:"cc,omitempty" jsonschema:"Optional CC email addresses"`
	Subject            string   `json:"subject" jsonschema:"Email subject line"`
	BodyText           string   `json:"body_text,omitempty" jsonschema:"Plain-text body"`
	BodyHTML           string   `json:"body_html,omitempty" jsonschema:"Optional HTML body"`
	ThreadID           string   `json:"thread_id,omitempty" jsonschema:"Optional thread ID when replying"`
	ReplyToMessageID   string   `json:"reply_to_message_id,omitempty" jsonschema:"Optional message ID being replied to"`
	Mode               string   `json:"mode,omitempty" jsonschema:"Draft mode ('new', 'reply', 'reply_all', 'forward')"`
}

// DraftOutput summarizes a created mail draft.
type DraftOutput struct {
	ID                 string `json:"id"`
	ConnectedAccountID string `json:"connected_account_id"`
	Subject            string `json:"subject"`
	Mode               string `json:"mode"`
}

func (h *Handler) createDraft(ctx context.Context, in CreateDraftInput) (DraftOutput, error) {
	if _, err := mcptransport.RequireSpaceID(ctx); err != nil {
		return DraftOutput{}, err
	}
	draft, err := buildDraftFromInput(in)
	if err != nil {
		return DraftOutput{}, err
	}

	created, err := h.coord.CreateDraft(ctx, &mailapp.CreateDraftRequest{Draft: draft})
	if err != nil {
		return DraftOutput{}, err
	}

	return DraftOutput{
		ID:                 created.ID,
		ConnectedAccountID: created.ConnectedAccountID,
		Subject:            created.Subject,
		Mode:               string(created.Mode),
	}, nil
}

// ArchiveThreadInput defines parameters for mail_archive_thread.
type ArchiveThreadInput struct {
	ID string `json:"id" jsonschema:"Mail thread ID (mth_...) to archive"`
}

// ArchiveThreadOutput confirms archiving.
type ArchiveThreadOutput struct {
	ID      string `json:"id"`
	InInbox bool   `json:"in_inbox"`
}

func (h *Handler) archiveThread(ctx context.Context, in ArchiveThreadInput) (ArchiveThreadOutput, error) {
	if _, err := mcptransport.RequireSpaceID(ctx); err != nil {
		return ArchiveThreadOutput{}, err
	}
	id := strings.TrimSpace(in.ID)
	if id == "" {
		return ArchiveThreadOutput{}, errors.E(errors.Invalid, "thread id is required")
	}

	updated, err := h.coord.ModifyThread(ctx, &mailapp.ModifyThreadRequest{
		ID:      id,
		InInbox: new(false),
	})
	if err != nil {
		return ArchiveThreadOutput{}, err
	}

	return ArchiveThreadOutput{
		ID:      updated.ID,
		InInbox: updated.InInbox,
	}, nil
}

// SendMessageInput defines parameters for mail_send_message.
type SendMessageInput struct {
	DraftID            string   `json:"draft_id,omitempty" jsonschema:"Existing draft ID (mdf_...) to send"`
	ConnectedAccountID string   `json:"connected_account_id,omitempty" jsonschema:"Connected account ID (when sending without an existing draft_id)"`
	To                 []string `json:"to,omitempty" jsonschema:"Recipient emails (when sending without draft_id)"`
	Cc                 []string `json:"cc,omitempty" jsonschema:"Optional CC emails"`
	Subject            string   `json:"subject,omitempty" jsonschema:"Subject (when sending without draft_id)"`
	BodyText           string   `json:"body_text,omitempty" jsonschema:"Plain-text body"`
	BodyHTML           string   `json:"body_html,omitempty" jsonschema:"Optional HTML body"`
	ThreadID           string   `json:"thread_id,omitempty" jsonschema:"Optional thread ID when replying"`
	ReplyToMessageID   string   `json:"reply_to_message_id,omitempty" jsonschema:"Optional message ID being replied to"`
}

// SendMessageOutput summarizes the sent email message.
type SendMessageOutput struct {
	MessageID string `json:"message_id"`
	ThreadID  string `json:"thread_id"`
	Subject   string `json:"subject"`
}

func (h *Handler) sendMessage(ctx context.Context, in SendMessageInput) (SendMessageOutput, error) {
	if _, err := mcptransport.RequireSpaceID(ctx); err != nil {
		return SendMessageOutput{}, err
	}

	draftID := strings.TrimSpace(in.DraftID)
	if draftID == "" {
		draft, err := buildDraftFromInput(CreateDraftInput{
			ConnectedAccountID: in.ConnectedAccountID,
			To:                 in.To,
			Cc:                 in.Cc,
			Subject:            in.Subject,
			BodyText:           in.BodyText,
			BodyHTML:           in.BodyHTML,
			ThreadID:           in.ThreadID,
			ReplyToMessageID:   in.ReplyToMessageID,
		})
		if err != nil {
			return SendMessageOutput{}, err
		}
		created, err := h.coord.CreateDraft(ctx, &mailapp.CreateDraftRequest{Draft: draft})
		if err != nil {
			return SendMessageOutput{}, err
		}
		draftID = created.ID
	}

	sent, err := h.coord.SendDraft(ctx, &mailapp.SendDraftRequest{ID: draftID})
	if err != nil {
		return SendMessageOutput{}, err
	}

	return SendMessageOutput{
		MessageID: sent.ID,
		ThreadID:  sent.ThreadID,
		Subject:   sent.Subject,
	}, nil
}

func buildDraftFromInput(in CreateDraftInput) (*domainmail.Draft, error) {
	accID := strings.TrimSpace(in.ConnectedAccountID)
	if accID == "" {
		return nil, errors.E(errors.Invalid, "connected_account_id is required")
	}
	if len(in.To) == 0 {
		return nil, errors.E(errors.Invalid, "at least one recipient in 'to' is required")
	}

	to := make([]domainmail.Participant, 0, len(in.To))
	for _, addr := range in.To {
		if trimmed := strings.TrimSpace(addr); trimmed != "" {
			to = append(to, domainmail.Participant{Email: trimmed})
		}
	}
	cc := make([]domainmail.Participant, 0, len(in.Cc))
	for _, addr := range in.Cc {
		if trimmed := strings.TrimSpace(addr); trimmed != "" {
			cc = append(cc, domainmail.Participant{Email: trimmed})
		}
	}

	mode := domainmail.DraftMode(strings.TrimSpace(in.Mode))
	if mode == "" {
		mode = domainmail.DraftModeNew
	}

	draft := &domainmail.Draft{
		ConnectedAccountID: accID,
		Mode:               mode,
		To:                 to,
		Cc:                 cc,
		Subject:            strings.TrimSpace(in.Subject),
		BodyText:           in.BodyText,
		BodyHTML:           in.BodyHTML,
	}
	if tID := strings.TrimSpace(in.ThreadID); tID != "" {
		draft.ThreadID = new(tID)
	}
	if rID := strings.TrimSpace(in.ReplyToMessageID); rID != "" {
		draft.ReplyToMessageID = new(rID)
	}

	return draft, nil
}

// ModifyThreadInput defines parameters for mail_modify_thread.
type ModifyThreadInput struct {
	ID               string   `json:"id" jsonschema:"Mail thread ID (mth_...) to modify"`
	IsStarred        *bool    `json:"is_starred,omitempty" jsonschema:"Set starred state"`
	IsUnread         *bool    `json:"is_unread,omitempty" jsonschema:"Set unread state"`
	InInbox          *bool    `json:"in_inbox,omitempty" jsonschema:"Set inbox membership (false archives)"`
	InTrash          *bool    `json:"in_trash,omitempty" jsonschema:"Move thread to or out of trash"`
	InSpam           *bool    `json:"in_spam,omitempty" jsonschema:"Move thread to or out of spam"`
	AddMailboxIDs    []string `json:"add_mailbox_ids,omitempty" jsonschema:"Mailbox or label IDs to add"`
	RemoveMailboxIDs []string `json:"remove_mailbox_ids,omitempty" jsonschema:"Mailbox or label IDs to remove"`
}

// ModifyThreadOutput summarizes the updated mail thread flags.
type ModifyThreadOutput struct {
	ID        string `json:"id"`
	Subject   string `json:"subject"`
	IsUnread  bool   `json:"is_unread"`
	IsStarred bool   `json:"is_starred"`
	InInbox   bool   `json:"in_inbox"`
	InTrash   bool   `json:"in_trash"`
	InSpam    bool   `json:"in_spam"`
}

func (h *Handler) modifyThread(ctx context.Context, in ModifyThreadInput) (ModifyThreadOutput, error) {
	if _, err := mcptransport.RequireSpaceID(ctx); err != nil {
		return ModifyThreadOutput{}, err
	}
	id := strings.TrimSpace(in.ID)
	if id == "" {
		return ModifyThreadOutput{}, errors.E(errors.Invalid, "thread id is required")
	}

	addIDs := trimNonEmptyStrings(in.AddMailboxIDs)
	removeIDs := trimNonEmptyStrings(in.RemoveMailboxIDs)
	if in.IsStarred == nil && in.IsUnread == nil && in.InInbox == nil && in.InTrash == nil &&
		in.InSpam == nil && len(addIDs) == 0 && len(removeIDs) == 0 {
		return ModifyThreadOutput{}, errors.E(errors.Invalid, "at least one thread modification must be provided")
	}

	updated, err := h.coord.ModifyThread(ctx, &mailapp.ModifyThreadRequest{
		ID:               id,
		IsStarred:        in.IsStarred,
		IsUnread:         in.IsUnread,
		InInbox:          in.InInbox,
		InTrash:          in.InTrash,
		InSpam:           in.InSpam,
		AddMailboxIDs:    addIDs,
		RemoveMailboxIDs: removeIDs,
	})
	if err != nil {
		return ModifyThreadOutput{}, err
	}

	return ModifyThreadOutput{
		ID:        updated.ID,
		Subject:   updated.Subject,
		IsUnread:  updated.IsUnread,
		IsStarred: updated.IsStarred,
		InInbox:   updated.InInbox,
		InTrash:   updated.InTrash,
		InSpam:    updated.InSpam,
	}, nil
}

// ListDraftsInput defines parameters for mail_list_drafts.
type ListDraftsInput struct {
	ConnectedAccountID string `json:"connected_account_id,omitempty" jsonschema:"Optional connected account ID filter"`
	Limit              int    `json:"limit,omitempty" jsonschema:"Maximum drafts to return (1-50, default 20)"`
}

// DraftSummary summarizes a mail draft.
type DraftSummary struct {
	ID                 string   `json:"id"`
	ConnectedAccountID string   `json:"connected_account_id"`
	Subject            string   `json:"subject"`
	Mode               string   `json:"mode"`
	To                 []string `json:"to"`
	Cc                 []string `json:"cc,omitempty"`
	ThreadID           *string  `json:"thread_id,omitempty"`
	UpdateTime         string   `json:"update_time"`
}

// ListDraftsOutput is returned by mail_list_drafts.
type ListDraftsOutput struct {
	Drafts []DraftSummary `json:"drafts"`
}

func (h *Handler) listDrafts(ctx context.Context, in ListDraftsInput) (ListDraftsOutput, error) {
	spaceID, err := mcptransport.RequireSpaceID(ctx)
	if err != nil {
		return ListDraftsOutput{}, err
	}

	filter := &domainmail.ListDraftsFilter{
		Limit: mcptransport.ClampLimit(in.Limit, defaultThreadsLimit, maxThreadsLimit),
	}
	if acc := strings.TrimSpace(in.ConnectedAccountID); acc != "" {
		filter.ConnectedAccountID = new(acc)
	}

	drafts, err := h.agg.ListDrafts(ctx, spaceID, filter)
	if err != nil {
		return ListDraftsOutput{}, err
	}

	loc := mcptransport.ResolveLocation(ctx, h.spaceSettings.GetSettings, spaceID)
	items := make([]DraftSummary, 0, len(drafts))
	for _, d := range drafts {
		items = append(items, toDraftSummary(d, loc))
	}

	return ListDraftsOutput{Drafts: items}, nil
}

// UpdateDraftInput defines parameters for mail_update_draft.
type UpdateDraftInput struct {
	ID       string   `json:"id" jsonschema:"Draft ID (mdf_...) to update"`
	To       []string `json:"to,omitempty" jsonschema:"Updated recipient email addresses"`
	Cc       []string `json:"cc,omitempty" jsonschema:"Updated CC email addresses"`
	Bcc      []string `json:"bcc,omitempty" jsonschema:"Updated BCC email addresses"`
	Subject  *string  `json:"subject,omitempty" jsonschema:"Updated email subject line"`
	BodyText *string  `json:"body_text,omitempty" jsonschema:"Updated plain-text body"`
	BodyHTML *string  `json:"body_html,omitempty" jsonschema:"Updated HTML body"`
}

func (h *Handler) updateDraft(ctx context.Context, in UpdateDraftInput) (DraftSummary, error) {
	spaceID, err := mcptransport.RequireSpaceID(ctx)
	if err != nil {
		return DraftSummary{}, err
	}
	id := strings.TrimSpace(in.ID)
	if id == "" {
		return DraftSummary{}, errors.E(errors.Invalid, "draft id is required")
	}

	if in.To == nil && in.Cc == nil && in.Bcc == nil && in.Subject == nil && in.BodyText == nil && in.BodyHTML == nil {
		return DraftSummary{}, errors.E(errors.Invalid, "at least one field to update must be provided")
	}

	existing, err := h.agg.GetDraft(ctx, spaceID, id)
	if err != nil {
		return DraftSummary{}, err
	}

	merged := *existing
	var mask []string
	if in.To != nil {
		merged.To = parseParticipants(in.To)
		mask = append(mask, "to")
	}
	if in.Cc != nil {
		merged.Cc = parseParticipants(in.Cc)
		mask = append(mask, "cc")
	}
	if in.Bcc != nil {
		merged.Bcc = parseParticipants(in.Bcc)
		mask = append(mask, "bcc")
	}
	if in.Subject != nil {
		merged.Subject = strings.TrimSpace(*in.Subject)
		mask = append(mask, "subject")
	}
	if in.BodyText != nil {
		merged.BodyText = *in.BodyText
		mask = append(mask, "body_text")
	}
	if in.BodyHTML != nil {
		merged.BodyHTML = *in.BodyHTML
		mask = append(mask, "body_html")
	}

	updated, err := h.coord.UpdateDraft(ctx, &mailapp.UpdateDraftRequest{
		ID:         id,
		Draft:      &merged,
		UpdateMask: mask,
	})
	if err != nil {
		return DraftSummary{}, err
	}

	loc := mcptransport.ResolveLocation(ctx, h.spaceSettings.GetSettings, spaceID)
	return toDraftSummary(updated, loc), nil
}

// DeleteDraftInput defines parameters for mail_delete_draft.
type DeleteDraftInput struct {
	ID string `json:"id" jsonschema:"Draft ID (mdf_...) to delete"`
}

// DeleteDraftOutput confirms deletion of a mail draft.
type DeleteDraftOutput struct {
	ID      string `json:"id"`
	Deleted bool   `json:"deleted"`
}

func (h *Handler) deleteDraft(ctx context.Context, in DeleteDraftInput) (DeleteDraftOutput, error) {
	if _, err := mcptransport.RequireSpaceID(ctx); err != nil {
		return DeleteDraftOutput{}, err
	}
	id := strings.TrimSpace(in.ID)
	if id == "" {
		return DeleteDraftOutput{}, errors.E(errors.Invalid, "draft id is required")
	}

	if err := h.coord.DeleteDraft(ctx, &mailapp.DeleteDraftRequest{ID: id}); err != nil {
		return DeleteDraftOutput{}, err
	}

	return DeleteDraftOutput{
		ID:      id,
		Deleted: true,
	}, nil
}

func toDraftSummary(d *domainmail.Draft, loc *time.Location) DraftSummary {
	to := make([]string, 0, len(d.To))
	for _, p := range d.To {
		to = append(to, p.String())
	}
	cc := make([]string, 0, len(d.Cc))
	for _, p := range d.Cc {
		cc = append(cc, p.String())
	}
	return DraftSummary{
		ID:                 d.ID,
		ConnectedAccountID: d.ConnectedAccountID,
		Subject:            d.Subject,
		Mode:               string(d.Mode),
		To:                 to,
		Cc:                 cc,
		ThreadID:           d.ThreadID,
		UpdateTime:         d.UpdateTime.In(loc).Format(time.RFC3339),
	}
}

func parseParticipants(addrs []string) []domainmail.Participant {
	out := make([]domainmail.Participant, 0, len(addrs))
	for _, addr := range addrs {
		if trimmed := strings.TrimSpace(addr); trimmed != "" {
			out = append(out, domainmail.Participant{Email: trimmed})
		}
	}
	return out
}

func trimNonEmptyStrings(items []string) []string {
	var out []string
	for _, s := range items {
		if trimmed := strings.TrimSpace(s); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}
