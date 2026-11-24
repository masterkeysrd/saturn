package mail

import (
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
)

// WorkflowDependencies provides services and stores needed by mail workflow loaders, actions, and artifact readers.
type WorkflowDependencies struct {
	Coordinator       Coordinator
	MessageStore      domainmail.MessageStore
	MailboxStore      domainmail.MailboxStore
	ThreadStore       domainmail.ThreadStore
	AccountStore      connector.Store
	TokenManager      *connector.TokenManager
	ExternalProviders map[string]domainmail.ExternalMailProvider
}

// GetMessageParams identifies an email message for mail.message.
type GetMessageParams struct {
	ID string `json:"id" jsonschema:"Email message ID"`
}

// GetThreadParams identifies an email thread for mail.thread.
type GetThreadParams struct {
	ID string `json:"id" jsonschema:"Email thread ID"`
}

// ThreadMessageDetail is a chronological, LLM-friendly message projection inside a mail.thread loader result.
type ThreadMessageDetail struct {
	ID        string `json:"id"`
	From      string `json:"from"`
	SentAt    string `json:"sent_at"`
	BodyText  string `json:"body_text"`
	Truncated bool   `json:"truncated"`
}

// ThreadDetail is the workflow-facing projection of a mail thread and its chronological messages.
type ThreadDetail struct {
	ID            string                `json:"id"`
	Subject       string                `json:"subject"`
	Participants  []string              `json:"participants"`
	MessageCount  int                   `json:"message_count"`
	LastMessageID string                `json:"last_message_id"`
	LastMessageAt string                `json:"last_message_at"`
	Messages      []ThreadMessageDetail `json:"messages"`
}

const (
	maxThreadMessageBodyChars = 6000
	maxThreadTotalBodyChars   = 40000
)

// MessageDetail is the workflow-facing projection of a mail message and cached body.
type MessageDetail struct {
	ID                 string                   `json:"id"`
	ConnectedAccountID string                   `json:"connected_account_id"`
	ThreadID           string                   `json:"thread_id"`
	Subject            string                   `json:"subject"`
	Snippet            string                   `json:"snippet"`
	From               domainmail.Participant   `json:"from"`
	To                 []domainmail.Participant `json:"to"`
	ReceivedAt         string                   `json:"received_at"`
	IsUnread           bool                     `json:"is_unread"`
	IsStarred          bool                     `json:"is_starred"`
	BodyPlain          string                   `json:"body_plain"`
	BodyHTML           string                   `json:"body_html"`
	Attachments        []workflow.ArtifactRef   `json:"attachments"`
}

// ListMailboxesParams configures filtering for mail.mailboxes.
type ListMailboxesParams struct {
	ConnectedAccountID string `json:"connected_account_id,omitempty" jsonschema:"Optional connected account ID filter"`
}

// MailboxSummary is the workflow-facing projection of a domainmail.Mailbox.
type MailboxSummary struct {
	ID                 string `json:"id"`
	ConnectedAccountID string `json:"connected_account_id"`
	Name               string `json:"name"`
	SystemRole         string `json:"system_role"`
	UnreadCount        int    `json:"unread_count"`
	TotalCount         int    `json:"total_count"`
}

// CreateDraftInputs defines inputs for the mail.create_draft action step.
type CreateDraftInputs struct {
	ConnectedAccountID string                   `json:"connected_account_id" jsonschema:"Connected mail account ID used to store/send the draft"`
	To                 []domainmail.Participant `json:"to" jsonschema:"Recipient list"`
	Subject            string                   `json:"subject" jsonschema:"Email subject"`
	BodyHTML           string                   `json:"body_html,omitempty" jsonschema:"Optional HTML body"`
	BodyText           string                   `json:"body_text,omitempty" jsonschema:"Optional plain-text body"`
	ReplyToMessageID   string                   `json:"reply_to_message_id,omitempty" jsonschema:"Optional message ID when creating a reply draft"`
}

// CreateDraftOutput defines outputs for mail.create_draft.
type CreateDraftOutput struct {
	DraftID string `json:"draft_id"`
}

// ModifyLabelsInputs defines inputs for the mail.modify_labels action step.
type ModifyLabelsInputs struct {
	MessageID        string   `json:"message_id,omitempty" jsonschema:"Optional message ID used to resolve thread_id"`
	ThreadID         string   `json:"thread_id,omitempty" jsonschema:"Target thread ID"`
	AddMailboxIDs    []string `json:"add_mailbox_ids,omitempty" jsonschema:"Mailbox/label IDs to add"`
	RemoveMailboxIDs []string `json:"remove_mailbox_ids,omitempty" jsonschema:"Mailbox/label IDs to remove"`
	Archive          bool     `json:"archive,omitempty" jsonschema:"When true, removes the thread from Inbox"`
}

// ModifyLabelsOutput defines outputs for mail.modify_labels.
type ModifyLabelsOutput struct {
	Updated bool `json:"updated"`
}

// SaveThreadSummaryInputs defines inputs for the mail.save_thread_summary action step.
type SaveThreadSummaryInputs struct {
	ThreadID      string   `json:"thread_id" jsonschema:"Target thread ID"`
	Language      string   `json:"language,omitempty" jsonschema:"Summary language tag (en or es)"`
	TLDR          string   `json:"tldr" jsonschema:"Concise summary paragraph"`
	KeyPoints     []string `json:"key_points,omitempty" jsonschema:"Distinct key points of the conversation"`
	ActionItems   []string `json:"action_items,omitempty" jsonschema:"Requested or implied action items"`
	LastMessageID string   `json:"last_message_id,omitempty" jsonschema:"ID of the latest message covered by the summary"`
	LastMessageAt string   `json:"last_message_at,omitempty" jsonschema:"RFC3339 timestamp of the latest summarized message"`
	MessageCount  int      `json:"message_count,omitempty" jsonschema:"Number of messages covered by the summary"`
}

// SaveThreadSummaryOutput defines outputs for mail.save_thread_summary.
type SaveThreadSummaryOutput struct {
	ThreadID string `json:"thread_id"`
	Language string `json:"language"`
}

// RegisterWorkflows registers mail DataLoaders, Action Steps, and the mail:// ArtifactReader onto reg.
func RegisterWorkflows(reg *workflow.Registry, deps WorkflowDependencies) {
	registerMailLoaders(reg, deps)
	registerMailSteps(reg, deps)
	registerMailSystemFlows(reg)
	reg.RegisterArtifactReader(&mailArtifactReader{deps: deps})
}

func registerMailLoaders(reg *workflow.Registry, deps WorkflowDependencies) {
	reg.RegisterLoader(workflow.LoaderDescriptor{
		Name:        "mail.message",
		Owner:       "mail",
		DisplayName: "Get Mail Message",
		Description: "Loads email metadata, cached plain/HTML body, and mail:// attachment artifact references.",
	}, func(ctx context.Context, spaceID string, params GetMessageParams) (*MessageDetail, error) {
		msgID := strings.TrimSpace(params.ID)
		if msgID == "" {
			return nil, nil
		}
		msg, err := deps.MessageStore.GetByID(ctx, spaceID, msgID)
		if err != nil {
			if errors.Is(err, errors.NotExist) {
				return nil, nil
			}
			return nil, err
		}
		if msg == nil {
			return nil, nil
		}

		detail := &MessageDetail{
			ID:                 msg.ID,
			ConnectedAccountID: msg.ConnectedAccountID,
			ThreadID:           msg.ThreadID,
			Subject:            msg.Subject,
			Snippet:            msg.Snippet,
			From:               msg.From,
			To:                 msg.To,
			ReceivedAt:         msg.EffectiveTime().UTC().Format(time.RFC3339),
			IsUnread:           msg.IsUnread,
			IsStarred:          msg.IsStarred,
			Attachments:        make([]workflow.ArtifactRef, 0, len(msg.Attachments)),
		}
		for _, att := range msg.Attachments {
			detail.Attachments = append(detail.Attachments, workflow.ArtifactRef{
				Ref:         fmt.Sprintf("mail://%s/%s", msg.ID, att.ID),
				Filename:    att.Filename,
				ContentType: att.ContentType,
				Size:        att.Size,
			})
		}

		if body, bodyErr := deps.MessageStore.GetBody(ctx, spaceID, msg.ID); bodyErr == nil && body != nil {
			detail.BodyPlain = body.PlainText
			detail.BodyHTML = body.SanitizedHTML
		}

		return detail, nil
	})

	reg.RegisterLoader(workflow.LoaderDescriptor{
		Name:        "mail.thread",
		Owner:       "mail",
		DisplayName: "Get Mail Thread",
		Description: "Loads a thread with chronological sanitized plain-text message bodies capped for LLM token budgets.",
	}, func(ctx context.Context, spaceID string, params GetThreadParams) (*ThreadDetail, error) {
		threadID := strings.TrimSpace(params.ID)
		if threadID == "" {
			return nil, nil
		}
		thread, err := deps.ThreadStore.GetByID(ctx, spaceID, threadID)
		if err != nil {
			if errors.Is(err, errors.NotExist) {
				return nil, nil
			}
			return nil, err
		}
		if thread == nil {
			return nil, nil
		}

		msgs, err := deps.MessageStore.ListByThreadID(ctx, spaceID, thread.ID)
		if err != nil {
			return nil, err
		}

		detail := &ThreadDetail{
			ID:            thread.ID,
			Subject:       thread.Subject,
			Participants:  make([]string, 0, len(thread.Participants)),
			MessageCount:  thread.MessageCount,
			LastMessageAt: thread.LastMessageAt.UTC().Format(time.RFC3339),
			Messages:      make([]ThreadMessageDetail, 0, len(msgs)),
		}
		for _, p := range thread.Participants {
			detail.Participants = append(detail.Participants, p.String())
		}

		totalChars := 0
		for _, msg := range msgs {
			body, truncated := threadMessageBody(ctx, deps.MessageStore, spaceID, msg)
			if totalChars+len(body) > maxThreadTotalBodyChars {
				body, _ = truncateRunes(body, max(0, maxThreadTotalBodyChars-totalChars))
				truncated = true
			}
			totalChars += len(body)

			detail.Messages = append(detail.Messages, ThreadMessageDetail{
				ID:        msg.ID,
				From:      msg.From.String(),
				SentAt:    msg.EffectiveTime().UTC().Format(time.RFC3339),
				BodyText:  body,
				Truncated: truncated,
			})
		}
		if len(msgs) > 0 {
			detail.LastMessageID = msgs[len(msgs)-1].ID
		}

		return detail, nil
	})

	reg.RegisterLoader(workflow.LoaderDescriptor{
		Name:        "mail.mailboxes",
		Owner:       "mail",
		DisplayName: "Mailboxes & Labels",
		Description: "Lists mail folders and labels, optionally filtered by connected_account_id.",
	}, func(ctx context.Context, spaceID string, params ListMailboxesParams) ([]MailboxSummary, error) {
		filter := &domainmail.ListMailboxesFilter{}
		if accID := strings.TrimSpace(params.ConnectedAccountID); accID != "" {
			filter.ConnectedAccountID = &accID
		}
		mailboxes, err := deps.MailboxStore.ListBySpace(ctx, spaceID, filter)
		if err != nil {
			return nil, err
		}
		out := make([]MailboxSummary, 0, len(mailboxes))
		for _, m := range mailboxes {
			out = append(out, MailboxSummary{
				ID:                 m.ID,
				ConnectedAccountID: m.ConnectedAccountID,
				Name:               m.Name,
				SystemRole:         string(m.SystemRole),
				UnreadCount:        m.UnreadCount,
				TotalCount:         m.TotalCount,
			})
		}
		return out, nil
	})
}

func registerMailSteps(reg *workflow.Registry, deps WorkflowDependencies) {
	reg.RegisterStep(workflow.StepDescriptor{
		Type:                "mail.create_draft",
		Owner:               "mail",
		Category:            "action",
		DisplayName:         "Create Mail Draft",
		Description:         "Creates an email draft locally and syncs it to the connected mail provider.",
		InvalidatesPrefixes: []string{"mail."},
	}, func(ctx context.Context, execCtx *workflow.StepContext[CreateDraftInputs]) (CreateDraftOutput, error) {
		in := execCtx.Inputs
		connID := strings.TrimSpace(in.ConnectedAccountID)
		if connID == "" {
			return CreateDraftOutput{}, fmt.Errorf("connected_account_id is required")
		}

		draft := &domainmail.Draft{
			SpaceID:            execCtx.SpaceID,
			ConnectedAccountID: connID,
			Mode:               domainmail.DraftModeNew,
			To:                 in.To,
			Subject:            in.Subject,
			BodyHTML:           in.BodyHTML,
			BodyText:           in.BodyText,
		}
		if replyTo := strings.TrimSpace(in.ReplyToMessageID); replyTo != "" {
			draft.Mode = domainmail.DraftModeReply
			draft.ReplyToMessageID = &replyTo
			if msg, err := deps.MessageStore.GetByID(ctx, execCtx.SpaceID, replyTo); err == nil && msg != nil {
				draft.ThreadID = &msg.ThreadID
			}
		}

		scopedCtx := auth.WithSpaceScope(ctx, execCtx.SpaceID, string(space.RoleOwner))
		created, err := deps.Coordinator.CreateDraft(scopedCtx, &CreateDraftRequest{Draft: draft})
		if err != nil {
			return CreateDraftOutput{}, err
		}
		return CreateDraftOutput{DraftID: created.ID}, nil
	})

	reg.RegisterStep(workflow.StepDescriptor{
		Type:                "mail.modify_labels",
		Owner:               "mail",
		Category:            "action",
		DisplayName:         "Modify Mail Labels",
		Description:         "Adds/removes mailbox labels or archives an email thread.",
		InvalidatesPrefixes: []string{"mail."},
	}, func(ctx context.Context, execCtx *workflow.StepContext[ModifyLabelsInputs]) (ModifyLabelsOutput, error) {
		in := execCtx.Inputs
		threadID := strings.TrimSpace(in.ThreadID)
		if threadID == "" {
			msgID := strings.TrimSpace(in.MessageID)
			if msgID == "" {
				return ModifyLabelsOutput{}, fmt.Errorf("thread_id or message_id is required")
			}
			msg, err := deps.MessageStore.GetByID(ctx, execCtx.SpaceID, msgID)
			if err != nil {
				return ModifyLabelsOutput{}, err
			}
			if msg == nil {
				return ModifyLabelsOutput{}, fmt.Errorf("message %q not found", msgID)
			}
			threadID = msg.ThreadID
		}

		req := &ModifyThreadRequest{
			ID:               threadID,
			AddMailboxIDs:    in.AddMailboxIDs,
			RemoveMailboxIDs: in.RemoveMailboxIDs,
		}
		if in.Archive {
			req.InInbox = new(false)
		}

		scopedCtx := auth.WithSpaceScope(ctx, execCtx.SpaceID, string(space.RoleOwner))
		if _, err := deps.Coordinator.ModifyThread(scopedCtx, req); err != nil {
			return ModifyLabelsOutput{}, err
		}
		return ModifyLabelsOutput{Updated: true}, nil
	})

	reg.RegisterStep(workflow.StepDescriptor{
		Type:                "mail.save_thread_summary",
		Owner:               "mail",
		Category:            "action",
		DisplayName:         "Save Thread Summary",
		Description:         "Persists an AI-generated TL;DR, key points, and action items as the cached summary of an email thread.",
		InvalidatesPrefixes: []string{"mail."},
	}, func(ctx context.Context, execCtx *workflow.StepContext[SaveThreadSummaryInputs]) (SaveThreadSummaryOutput, error) {
		in := execCtx.Inputs
		threadID := strings.TrimSpace(in.ThreadID)
		if threadID == "" {
			return SaveThreadSummaryOutput{}, fmt.Errorf("thread_id is required")
		}

		language := strings.ToLower(strings.TrimSpace(in.Language))
		if primary, _, ok := strings.Cut(language, "-"); ok {
			language = primary
		}
		if !strings.HasPrefix(language, "es") {
			language = "en"
		}

		lastMessageAt := time.Time{}
		if raw := strings.TrimSpace(in.LastMessageAt); raw != "" {
			parsed, err := time.Parse(time.RFC3339, raw)
			if err != nil {
				return SaveThreadSummaryOutput{}, fmt.Errorf("invalid last_message_at %q: %w", raw, err)
			}
			lastMessageAt = parsed.UTC()
		}

		var flowRunID *string
		if runID := strings.TrimSpace(execCtx.FlowRunID); runID != "" {
			flowRunID = &runID
		}

		summary := &domainmail.ThreadSummary{
			ThreadID:      threadID,
			SpaceID:       execCtx.SpaceID,
			Language:      language,
			TLDR:          strings.TrimSpace(in.TLDR),
			KeyPoints:     in.KeyPoints,
			ActionItems:   in.ActionItems,
			LastMessageID: strings.TrimSpace(in.LastMessageID),
			LastMessageAt: lastMessageAt,
			MessageCount:  in.MessageCount,
			FlowRunID:     flowRunID,
		}

		scopedCtx := auth.WithSpaceScope(ctx, execCtx.SpaceID, string(space.RoleOwner))
		saved, err := deps.Coordinator.SaveThreadSummary(scopedCtx, &SaveThreadSummaryRequest{Summary: summary})
		if err != nil {
			return SaveThreadSummaryOutput{}, err
		}
		return SaveThreadSummaryOutput{ThreadID: saved.ThreadID, Language: saved.Language}, nil
	})
}

// threadMessageBody resolves the plain-text body for a message in a thread loader pass,
// stripping HTML when no plain-text alternative exists, and caps the text per message.
func threadMessageBody(ctx context.Context, store domainmail.MessageStore, spaceID string, msg *domainmail.Message) (string, bool) {
	plain := strings.TrimSpace(msg.Snippet)
	if body, err := store.GetBody(ctx, spaceID, msg.ID); err == nil && body != nil {
		if strings.TrimSpace(body.PlainText) != "" {
			plain = strings.TrimSpace(body.PlainText)
		} else if strings.TrimSpace(body.SanitizedHTML) != "" {
			plain = stripHTMLTags(body.SanitizedHTML)
		}
	}
	return truncateRunes(plain, maxThreadMessageBodyChars)
}

// stripHTMLTags removes HTML tags and collapses whitespace into readable plain text.
func stripHTMLTags(htmlBody string) string {
	var b strings.Builder
	b.Grow(len(htmlBody))
	inTag := false
	for _, r := range htmlBody {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
			b.WriteRune(' ')
		case !inTag:
			b.WriteRune(r)
		}
	}
	return strings.Join(strings.Fields(b.String()), " ")
}

// truncateRunes caps s to at most limit runes, reporting whether truncation occurred.
func truncateRunes(s string, limit int) (string, bool) {
	count := 0
	for i := range s {
		if count == limit {
			return s[:i], true
		}
		count++
	}
	return s, false
}

type mailArtifactReader struct {
	deps WorkflowDependencies
}

func (r *mailArtifactReader) Scheme() string {
	return "mail"
}

func (r *mailArtifactReader) Read(ctx context.Context, spaceID string, ref string) (workflow.ResolvedArtifact, error) {
	const op errors.Op = "application/mail.mailArtifactReader.Read"

	trimmed := strings.TrimPrefix(ref, "mail://")
	msgID, attID, ok := strings.Cut(trimmed, "/")
	if !ok || strings.TrimSpace(msgID) == "" || strings.TrimSpace(attID) == "" {
		return workflow.ResolvedArtifact{}, errors.E(op, errors.Invalid, fmt.Errorf("invalid mail artifact ref %q (expected mail://<message_id>/<attachment_id>)", ref))
	}

	msg, err := r.deps.MessageStore.GetByID(ctx, spaceID, msgID)
	if err != nil {
		return workflow.ResolvedArtifact{}, errors.E(op, err)
	}
	if msg == nil {
		return workflow.ResolvedArtifact{}, errors.E(op, errors.NotExist, fmt.Errorf("message %q not found", msgID))
	}
	if msg.ConnectedAccountID == "" || msg.ProviderMessageID == nil {
		return workflow.ResolvedArtifact{}, errors.E(op, errors.NotExist, "provider message attachment not available")
	}

	var targetAtt *domainmail.AttachmentMeta
	for i := range msg.Attachments {
		if msg.Attachments[i].ID == attID {
			targetAtt = &msg.Attachments[i]
			break
		}
	}

	acc, err := r.deps.AccountStore.GetAccount(ctx, spaceID, msg.ConnectedAccountID)
	if err != nil {
		return workflow.ResolvedArtifact{}, errors.E(op, err)
	}
	if acc == nil {
		return workflow.ResolvedArtifact{}, errors.E(op, errors.NotExist, "connected account not found")
	}

	prov, ok := r.deps.ExternalProviders[acc.Provider]
	if !ok {
		return workflow.ResolvedArtifact{}, errors.E(op, errors.NotExist, fmt.Errorf("mail provider %q not supported", acc.Provider))
	}

	accessToken, err := r.deps.TokenManager.TokenSource(ctx, spaceID, msg.ConnectedAccountID)
	if err != nil {
		return workflow.ResolvedArtifact{}, errors.E(op, err)
	}
	if accessToken == "" {
		return workflow.ResolvedArtifact{}, errors.E(op, errors.Unauthenticated, "empty provider access token")
	}

	stream, contentType, _, err := prov.OpenAttachmentStream(ctx, accessToken, *msg.ProviderMessageID, attID)
	if err != nil {
		return workflow.ResolvedArtifact{}, errors.E(op, err)
	}
	defer stream.Close()

	data, err := io.ReadAll(io.LimitReader(stream, maxUploadSize+1))
	if err != nil {
		return workflow.ResolvedArtifact{}, errors.E(op, err)
	}
	if len(data) > maxUploadSize {
		return workflow.ResolvedArtifact{}, errors.E(op, errors.Invalid, "attachment exceeds maximum allowed size of 25 MB")
	}

	filename := attID
	if targetAtt != nil {
		if targetAtt.Filename != "" {
			filename = targetAtt.Filename
		}
		if targetAtt.ContentType != "" {
			contentType = targetAtt.ContentType
		}
	}

	return workflow.ResolvedArtifact{
		Ref:         ref,
		Filename:    filename,
		ContentType: contentType,
		Data:        data,
	}, nil
}
