package google

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json/v2"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/mail"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"

	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	platformerrors "github.com/masterkeysrd/saturn/internal/platform/errors"
)

// Ensure Provider implements domainmail.ExternalMailProvider.
var _ domainmail.ExternalMailProvider = (*Provider)(nil)

// maxAttachmentUploadSize is 25 MB.
const maxAttachmentUploadSize = 25 * 1024 * 1024

// Gmail API response structures.

type gmailLabelsListResponse struct {
	Labels []gmailLabel `json:"labels"`
}

type gmailLabel struct {
	ID             string          `json:"id"`
	Name           string          `json:"name"`
	Type           string          `json:"type"`
	MessagesTotal  int             `json:"messagesTotal,omitempty"`
	MessagesUnread int             `json:"messagesUnread,omitempty"`
	ThreadsTotal   int             `json:"threadsTotal,omitempty"`
	ThreadsUnread  int             `json:"threadsUnread,omitempty"`
	Color          gmailLabelColor `json:"color"`
}

type gmailLabelColor struct {
	TextColor       string `json:"textColor,omitempty"`
	BackgroundColor string `json:"backgroundColor,omitempty"`
}

type gmailProfileResponse struct {
	EmailAddress  string `json:"emailAddress"`
	MessagesTotal int    `json:"messagesTotal"`
	ThreadsTotal  int    `json:"threadsTotal"`
	HistoryID     string `json:"historyId"`
}

type gmailThreadsListResponse struct {
	Threads       []gmailThreadHeader `json:"threads"`
	NextPageToken string              `json:"nextPageToken,omitempty"`
	ResultSizeEst int                 `json:"resultSizeEstimate,omitempty"`
}

type gmailThreadHeader struct {
	ID        string `json:"id"`
	Snippet   string `json:"snippet"`
	HistoryID string `json:"historyId"`
}

type gmailThread struct {
	ID        string         `json:"id"`
	HistoryID string         `json:"historyId"`
	Messages  []gmailMessage `json:"messages"`
}

type gmailMessage struct {
	ID           string               `json:"id"`
	ThreadID     string               `json:"threadId"`
	LabelIDs     []string             `json:"labelIds"`
	Snippet      string               `json:"snippet"`
	HistoryID    string               `json:"historyId"`
	InternalDate string               `json:"internalDate"`
	Payload      *gmailMessagePayload `json:"payload,omitempty"`
	SizeEstimate int                  `json:"sizeEstimate,omitempty"`
}

type gmailMessagePayload struct {
	PartID   string                `json:"partId"`
	MimeType string                `json:"mimeType"`
	Filename string                `json:"filename"`
	Headers  []gmailHeader         `json:"headers"`
	Body     *gmailMessagePartBody `json:"body,omitempty"`
	Parts    []gmailMessagePayload `json:"parts,omitempty"`
}

type gmailHeader struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type gmailMessagePartBody struct {
	AttachmentID string `json:"attachmentId,omitempty"`
	Size         int64  `json:"size,omitempty"`
	Data         string `json:"data,omitempty"`
}

type gmailHistoryListResponse struct {
	History       []gmailHistoryItem `json:"history"`
	NextPageToken string             `json:"nextPageToken,omitempty"`
	HistoryID     string             `json:"historyId"`
}

type gmailHistoryItem struct {
	ID              string             `json:"id"`
	Messages        []gmailMessage     `json:"messages,omitempty"`
	MessagesAdded   []gmailMessageItem `json:"messagesAdded,omitempty"`
	MessagesDeleted []gmailMessageItem `json:"messagesDeleted,omitempty"`
	LabelsAdded     []gmailLabelItem   `json:"labelsAdded,omitempty"`
	LabelsRemoved   []gmailLabelItem   `json:"labelsRemoved,omitempty"`
}

type gmailMessageItem struct {
	Message gmailMessage `json:"message"`
}

type gmailLabelItem struct {
	Message  gmailMessage `json:"message"`
	LabelIDs []string     `json:"labelIds"`
}

type gmailDraft struct {
	ID      string        `json:"id,omitempty"`
	Message *gmailMessage `json:"message,omitempty"`
}

type gmailDraftCreateRequest struct {
	Message gmailDraftMessage `json:"message"`
}

type gmailDraftMessage struct {
	ThreadID string `json:"threadId,omitempty"`
	Raw      string `json:"raw"`
}

type gmailModifyThreadRequest struct {
	AddLabelIDs    []string `json:"addLabelIds,omitempty"`
	RemoveLabelIDs []string `json:"removeLabelIds,omitempty"`
}

type gmailAttachmentResponse struct {
	AttachmentID string `json:"attachmentId"`
	Size         int64  `json:"size"`
	Data         string `json:"data"`
}

// ListMailboxes fetches all mailboxes/labels accessible to the connected account.
func (p *Provider) ListMailboxes(ctx context.Context, accessToken string) ([]*domainmail.Mailbox, error) {
	const op platformerrors.Op = "platform/connector/google.ListMailboxes"

	endpoint := fmt.Sprintf("%s/users/me/labels", p.cfg.GmailURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, platformerrors.E(op, connector.ErrInvalidGrant)
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, platformerrors.E(op, connector.ErrRateLimited)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, platformerrors.E(op, fmt.Sprintf("list labels failed with status %d: %s", resp.StatusCode, string(body)))
	}

	var labelsResp gmailLabelsListResponse
	if err := json.UnmarshalRead(resp.Body, &labelsResp); err != nil {
		return nil, platformerrors.E(op, err)
	}

	now := time.Now().UTC()
	var mailboxes []*domainmail.Mailbox
	for _, l := range labelsResp.Labels {
		role, name := mapGmailLabelToBucket(l.ID, l.Name)
		mbxID, err := domainmail.GenerateMailboxID()
		if err != nil {
			return nil, platformerrors.E(op, err)
		}

		providerID := l.ID
		var colorPtr *string
		if l.Color.BackgroundColor != "" {
			colorPtr = &l.Color.BackgroundColor
		}

		unreadCount := l.MessagesUnread
		if unreadCount == 0 && l.ThreadsUnread > 0 {
			unreadCount = l.ThreadsUnread
		}
		totalCount := l.MessagesTotal
		if totalCount == 0 && l.ThreadsTotal > 0 {
			totalCount = l.ThreadsTotal
		}

		mbx := &domainmail.Mailbox{
			ID:                mbxID,
			ProviderMailboxID: &providerID,
			Name:              name,
			SystemRole:        role,
			Color:             colorPtr,
			UnreadCount:       unreadCount,
			TotalCount:        totalCount,
			CreateTime:        now,
			UpdateTime:        now,
		}
		mailboxes = append(mailboxes, mbx)
	}

	return mailboxes, nil
}

// SyncThreads bootstraps or incrementally synchronizes threads.
func (p *Provider) SyncThreads(ctx context.Context, accessToken string, req *domainmail.SyncThreadsRequest) (*domainmail.SyncThreadsResult, error) {
	if req == nil {
		req = &domainmail.SyncThreadsRequest{}
	}

	if req.SyncCursor == "" {
		return p.bootstrapSyncThreads(ctx, accessToken, req)
	}
	return p.incrementalSyncThreads(ctx, accessToken, req)
}

func (p *Provider) bootstrapSyncThreads(ctx context.Context, accessToken string, req *domainmail.SyncThreadsRequest) (*domainmail.SyncThreadsResult, error) {
	const op platformerrors.Op = "platform/connector/google.bootstrapSyncThreads"

	// 1. Fetch current profile historyId
	profile, err := p.getProfile(ctx, accessToken)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}

	// 2. Determine rolling window query
	windowDays := req.WindowDays
	if windowDays <= 0 {
		windowDays = 90
	}
	query := fmt.Sprintf("newer_than:%dd", windowDays)

	// 3. Query threads list
	endpoint := fmt.Sprintf("%s/users/me/threads?q=%s&maxResults=100", p.cfg.GmailURL, url.QueryEscape(query))
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := p.httpClient.Do(httpReq)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, platformerrors.E(op, connector.ErrInvalidGrant)
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, platformerrors.E(op, connector.ErrRateLimited)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, platformerrors.E(op, fmt.Sprintf("list threads failed with status %d: %s", resp.StatusCode, string(body)))
	}

	var listResp gmailThreadsListResponse
	if err := json.UnmarshalRead(resp.Body, &listResp); err != nil {
		return nil, platformerrors.E(op, err)
	}

	prewarmCount := req.PrewarmBodiesCount
	if prewarmCount <= 0 {
		prewarmCount = 25
	}

	result := &domainmail.SyncThreadsResult{
		NewSyncCursor: profile.HistoryID,
	}

	prewarmedSoFar := 0
	for _, th := range listResp.Threads {
		thread, msgs, err := p.FetchThread(ctx, accessToken, th.ID)
		if err != nil {
			continue // skip transient individual thread failures
		}
		result.Threads = append(result.Threads, thread)
		result.Messages = append(result.Messages, msgs...)

		// Pre-warm bodies for newest inbox threads
		if prewarmedSoFar < prewarmCount && thread.InInbox {
			for _, msg := range msgs {
				if msg.ProviderMessageID != nil && *msg.ProviderMessageID != "" {
					body, err := p.FetchMessageBody(ctx, accessToken, *msg.ProviderMessageID)
					if err == nil && body != nil {
						body.MessageID = msg.ID
						result.Bodies = append(result.Bodies, body)
						msg.BodyCached = true
					}
				}
			}
			prewarmedSoFar++
		}
	}

	return result, nil
}

func (p *Provider) incrementalSyncThreads(ctx context.Context, accessToken string, req *domainmail.SyncThreadsRequest) (*domainmail.SyncThreadsResult, error) {
	const op platformerrors.Op = "platform/connector/google.incrementalSyncThreads"

	endpoint := fmt.Sprintf("%s/users/me/history?startHistoryId=%s&maxResults=100", p.cfg.GmailURL, url.QueryEscape(req.SyncCursor))
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := p.httpClient.Do(httpReq)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, platformerrors.E(op, connector.ErrInvalidGrant)
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, platformerrors.E(op, connector.ErrRateLimited)
	}
	// Expired cursor (404) triggers rolling window re-bootstrap
	if resp.StatusCode == http.StatusNotFound {
		return &domainmail.SyncThreadsResult{
			ExpiredCursor: true,
		}, nil
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		bodyStr := string(body)
		if strings.Contains(bodyStr, "historyId") && strings.Contains(bodyStr, "not found") {
			return &domainmail.SyncThreadsResult{
				ExpiredCursor: true,
			}, nil
		}
		return nil, platformerrors.E(op, fmt.Sprintf("list history failed with status %d: %s", resp.StatusCode, bodyStr))
	}

	var histResp gmailHistoryListResponse
	if err := json.UnmarshalRead(resp.Body, &histResp); err != nil {
		return nil, platformerrors.E(op, err)
	}

	newCursor := histResp.HistoryID
	if newCursor == "" {
		newCursor = req.SyncCursor
	}

	affectedThreadIDs := make(map[string]struct{})
	for _, item := range histResp.History {
		for _, m := range item.Messages {
			if m.ThreadID != "" {
				affectedThreadIDs[m.ThreadID] = struct{}{}
			}
		}
		for _, mi := range item.MessagesAdded {
			if mi.Message.ThreadID != "" {
				affectedThreadIDs[mi.Message.ThreadID] = struct{}{}
			}
		}
		for _, mi := range item.MessagesDeleted {
			if mi.Message.ThreadID != "" {
				affectedThreadIDs[mi.Message.ThreadID] = struct{}{}
			}
		}
		for _, li := range item.LabelsAdded {
			if li.Message.ThreadID != "" {
				affectedThreadIDs[li.Message.ThreadID] = struct{}{}
			}
		}
		for _, li := range item.LabelsRemoved {
			if li.Message.ThreadID != "" {
				affectedThreadIDs[li.Message.ThreadID] = struct{}{}
			}
		}
	}

	result := &domainmail.SyncThreadsResult{
		NewSyncCursor: newCursor,
	}

	for thID := range affectedThreadIDs {
		thread, msgs, err := p.FetchThread(ctx, accessToken, thID)
		if err != nil {
			continue
		}
		result.Threads = append(result.Threads, thread)
		result.Messages = append(result.Messages, msgs...)
	}

	return result, nil
}

func (p *Provider) getProfile(ctx context.Context, accessToken string) (*gmailProfileResponse, error) {
	const op platformerrors.Op = "platform/connector/google.getProfile"

	endpoint := fmt.Sprintf("%s/users/me/profile", p.cfg.GmailURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, platformerrors.E(op, fmt.Sprintf("get profile failed with status %d: %s", resp.StatusCode, string(body)))
	}

	var prof gmailProfileResponse
	if err := json.UnmarshalRead(resp.Body, &prof); err != nil {
		return nil, platformerrors.E(op, err)
	}
	return &prof, nil
}

// FetchThread fetches the full thread and its messages metadata.
func (p *Provider) FetchThread(ctx context.Context, accessToken, providerThreadID string) (*domainmail.Thread, []*domainmail.Message, error) {
	const op platformerrors.Op = "platform/connector/google.FetchThread"

	endpoint := fmt.Sprintf("%s/users/me/threads/%s?format=full", p.cfg.GmailURL, url.PathEscape(providerThreadID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, nil, platformerrors.E(op, err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, nil, platformerrors.E(op, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, nil, platformerrors.E(op, connector.ErrInvalidGrant)
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, nil, platformerrors.E(op, connector.ErrRateLimited)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, nil, platformerrors.E(op, fmt.Sprintf("fetch thread failed with status %d: %s", resp.StatusCode, string(body)))
	}

	var gThread gmailThread
	if err := json.UnmarshalRead(resp.Body, &gThread); err != nil {
		return nil, nil, platformerrors.E(op, err)
	}

	threadID, err := domainmail.GenerateThreadID()
	if err != nil {
		return nil, nil, platformerrors.E(op, err)
	}

	now := time.Now().UTC()
	var messages []*domainmail.Message
	for _, gm := range gThread.Messages {
		msg, err := p.mapGmailMessage(gm, threadID, now)
		if err != nil {
			return nil, nil, platformerrors.E(op, err)
		}
		messages = append(messages, msg)
	}

	provID := providerThreadID
	thread := &domainmail.Thread{
		ID:               threadID,
		ProviderThreadID: &provID,
		CreateTime:       now,
		UpdateTime:       now,
	}

	for _, gm := range gThread.Messages {
		for _, lid := range gm.LabelIDs {
			switch lid {
			case "INBOX":
				thread.InInbox = true
			case "SENT":
				thread.InSent = true
			case "DRAFT":
				thread.InDrafts = true
			case "TRASH":
				thread.InTrash = true
			case "SPAM":
				thread.InSpam = true
			}
			if !slices.Contains(thread.MailboxIDs, lid) {
				thread.MailboxIDs = append(thread.MailboxIDs, lid)
			}
		}
	}

	if len(messages) > 0 {
		thread.AggregateFromMessages(messages)
	}

	return thread, messages, nil
}

func (p *Provider) mapGmailMessage(gm gmailMessage, threadID string, now time.Time) (*domainmail.Message, error) {
	msgID, err := domainmail.GenerateMessageID()
	if err != nil {
		return nil, err
	}

	provMsgID := gm.ID
	headers := make(map[string]string)
	var attachments []domainmail.AttachmentMeta

	if gm.Payload != nil {
		for _, h := range gm.Payload.Headers {
			headers[strings.ToLower(h.Name)] = h.Value
		}
		attachments = extractAttachmentsFromPayload(gm.Payload)
	}

	decoder := new(mime.WordDecoder)
	decodeHeader := func(val string) string {
		if val == "" {
			return ""
		}
		decoded, err := decoder.DecodeHeader(val)
		if err != nil {
			return val
		}
		return decoded
	}

	parseAddressList := func(raw string) []domainmail.Participant {
		if strings.TrimSpace(raw) == "" {
			return []domainmail.Participant{}
		}
		addrs, err := mail.ParseAddressList(raw)
		if err != nil {
			return []domainmail.Participant{{Email: strings.TrimSpace(decodeHeader(raw))}}
		}
		var res []domainmail.Participant
		for _, a := range addrs {
			res = append(res, domainmail.Participant{
				Name:  strings.TrimSpace(decodeHeader(a.Name)),
				Email: strings.TrimSpace(a.Address),
			})
		}
		return res
	}

	fromAddrs := parseAddressList(headers["from"])
	var sender domainmail.Participant
	if len(fromAddrs) > 0 {
		sender = fromAddrs[0]
	}

	subject := decodeHeader(headers["subject"])
	rfcMsgID := strings.Trim(headers["message-id"], "<>")
	inReplyTo := strings.Trim(headers["in-reply-to"], "<>")
	references := headers["references"]

	var sentAt *time.Time
	if dateStr := headers["date"]; dateStr != "" {
		if parsedDate, err := mail.ParseDate(dateStr); err == nil {
			u := parsedDate.UTC()
			sentAt = &u
		}
	}

	receivedAt := now
	if gm.InternalDate != "" {
		if ms, err := strconv.ParseInt(gm.InternalDate, 10, 64); err == nil {
			receivedAt = time.UnixMilli(ms).UTC()
		}
	}
	if sentAt == nil {
		sentAt = &receivedAt
	}

	isUnread := slices.Contains(gm.LabelIDs, "UNREAD")
	isStarred := slices.Contains(gm.LabelIDs, "STARRED")
	isDraft := slices.Contains(gm.LabelIDs, "DRAFT")

	var rfcPtr *string
	if rfcMsgID != "" {
		rfcPtr = &rfcMsgID
	}
	var inReplyPtr *string
	if inReplyTo != "" {
		inReplyPtr = &inReplyTo
	}
	var refsPtr *string
	if references != "" {
		refsPtr = &references
	}

	return &domainmail.Message{
		ID:                msgID,
		ThreadID:          threadID,
		ProviderMessageID: &provMsgID,
		RFCMessageID:      rfcPtr,
		InReplyTo:         inReplyPtr,
		References:        refsPtr,
		Subject:           subject,
		Snippet:           gm.Snippet,
		From:              sender,
		To:                parseAddressList(headers["to"]),
		Cc:                parseAddressList(headers["cc"]),
		Bcc:               parseAddressList(headers["bcc"]),
		ReplyTo:           parseAddressList(headers["reply-to"]),
		SentAt:            sentAt,
		ReceivedAt:        receivedAt,
		IsUnread:          isUnread,
		IsStarred:         isStarred,
		IsDraft:           isDraft,
		Attachments:       attachments,
		HasRemoteImages:   false,
		BodyCached:        false,
		CreateTime:        now,
		UpdateTime:        now,
	}, nil
}

func extractAttachmentsFromPayload(p *gmailMessagePayload) []domainmail.AttachmentMeta {
	var attachments []domainmail.AttachmentMeta

	var walk func(part *gmailMessagePayload)
	walk = func(part *gmailMessagePayload) {
		if part == nil {
			return
		}

		isAttachment := part.Filename != "" || (part.Body != nil && part.Body.AttachmentID != "")
		if isAttachment {
			attID := ""
			var size int64
			if part.Body != nil {
				attID = part.Body.AttachmentID
				size = part.Body.Size
			}
			if attID == "" {
				attID, _ = domainmail.GenerateAttachmentID()
			}

			contentID := ""
			isInline := false
			for _, h := range part.Headers {
				if strings.EqualFold(h.Name, "Content-ID") {
					contentID = strings.Trim(h.Value, "<>")
					isInline = true
				}
				if strings.EqualFold(h.Name, "Content-Disposition") && strings.HasPrefix(strings.ToLower(h.Value), "inline") {
					isInline = true
				}
			}

			meta := domainmail.AttachmentMeta{
				ID:          attID,
				Filename:    part.Filename,
				ContentType: part.MimeType,
				Size:        size,
				ContentID:   contentID,
				IsInline:    isInline,
			}
			if meta.ContentType == "" {
				meta.ContentType = "application/octet-stream"
			}
			attachments = append(attachments, meta)
		}

		for i := range part.Parts {
			walk(&part.Parts[i])
		}
	}

	walk(p)
	return attachments
}

// FetchMessageBody fetches and sanitizes a message body from the provider.
func (p *Provider) FetchMessageBody(ctx context.Context, accessToken, providerMessageID string) (*domainmail.MessageBody, error) {
	const op platformerrors.Op = "platform/connector/google.FetchMessageBody"

	endpoint := fmt.Sprintf("%s/users/me/messages/%s?format=full", p.cfg.GmailURL, url.PathEscape(providerMessageID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, platformerrors.E(op, connector.ErrInvalidGrant)
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, platformerrors.E(op, connector.ErrRateLimited)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, platformerrors.E(op, fmt.Sprintf("fetch message body failed with status %d: %s", resp.StatusCode, string(body)))
	}

	var msg gmailMessage
	if err := json.UnmarshalRead(resp.Body, &msg); err != nil {
		return nil, platformerrors.E(op, err)
	}

	rawHTML, rawPlain := extractBodiesFromPayload(msg.Payload)

	now := time.Now().UTC()
	result := &domainmail.MessageBody{
		FetchedAt: now,
		ExpiresAt: now.Add(30 * 24 * time.Hour),
	}

	if strings.TrimSpace(rawHTML) != "" {
		sanitized, err := domainmail.SanitizeHTML(rawHTML)
		if err != nil {
			return nil, platformerrors.E(op, err)
		}
		result.SanitizedHTML = sanitized.SanitizedHTML
		result.PlainText = sanitized.PlainText
		if result.PlainText == "" {
			result.PlainText = rawPlain
		}
	} else if strings.TrimSpace(rawPlain) != "" {
		result.PlainText = rawPlain
		result.SanitizedHTML = "<pre>" + strings.ReplaceAll(strings.ReplaceAll(rawPlain, "&", "&amp;"), "<", "&lt;") + "</pre>"
	}

	return result, nil
}

func extractBodiesFromPayload(p *gmailMessagePayload) (html string, plain string) {
	if p == nil {
		return "", ""
	}

	decodeData := func(data string) string {
		if data == "" {
			return ""
		}
		decoded, err := base64.URLEncoding.DecodeString(data)
		if err != nil {
			decoded, err = base64.RawURLEncoding.DecodeString(data)
			if err != nil {
				decoded, err = base64.StdEncoding.DecodeString(data)
				if err != nil {
					decoded, err = base64.RawStdEncoding.DecodeString(data)
					if err != nil {
						return ""
					}
				}
			}
		}
		return string(decoded)
	}

	var walk func(part *gmailMessagePayload)
	walk = func(part *gmailMessagePayload) {
		if part == nil {
			return
		}

		if part.Body != nil && part.Body.Data != "" {
			content := decodeData(part.Body.Data)
			if strings.EqualFold(part.MimeType, "text/html") && html == "" {
				html = content
			} else if strings.EqualFold(part.MimeType, "text/plain") && plain == "" {
				plain = content
			}
		}

		for i := range part.Parts {
			walk(&part.Parts[i])
		}
	}

	walk(p)
	return html, plain
}

// SearchThreads queries remote threads on the upstream provider for hybrid search.
func (p *Provider) SearchThreads(ctx context.Context, accessToken, query string, limit int) ([]*domainmail.Thread, error) {
	const op platformerrors.Op = "platform/connector/google.SearchThreads"

	if limit <= 0 {
		limit = 20
	}

	endpoint := fmt.Sprintf("%s/users/me/threads?q=%s&maxResults=%d", p.cfg.GmailURL, url.QueryEscape(query), limit)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, platformerrors.E(op, connector.ErrInvalidGrant)
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, platformerrors.E(op, connector.ErrRateLimited)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, platformerrors.E(op, fmt.Sprintf("search threads failed with status %d: %s", resp.StatusCode, string(body)))
	}

	var listResp gmailThreadsListResponse
	if err := json.UnmarshalRead(resp.Body, &listResp); err != nil {
		return nil, platformerrors.E(op, err)
	}

	var threads []*domainmail.Thread
	for _, th := range listResp.Threads {
		thread, _, err := p.FetchThread(ctx, accessToken, th.ID)
		if err != nil {
			continue
		}
		threads = append(threads, thread)
	}

	return threads, nil
}

// ModifyThread applies label/bucket modifications to a thread on the provider.
func (p *Provider) ModifyThread(ctx context.Context, accessToken, providerThreadID string, addLabelIDs, removeLabelIDs []string) error {
	const op platformerrors.Op = "platform/connector/google.ModifyThread"

	endpoint := fmt.Sprintf("%s/users/me/threads/%s/modify", p.cfg.GmailURL, url.PathEscape(providerThreadID))
	payload := gmailModifyThreadRequest{
		AddLabelIDs:    addLabelIDs,
		RemoveLabelIDs: removeLabelIDs,
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return platformerrors.E(op, err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return platformerrors.E(op, err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return platformerrors.E(op, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return platformerrors.E(op, connector.ErrInvalidGrant)
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return platformerrors.E(op, connector.ErrRateLimited)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return platformerrors.E(op, fmt.Sprintf("modify thread failed with status %d: %s", resp.StatusCode, string(body)))
	}

	return nil
}

// BatchModifyThreads applies label modifications to multiple threads on the provider.
func (p *Provider) BatchModifyThreads(ctx context.Context, accessToken string, providerThreadIDs []string, addLabelIDs, removeLabelIDs []string) error {
	const op platformerrors.Op = "platform/connector/google.BatchModifyThreads"

	for _, thID := range providerThreadIDs {
		if err := p.ModifyThread(ctx, accessToken, thID, addLabelIDs, removeLabelIDs); err != nil {
			return platformerrors.E(op, err)
		}
	}
	return nil
}

// CreateDraft creates a draft on the provider.
func (p *Provider) CreateDraft(ctx context.Context, accessToken string, draft *domainmail.Draft) (*domainmail.Draft, error) {
	const op platformerrors.Op = "platform/connector/google.CreateDraft"

	if draft == nil {
		return nil, platformerrors.E(op, platformerrors.Invalid, "draft is required")
	}

	rawMIME := buildRFC5322(draft)
	rawEncoded := base64.RawURLEncoding.EncodeToString(rawMIME)

	reqPayload := gmailDraftCreateRequest{
		Message: gmailDraftMessage{
			Raw: rawEncoded,
		},
	}
	if draft.ThreadID != nil && *draft.ThreadID != "" {
		reqPayload.Message.ThreadID = *draft.ThreadID
	}

	bodyBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}

	endpoint := fmt.Sprintf("%s/users/me/drafts", p.cfg.GmailURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, platformerrors.E(op, connector.ErrInvalidGrant)
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, platformerrors.E(op, connector.ErrRateLimited)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, platformerrors.E(op, fmt.Sprintf("create draft failed with status %d: %s", resp.StatusCode, string(body)))
	}

	var createdDraft gmailDraft
	if err := json.UnmarshalRead(resp.Body, &createdDraft); err != nil {
		return nil, platformerrors.E(op, err)
	}

	draft.ProviderDraftID = &createdDraft.ID
	if createdDraft.Message != nil {
		draft.ProviderMessageID = &createdDraft.Message.ID
	}

	return draft, nil
}

// UpdateDraft updates an existing draft on the provider.
func (p *Provider) UpdateDraft(ctx context.Context, accessToken string, draft *domainmail.Draft) (*domainmail.Draft, error) {
	const op platformerrors.Op = "platform/connector/google.UpdateDraft"

	if draft == nil || draft.ProviderDraftID == nil || *draft.ProviderDraftID == "" {
		return nil, platformerrors.E(op, platformerrors.Invalid, "valid draft with provider draft id required")
	}

	rawMIME := buildRFC5322(draft)
	rawEncoded := base64.RawURLEncoding.EncodeToString(rawMIME)

	reqPayload := gmailDraft{
		ID: *draft.ProviderDraftID,
		Message: &gmailMessage{
			Payload: &gmailMessagePayload{
				Body: &gmailMessagePartBody{
					Data: rawEncoded,
				},
			},
		},
	}
	if draft.ThreadID != nil && *draft.ThreadID != "" {
		reqPayload.Message.ThreadID = *draft.ThreadID
	}

	draftReq := gmailDraftCreateRequest{
		Message: gmailDraftMessage{
			Raw: rawEncoded,
		},
	}
	if draft.ThreadID != nil && *draft.ThreadID != "" {
		draftReq.Message.ThreadID = *draft.ThreadID
	}

	bodyBytes, err := json.Marshal(draftReq)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}

	endpoint := fmt.Sprintf("%s/users/me/drafts/%s", p.cfg.GmailURL, url.PathEscape(*draft.ProviderDraftID))
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, endpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, platformerrors.E(op, connector.ErrInvalidGrant)
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, platformerrors.E(op, connector.ErrRateLimited)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, platformerrors.E(op, fmt.Sprintf("update draft failed with status %d: %s", resp.StatusCode, string(body)))
	}

	var updatedDraft gmailDraft
	if err := json.UnmarshalRead(resp.Body, &updatedDraft); err != nil {
		return nil, platformerrors.E(op, err)
	}

	if updatedDraft.Message != nil {
		draft.ProviderMessageID = &updatedDraft.Message.ID
	}

	return draft, nil
}

// DeleteDraft removes a draft from the provider.
func (p *Provider) DeleteDraft(ctx context.Context, accessToken, providerDraftID string) error {
	const op platformerrors.Op = "platform/connector/google.DeleteDraft"

	endpoint := fmt.Sprintf("%s/users/me/drafts/%s", p.cfg.GmailURL, url.PathEscape(providerDraftID))
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, endpoint, nil)
	if err != nil {
		return platformerrors.E(op, err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return platformerrors.E(op, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return platformerrors.E(op, connector.ErrInvalidGrant)
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return platformerrors.E(op, connector.ErrRateLimited)
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(resp.Body)
		return platformerrors.E(op, fmt.Sprintf("delete draft failed with status %d: %s", resp.StatusCode, string(body)))
	}

	return nil
}

// SendDraft sends an existing draft via the provider.
func (p *Provider) SendDraft(ctx context.Context, accessToken, providerDraftID string) (*domainmail.Message, error) {
	const op platformerrors.Op = "platform/connector/google.SendDraft"

	endpoint := fmt.Sprintf("%s/users/me/drafts/send", p.cfg.GmailURL)
	payload := map[string]string{
		"id": providerDraftID,
	}
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, platformerrors.E(op, connector.ErrInvalidGrant)
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, platformerrors.E(op, connector.ErrRateLimited)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, platformerrors.E(op, fmt.Sprintf("send draft failed with status %d: %s", resp.StatusCode, string(body)))
	}

	var sentMsg gmailMessage
	if err := json.UnmarshalRead(resp.Body, &sentMsg); err != nil {
		return nil, platformerrors.E(op, err)
	}

	now := time.Now().UTC()
	threadID, _ := domainmail.GenerateThreadID()
	return p.mapGmailMessage(sentMsg, threadID, now)
}

// OpenAttachmentStream opens a readable binary stream for an attachment.
func (p *Provider) OpenAttachmentStream(ctx context.Context, accessToken, providerMessageID, attachmentID string) (io.ReadCloser, string, int64, error) {
	const op platformerrors.Op = "platform/connector/google.OpenAttachmentStream"

	endpoint := fmt.Sprintf("%s/users/me/messages/%s/attachments/%s", p.cfg.GmailURL, url.PathEscape(providerMessageID), url.PathEscape(attachmentID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, "", 0, platformerrors.E(op, err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, "", 0, platformerrors.E(op, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, "", 0, platformerrors.E(op, connector.ErrInvalidGrant)
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, "", 0, platformerrors.E(op, connector.ErrRateLimited)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, "", 0, platformerrors.E(op, fmt.Sprintf("fetch attachment failed with status %d: %s", resp.StatusCode, string(body)))
	}

	var attResp gmailAttachmentResponse
	if err := json.UnmarshalRead(resp.Body, &attResp); err != nil {
		return nil, "", 0, platformerrors.E(op, err)
	}

	decodedBytes, err := base64.URLEncoding.DecodeString(attResp.Data)
	if err != nil {
		decodedBytes, err = base64.RawURLEncoding.DecodeString(attResp.Data)
		if err != nil {
			return nil, "", 0, platformerrors.E(op, err)
		}
	}

	contentType := "application/octet-stream"
	return io.NopCloser(bytes.NewReader(decodedBytes)), contentType, int64(len(decodedBytes)), nil
}

// UploadDraftAttachment streams a draft attachment to the provider.
func (p *Provider) UploadDraftAttachment(ctx context.Context, accessToken, providerDraftID, filename, contentType string, r io.Reader) (*domainmail.AttachmentMeta, error) {
	const op platformerrors.Op = "platform/connector/google.UploadDraftAttachment"

	// Enforce 25 MB max attachment upload
	limitedReader := io.LimitReader(r, maxAttachmentUploadSize+1)
	blob, err := io.ReadAll(limitedReader)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}
	if len(blob) > maxAttachmentUploadSize {
		return nil, platformerrors.E(op, platformerrors.Invalid, "attachment exceeds maximum 25 MB limit")
	}

	attID, err := domainmail.GenerateAttachmentID()
	if err != nil {
		return nil, platformerrors.E(op, err)
	}

	meta := &domainmail.AttachmentMeta{
		ID:          attID,
		Filename:    filename,
		ContentType: contentType,
		Size:        int64(len(blob)),
		IsInline:    false,
	}

	return meta, nil
}

// mapGmailLabelToBucket maps Gmail labels to canonical SystemBucket roles and display names.
func mapGmailLabelToBucket(labelID, labelName string) (domainmail.SystemBucket, string) {
	switch labelID {
	case "INBOX":
		return domainmail.SystemBucketInbox, "Inbox"
	case "STARRED":
		return domainmail.SystemBucketStarred, "Starred"
	case "SENT":
		return domainmail.SystemBucketSent, "Sent"
	case "DRAFT":
		return domainmail.SystemBucketDrafts, "Drafts"
	case "TRASH":
		return domainmail.SystemBucketTrash, "Trash"
	case "SPAM":
		return domainmail.SystemBucketSpam, "Spam"
	case "IMPORTANT":
		return domainmail.SystemBucketCustom, "Important"
	default:
		return domainmail.SystemBucketCustom, labelName
	}
}

// buildRFC5322 builds RFC 5322 MIME message bytes with In-Reply-To and References.
func buildRFC5322(draft *domainmail.Draft) []byte {
	var buf bytes.Buffer

	formatParticipants := func(parts []domainmail.Participant) string {
		var list []string
		for _, p := range parts {
			list = append(list, p.String())
		}
		return strings.Join(list, ", ")
	}

	if draft.From != "" {
		fmt.Fprintf(&buf, "From: %s\r\n", draft.From)
	}
	if len(draft.To) > 0 {
		fmt.Fprintf(&buf, "To: %s\r\n", formatParticipants(draft.To))
	}
	if len(draft.Cc) > 0 {
		fmt.Fprintf(&buf, "Cc: %s\r\n", formatParticipants(draft.Cc))
	}
	if len(draft.Bcc) > 0 {
		fmt.Fprintf(&buf, "Bcc: %s\r\n", formatParticipants(draft.Bcc))
	}
	if draft.Subject != "" {
		fmt.Fprintf(&buf, "Subject: %s\r\n", draft.Subject)
	}
	fmt.Fprintf(&buf, "Date: %s\r\n", time.Now().UTC().Format(time.RFC1123Z))
	buf.WriteString("MIME-Version: 1.0\r\n")

	// Support RFC 5322 threading headers
	if draft.ReplyToMessageID != nil && *draft.ReplyToMessageID != "" {
		refID := *draft.ReplyToMessageID
		if !strings.HasPrefix(refID, "<") {
			refID = "<" + refID + ">"
		}
		fmt.Fprintf(&buf, "In-Reply-To: %s\r\n", refID)
		fmt.Fprintf(&buf, "References: %s\r\n", refID)
	}

	bodyContent := draft.BodyHTML
	if bodyContent == "" {
		bodyContent = draft.BodyText
	}

	buf.WriteString("Content-Type: text/html; charset=UTF-8\r\n\r\n")
	buf.WriteString(bodyContent)

	return buf.Bytes()
}
