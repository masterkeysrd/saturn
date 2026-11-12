package mail

import (
	"context"

	mailv1 "github.com/masterkeysrd/saturn/apis/saturn/mail/v1"
	mailaggregator "github.com/masterkeysrd/saturn/internal/aggregator/mail"
	appmail "github.com/masterkeysrd/saturn/internal/application/mail"
	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Handler implements mailv1.MailServiceServer, routing mutations to
// the Coordinator and queries to the Aggregator.
type Handler struct {
	mailv1.UnimplementedMailServiceServer
	coordinator appmail.Coordinator
	aggregator  *mailaggregator.Service
}

// NewHandler creates a new Mail gRPC service handler.
func NewHandler(coordinator appmail.Coordinator, aggregator *mailaggregator.Service) *Handler {
	return &Handler{
		coordinator: coordinator,
		aggregator:  aggregator,
	}
}

var _ mailv1.MailServiceServer = (*Handler)(nil)

func getSpaceID(ctx context.Context, op errors.Op) (string, error) {
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok || spaceID == "" {
		return "", errors.E(op, errors.Unauthenticated, "missing active space context")
	}
	return spaceID, nil
}

// ListMailboxes returns all mailboxes in the current space.
func (h *Handler) ListMailboxes(ctx context.Context, req *mailv1.ListMailboxesRequest) (*mailv1.ListMailboxesResponse, error) {
	const op errors.Op = "grpc/mail.ListMailboxes"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	filter := &domainmail.ListMailboxesFilter{}
	if req.GetConnectedAccountId() != "" {
		accID := req.GetConnectedAccountId()
		filter.ConnectedAccountID = &accID
	}
	if req.GetSystemRole() != mailv1.MailboxRole_MAILBOX_ROLE_UNSPECIFIED {
		role := mapProtoRoleToDomain(req.GetSystemRole())
		filter.SystemRole = &role
	}

	mailboxes, err := h.aggregator.ListMailboxes(ctx, spaceID, filter)
	if err != nil {
		return nil, err
	}

	protoMailboxes := make([]*mailv1.Mailbox, len(mailboxes))
	for i, m := range mailboxes {
		protoMailboxes[i] = mapDomainMailboxToProto(m)
	}

	return &mailv1.ListMailboxesResponse{
		Mailboxes: protoMailboxes,
	}, nil
}

// CreateMailbox creates a new custom mailbox.
func (h *Handler) CreateMailbox(ctx context.Context, req *mailv1.CreateMailboxRequest) (*mailv1.Mailbox, error) {
	domainMbx := mapProtoMailboxToDomain(req.GetMailbox())
	mbx, err := h.coordinator.CreateMailbox(ctx, &appmail.CreateMailboxRequest{
		Mailbox: domainMbx,
	})
	if err != nil {
		return nil, err
	}
	return mapDomainMailboxToProto(mbx), nil
}

// UpdateMailbox updates an existing custom mailbox.
func (h *Handler) UpdateMailbox(ctx context.Context, req *mailv1.UpdateMailboxRequest) (*mailv1.Mailbox, error) {
	domainMbx := mapProtoMailboxToDomain(req.GetMailbox())
	var mask []string
	if req.GetUpdateMask() != nil {
		mask = req.GetUpdateMask().GetPaths()
	}

	mbx, err := h.coordinator.UpdateMailbox(ctx, &appmail.UpdateMailboxRequest{
		ID:         req.GetId(),
		Mailbox:    domainMbx,
		UpdateMask: mask,
	})
	if err != nil {
		return nil, err
	}
	return mapDomainMailboxToProto(mbx), nil
}

// DeleteMailbox deletes a custom mailbox.
func (h *Handler) DeleteMailbox(ctx context.Context, req *mailv1.DeleteMailboxRequest) (*emptypb.Empty, error) {
	err := h.coordinator.DeleteMailbox(ctx, &appmail.DeleteMailboxRequest{
		ID: req.GetId(),
	})
	if err != nil {
		return nil, err
	}
	return &emptypb.Empty{}, nil
}

// ListThreads lists email threads with optional query, system bucket, or mailbox filter.
func (h *Handler) ListThreads(ctx context.Context, req *mailv1.ListThreadsRequest) (*mailv1.ListThreadsResponse, error) {
	const op errors.Op = "grpc/mail.ListThreads"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	filter := &domainmail.ListThreadsFilter{
		Query:  req.GetQuery(),
		Limit:  int(req.GetPageSize()),
		Offset: 0,
	}

	if req.GetConnectedAccountId() != "" {
		accID := req.GetConnectedAccountId()
		filter.ConnectedAccountID = &accID
	}
	if req.GetMailboxId() != "" {
		mbxID := req.GetMailboxId()
		filter.MailboxID = &mbxID
	}
	if req.GetSystemBucket() != mailv1.MailboxRole_MAILBOX_ROLE_UNSPECIFIED {
		bucket := mapProtoRoleToDomain(req.GetSystemBucket())
		filter.SystemBucket = &bucket
	}
	if req.IsUnread != nil {
		filter.IsUnread = req.IsUnread
	}
	if req.IsStarred != nil {
		filter.IsStarred = req.IsStarred
	}

	threads, total, err := h.aggregator.ListThreads(ctx, spaceID, filter)
	if err != nil {
		return nil, err
	}

	protoThreads := make([]*mailv1.Thread, len(threads))
	for i, t := range threads {
		protoThreads[i] = mapDomainThreadToProto(t)
	}

	return &mailv1.ListThreadsResponse{
		Threads:   protoThreads,
		TotalSize: int32(total),
	}, nil
}

// GetThread retrieves a single thread and hydrates all its messages and message bodies.
func (h *Handler) GetThread(ctx context.Context, req *mailv1.GetThreadRequest) (*mailv1.Thread, error) {
	const op errors.Op = "grpc/mail.GetThread"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	proj, err := h.aggregator.GetThread(ctx, spaceID, req.GetId())
	if err != nil {
		return nil, err
	}

	return mapThreadProjectionToProto(proj), nil
}

// ModifyThread modifies labels or flags on an email thread.
func (h *Handler) ModifyThread(ctx context.Context, req *mailv1.ModifyThreadRequest) (*mailv1.Thread, error) {
	th, err := h.coordinator.ModifyThread(ctx, &appmail.ModifyThreadRequest{
		ID:               req.GetId(),
		AddMailboxIDs:    req.GetAddMailboxIds(),
		RemoveMailboxIDs: req.GetRemoveMailboxIds(),
		IsStarred:        req.IsStarred,
		IsUnread:         req.IsUnread,
		InInbox:          req.InInbox,
		InTrash:          req.InTrash,
		InSpam:           req.InSpam,
	})
	if err != nil {
		return nil, err
	}
	return mapDomainThreadToProto(th), nil
}

// BatchModifyThreads modifies labels or flags on multiple email threads in batch.
func (h *Handler) BatchModifyThreads(ctx context.Context, req *mailv1.BatchModifyThreadsRequest) (*emptypb.Empty, error) {
	err := h.coordinator.BatchModifyThreads(ctx, &appmail.BatchModifyThreadsRequest{
		IDs:              req.GetIds(),
		AddMailboxIDs:    req.GetAddMailboxIds(),
		RemoveMailboxIDs: req.GetRemoveMailboxIds(),
		IsStarred:        req.IsStarred,
		IsUnread:         req.IsUnread,
		InInbox:          req.InInbox,
		InTrash:          req.InTrash,
		InSpam:           req.InSpam,
	})
	if err != nil {
		return nil, err
	}
	return &emptypb.Empty{}, nil
}

// ListDrafts lists drafts matching filter criteria.
func (h *Handler) ListDrafts(ctx context.Context, req *mailv1.ListDraftsRequest) (*mailv1.ListDraftsResponse, error) {
	const op errors.Op = "grpc/mail.ListDrafts"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	filter := &domainmail.ListDraftsFilter{
		Limit:  int(req.GetPageSize()),
		Offset: 0,
	}
	if req.GetConnectedAccountId() != "" {
		accID := req.GetConnectedAccountId()
		filter.ConnectedAccountID = &accID
	}
	if req.GetThreadId() != "" {
		thID := req.GetThreadId()
		filter.ThreadID = &thID
	}

	drafts, err := h.aggregator.ListDrafts(ctx, spaceID, filter)
	if err != nil {
		return nil, err
	}

	protoDrafts := make([]*mailv1.Draft, len(drafts))
	for i, d := range drafts {
		protoDrafts[i] = mapDomainDraftToProto(d)
	}

	return &mailv1.ListDraftsResponse{
		Drafts:    protoDrafts,
		TotalSize: int32(len(drafts)),
	}, nil
}

// GetDraft retrieves a draft by ID.
func (h *Handler) GetDraft(ctx context.Context, req *mailv1.GetDraftRequest) (*mailv1.Draft, error) {
	const op errors.Op = "grpc/mail.GetDraft"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	draft, err := h.aggregator.GetDraft(ctx, spaceID, req.GetId())
	if err != nil {
		return nil, err
	}
	return mapDomainDraftToProto(draft), nil
}

// CreateDraft creates a new draft composition.
func (h *Handler) CreateDraft(ctx context.Context, req *mailv1.CreateDraftRequest) (*mailv1.Draft, error) {
	domainDraft := mapProtoDraftToDomain(req.GetDraft())
	draft, err := h.coordinator.CreateDraft(ctx, &appmail.CreateDraftRequest{
		Draft: domainDraft,
	})
	if err != nil {
		return nil, err
	}
	return mapDomainDraftToProto(draft), nil
}

// UpdateDraft updates an existing draft composition.
func (h *Handler) UpdateDraft(ctx context.Context, req *mailv1.UpdateDraftRequest) (*mailv1.Draft, error) {
	domainDraft := mapProtoDraftToDomain(req.GetDraft())
	var mask []string
	if req.GetUpdateMask() != nil {
		mask = req.GetUpdateMask().GetPaths()
	}

	draft, err := h.coordinator.UpdateDraft(ctx, &appmail.UpdateDraftRequest{
		ID:         req.GetId(),
		Draft:      domainDraft,
		UpdateMask: mask,
	})
	if err != nil {
		return nil, err
	}
	return mapDomainDraftToProto(draft), nil
}

// DeleteDraft deletes a draft composition.
func (h *Handler) DeleteDraft(ctx context.Context, req *mailv1.DeleteDraftRequest) (*emptypb.Empty, error) {
	err := h.coordinator.DeleteDraft(ctx, &appmail.DeleteDraftRequest{
		ID: req.GetId(),
	})
	if err != nil {
		return nil, err
	}
	return &emptypb.Empty{}, nil
}

// SendDraft sends an existing draft composition via the provider.
func (h *Handler) SendDraft(ctx context.Context, req *mailv1.SendDraftRequest) (*mailv1.Message, error) {
	msg, err := h.coordinator.SendDraft(ctx, &appmail.SendDraftRequest{
		ID: req.GetId(),
	})
	if err != nil {
		return nil, err
	}
	return mapDomainMessageToProto(msg), nil
}

// Helper mapping functions

func mapDomainBucketToProto(role domainmail.SystemBucket) mailv1.MailboxRole {
	switch role {
	case domainmail.SystemBucketInbox:
		return mailv1.MailboxRole_MAILBOX_ROLE_INBOX
	case domainmail.SystemBucketStarred:
		return mailv1.MailboxRole_MAILBOX_ROLE_STARRED
	case domainmail.SystemBucketSent:
		return mailv1.MailboxRole_MAILBOX_ROLE_SENT
	case domainmail.SystemBucketDrafts:
		return mailv1.MailboxRole_MAILBOX_ROLE_DRAFTS
	case domainmail.SystemBucketArchive:
		return mailv1.MailboxRole_MAILBOX_ROLE_ARCHIVE
	case domainmail.SystemBucketTrash:
		return mailv1.MailboxRole_MAILBOX_ROLE_TRASH
	case domainmail.SystemBucketSpam:
		return mailv1.MailboxRole_MAILBOX_ROLE_SPAM
	case domainmail.SystemBucketCustom:
		return mailv1.MailboxRole_MAILBOX_ROLE_CUSTOM
	default:
		return mailv1.MailboxRole_MAILBOX_ROLE_UNSPECIFIED
	}
}

func mapProtoRoleToDomain(role mailv1.MailboxRole) domainmail.SystemBucket {
	switch role {
	case mailv1.MailboxRole_MAILBOX_ROLE_INBOX:
		return domainmail.SystemBucketInbox
	case mailv1.MailboxRole_MAILBOX_ROLE_STARRED:
		return domainmail.SystemBucketStarred
	case mailv1.MailboxRole_MAILBOX_ROLE_SENT:
		return domainmail.SystemBucketSent
	case mailv1.MailboxRole_MAILBOX_ROLE_DRAFTS:
		return domainmail.SystemBucketDrafts
	case mailv1.MailboxRole_MAILBOX_ROLE_ARCHIVE:
		return domainmail.SystemBucketArchive
	case mailv1.MailboxRole_MAILBOX_ROLE_TRASH:
		return domainmail.SystemBucketTrash
	case mailv1.MailboxRole_MAILBOX_ROLE_SPAM:
		return domainmail.SystemBucketSpam
	default:
		return domainmail.SystemBucketCustom
	}
}

func mapDomainDraftModeToProto(mode domainmail.DraftMode) mailv1.DraftMode {
	switch mode {
	case domainmail.DraftModeNew:
		return mailv1.DraftMode_DRAFT_MODE_NEW
	case domainmail.DraftModeReply:
		return mailv1.DraftMode_DRAFT_MODE_REPLY
	case domainmail.DraftModeReplyAll:
		return mailv1.DraftMode_DRAFT_MODE_REPLY_ALL
	case domainmail.DraftModeForward:
		return mailv1.DraftMode_DRAFT_MODE_FORWARD
	default:
		return mailv1.DraftMode_DRAFT_MODE_UNSPECIFIED
	}
}

func mapProtoDraftModeToDomain(mode mailv1.DraftMode) domainmail.DraftMode {
	switch mode {
	case mailv1.DraftMode_DRAFT_MODE_NEW:
		return domainmail.DraftModeNew
	case mailv1.DraftMode_DRAFT_MODE_REPLY:
		return domainmail.DraftModeReply
	case mailv1.DraftMode_DRAFT_MODE_REPLY_ALL:
		return domainmail.DraftModeReplyAll
	case mailv1.DraftMode_DRAFT_MODE_FORWARD:
		return domainmail.DraftModeForward
	default:
		return domainmail.DraftModeNew
	}
}

func mapDomainMailboxToProto(m *domainmail.Mailbox) *mailv1.Mailbox {
	if m == nil {
		return nil
	}
	color := ""
	if m.Color != nil {
		color = *m.Color
	}
	provID := ""
	if m.ProviderMailboxID != nil {
		provID = *m.ProviderMailboxID
	}

	return &mailv1.Mailbox{
		Id:                 m.ID,
		SpaceId:            m.SpaceID,
		ConnectedAccountId: m.ConnectedAccountID,
		ProviderMailboxId:  provID,
		Name:               m.Name,
		SystemRole:         mapDomainBucketToProto(m.SystemRole),
		Color:              color,
		UnreadCount:        int32(m.UnreadCount),
		TotalCount:         int32(m.TotalCount),
		CreateTime:         timestamppb.New(m.CreateTime),
		UpdateTime:         timestamppb.New(m.UpdateTime),
	}
}

func mapProtoMailboxToDomain(pb *mailv1.Mailbox) *domainmail.Mailbox {
	if pb == nil {
		return nil
	}
	var colorPtr *string
	if pb.GetColor() != "" {
		c := pb.GetColor()
		colorPtr = &c
	}
	var provIDPtr *string
	if pb.GetProviderMailboxId() != "" {
		p := pb.GetProviderMailboxId()
		provIDPtr = &p
	}

	return &domainmail.Mailbox{
		ID:                 pb.GetId(),
		SpaceID:            pb.GetSpaceId(),
		ConnectedAccountID: pb.GetConnectedAccountId(),
		ProviderMailboxID:  provIDPtr,
		Name:               pb.GetName(),
		SystemRole:         mapProtoRoleToDomain(pb.GetSystemRole()),
		Color:              colorPtr,
		UnreadCount:        int(pb.GetUnreadCount()),
		TotalCount:         int(pb.GetTotalCount()),
	}
}

func mapDomainParticipantsToProto(parts []domainmail.Participant) []*mailv1.Participant {
	protoParts := make([]*mailv1.Participant, len(parts))
	for i, p := range parts {
		protoParts[i] = &mailv1.Participant{
			Name:  p.Name,
			Email: p.Email,
		}
	}
	return protoParts
}

func mapProtoParticipantsToDomain(parts []*mailv1.Participant) []domainmail.Participant {
	domainParts := make([]domainmail.Participant, len(parts))
	for i, p := range parts {
		domainParts[i] = domainmail.Participant{
			Name:  p.GetName(),
			Email: p.GetEmail(),
		}
	}
	return domainParts
}

func mapDomainAttachmentsToProto(attachments []domainmail.AttachmentMeta) []*mailv1.Attachment {
	protoAtts := make([]*mailv1.Attachment, len(attachments))
	for i, a := range attachments {
		protoAtts[i] = &mailv1.Attachment{
			Id:          a.ID,
			Filename:    a.Filename,
			ContentType: a.ContentType,
			Size:        a.Size,
			ContentId:   a.ContentID,
			IsInline:    a.IsInline,
		}
	}
	return protoAtts
}

func mapDomainThreadToProto(t *domainmail.Thread) *mailv1.Thread {
	if t == nil {
		return nil
	}
	provID := ""
	if t.ProviderThreadID != nil {
		provID = *t.ProviderThreadID
	}

	return &mailv1.Thread{
		Id:                 t.ID,
		SpaceId:            t.SpaceID,
		ConnectedAccountId: t.ConnectedAccountID,
		ProviderThreadId:   provID,
		Subject:            t.Subject,
		Snippet:            t.Snippet,
		Participants:       mapDomainParticipantsToProto(t.Participants),
		MessageCount:       int32(t.MessageCount),
		HasAttachments:     t.HasAttachments,
		IsUnread:           t.IsUnread,
		IsStarred:          t.IsStarred,
		InInbox:            t.InInbox,
		InSent:             t.InSent,
		InDrafts:           t.InDrafts,
		InTrash:            t.InTrash,
		InSpam:             t.InSpam,
		MailboxIds:         t.MailboxIDs,
		LastMessageAt:      timestamppb.New(t.LastMessageAt),
		CreateTime:         timestamppb.New(t.CreateTime),
		UpdateTime:         timestamppb.New(t.UpdateTime),
	}
}

func mapThreadProjectionToProto(proj *mailaggregator.ThreadProjection) *mailv1.Thread {
	if proj == nil || proj.Thread == nil {
		return nil
	}
	pbThread := mapDomainThreadToProto(proj.Thread)

	protoMessages := make([]*mailv1.Message, len(proj.Messages))
	for i, mp := range proj.Messages {
		pbMsg := mapDomainMessageToProto(mp.Message)
		pbMsg.BodyHtml = mp.BodyHTML
		pbMsg.BodyPlain = mp.BodyPlain

		// Hydrate attachments with minted download URLs
		pbAtts := make([]*mailv1.Attachment, len(mp.Attachments))
		for j, ap := range mp.Attachments {
			pbAtts[j] = &mailv1.Attachment{
				Id:          ap.Meta.ID,
				Filename:    ap.Meta.Filename,
				ContentType: ap.Meta.ContentType,
				Size:        ap.Meta.Size,
				ContentId:   ap.Meta.ContentID,
				IsInline:    ap.Meta.IsInline,
				DownloadUrl: ap.DownloadURL,
			}
		}
		pbMsg.Attachments = pbAtts
		protoMessages[i] = pbMsg
	}
	pbThread.Messages = protoMessages

	return pbThread
}

func mapDomainMessageToProto(m *domainmail.Message) *mailv1.Message {
	if m == nil {
		return nil
	}
	provID := ""
	if m.ProviderMessageID != nil {
		provID = *m.ProviderMessageID
	}
	rfcID := ""
	if m.RFCMessageID != nil {
		rfcID = *m.RFCMessageID
	}
	inReply := ""
	if m.InReplyTo != nil {
		inReply = *m.InReplyTo
	}
	refs := ""
	if m.References != nil {
		refs = *m.References
	}
	var sentAtPb *timestamppb.Timestamp
	if m.SentAt != nil {
		sentAtPb = timestamppb.New(*m.SentAt)
	}

	return &mailv1.Message{
		Id:                 m.ID,
		SpaceId:            m.SpaceID,
		ConnectedAccountId: m.ConnectedAccountID,
		ThreadId:           m.ThreadID,
		ProviderMessageId:  provID,
		RfcMessageId:       rfcID,
		InReplyTo:          inReply,
		References:         refs,
		Subject:            m.Subject,
		Snippet:            m.Snippet,
		From:               &mailv1.Participant{Name: m.From.Name, Email: m.From.Email},
		To:                 mapDomainParticipantsToProto(m.To),
		Cc:                 mapDomainParticipantsToProto(m.Cc),
		Bcc:                mapDomainParticipantsToProto(m.Bcc),
		ReplyTo:            mapDomainParticipantsToProto(m.ReplyTo),
		SentAt:             sentAtPb,
		ReceivedAt:         timestamppb.New(m.ReceivedAt),
		IsUnread:           m.IsUnread,
		IsStarred:          m.IsStarred,
		IsDraft:            m.IsDraft,
		Attachments:        mapDomainAttachmentsToProto(m.Attachments),
		HasRemoteImages:    m.HasRemoteImages,
		BodyCached:         m.BodyCached,
		CreateTime:         timestamppb.New(m.CreateTime),
		UpdateTime:         timestamppb.New(m.UpdateTime),
	}
}

func mapDomainDraftToProto(d *domainmail.Draft) *mailv1.Draft {
	if d == nil {
		return nil
	}
	provDraftID := ""
	if d.ProviderDraftID != nil {
		provDraftID = *d.ProviderDraftID
	}
	provMsgID := ""
	if d.ProviderMessageID != nil {
		provMsgID = *d.ProviderMessageID
	}
	thID := ""
	if d.ThreadID != nil {
		thID = *d.ThreadID
	}
	replyToID := ""
	if d.ReplyToMessageID != nil {
		replyToID = *d.ReplyToMessageID
	}

	return &mailv1.Draft{
		Id:                 d.ID,
		SpaceId:            d.SpaceID,
		ConnectedAccountId: d.ConnectedAccountID,
		ProviderDraftId:    provDraftID,
		ProviderMessageId:  provMsgID,
		ThreadId:           thID,
		ReplyToMessageId:   replyToID,
		Mode:               mapDomainDraftModeToProto(d.Mode),
		From:               d.From,
		To:                 mapDomainParticipantsToProto(d.To),
		Cc:                 mapDomainParticipantsToProto(d.Cc),
		Bcc:                mapDomainParticipantsToProto(d.Bcc),
		Subject:            d.Subject,
		BodyHtml:           d.BodyHTML,
		BodyText:           d.BodyText,
		Attachments:        mapDomainAttachmentsToProto(d.Attachments),
		Version:            d.Version,
		CreateTime:         timestamppb.New(d.CreateTime),
		UpdateTime:         timestamppb.New(d.UpdateTime),
	}
}

func mapProtoDraftToDomain(pb *mailv1.Draft) *domainmail.Draft {
	if pb == nil {
		return nil
	}
	var provDraftPtr *string
	if pb.GetProviderDraftId() != "" {
		p := pb.GetProviderDraftId()
		provDraftPtr = &p
	}
	var provMsgPtr *string
	if pb.GetProviderMessageId() != "" {
		p := pb.GetProviderMessageId()
		provMsgPtr = &p
	}
	var threadPtr *string
	if pb.GetThreadId() != "" {
		p := pb.GetThreadId()
		threadPtr = &p
	}
	var replyToPtr *string
	if pb.GetReplyToMessageId() != "" {
		p := pb.GetReplyToMessageId()
		replyToPtr = &p
	}

	return &domainmail.Draft{
		ID:                 pb.GetId(),
		SpaceID:            pb.GetSpaceId(),
		ConnectedAccountID: pb.GetConnectedAccountId(),
		ProviderDraftID:    provDraftPtr,
		ProviderMessageID:  provMsgPtr,
		ThreadID:           threadPtr,
		ReplyToMessageID:   replyToPtr,
		Mode:               mapProtoDraftModeToDomain(pb.GetMode()),
		From:               pb.GetFrom(),
		To:                 mapProtoParticipantsToDomain(pb.GetTo()),
		Cc:                 mapProtoParticipantsToDomain(pb.GetCc()),
		Bcc:                mapProtoParticipantsToDomain(pb.GetBcc()),
		Subject:            pb.GetSubject(),
		BodyHTML:           pb.GetBodyHtml(),
		BodyText:           pb.GetBodyText(),
		Version:            pb.GetVersion(),
	}
}
