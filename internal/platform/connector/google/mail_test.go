package google

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json/v2"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestProvider_ListMailboxes(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/users/me/labels", func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "Bearer test-token", r.Header.Get("Authorization"))
		resp := gmailLabelsListResponse{
			Labels: []gmailLabel{
				{ID: "INBOX", Name: "INBOX", Type: "system", MessagesUnread: 5, MessagesTotal: 20},
				{ID: "STARRED", Name: "STARRED", Type: "system", MessagesTotal: 2},
				{ID: "Label_1", Name: "Projects", Type: "user", MessagesUnread: 1, MessagesTotal: 10, Color: gmailLabelColor{BackgroundColor: "#ff0000"}},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.MarshalWrite(w, resp)
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	provider := NewProvider(Config{
		GmailURL: server.URL,
	})

	mailboxes, err := provider.ListMailboxes(context.Background(), "test-token")
	require.NoError(t, err)
	require.Len(t, mailboxes, 3)

	assert.Equal(t, domainmail.SystemBucketInbox, mailboxes[0].SystemRole)
	assert.Equal(t, "Inbox", mailboxes[0].Name)
	assert.Equal(t, 5, mailboxes[0].UnreadCount)
	assert.Equal(t, 20, mailboxes[0].TotalCount)

	assert.Equal(t, domainmail.SystemBucketStarred, mailboxes[1].SystemRole)
	assert.Equal(t, "Starred", mailboxes[1].Name)

	assert.Equal(t, domainmail.SystemBucketCustom, mailboxes[2].SystemRole)
	assert.Equal(t, "Projects", mailboxes[2].Name)
	require.NotNil(t, mailboxes[2].Color)
	assert.Equal(t, "#ff0000", *mailboxes[2].Color)
}

func TestProvider_BootstrapSyncThreads(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/users/me/profile", func(w http.ResponseWriter, r *http.Request) {
		resp := gmailProfileResponse{
			EmailAddress: "test@example.com",
			HistoryID:    "100999",
		}
		_ = json.MarshalWrite(w, resp)
	})

	mux.HandleFunc("/users/me/threads", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		assert.Contains(t, q, "newer_than:90d")
		resp := gmailThreadsListResponse{
			Threads: []gmailThreadHeader{
				{ID: "thread_1", Snippet: "Hello world"},
			},
		}
		_ = json.MarshalWrite(w, resp)
	})

	mux.HandleFunc("/users/me/threads/thread_1", func(w http.ResponseWriter, r *http.Request) {
		resp := gmailThread{
			ID: "thread_1",
			Messages: []gmailMessage{
				{
					ID:           "msg_1",
					ThreadID:     "thread_1",
					LabelIDs:     []string{"INBOX", "UNREAD"},
					Snippet:      "Hello world",
					InternalDate: "1680000000000",
					Payload: &gmailMessagePayload{
						MimeType: "text/html",
						Headers: []gmailHeader{
							{Name: "Subject", Value: "Welcome"},
							{Name: "From", Value: "Saturn <welcome@saturn.app>"},
							{Name: "To", Value: "User <user@saturn.app>"},
						},
						Body: &gmailMessagePartBody{
							Data: base64.URLEncoding.EncodeToString([]byte("<p>Welcome to Saturn!</p>")),
						},
					},
				},
			},
		}
		_ = json.MarshalWrite(w, resp)
	})

	mux.HandleFunc("/users/me/messages/msg_1", func(w http.ResponseWriter, r *http.Request) {
		resp := gmailMessage{
			ID:       "msg_1",
			ThreadID: "thread_1",
			Payload: &gmailMessagePayload{
				MimeType: "text/html",
				Body: &gmailMessagePartBody{
					Data: base64.URLEncoding.EncodeToString([]byte("<p>Welcome to Saturn!</p>")),
				},
			},
		}
		_ = json.MarshalWrite(w, resp)
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	provider := NewProvider(Config{
		GmailURL: server.URL,
	})

	req := &domainmail.SyncThreadsRequest{
		WindowDays:         90,
		PrewarmBodiesCount: 5,
	}

	result, err := provider.SyncThreads(context.Background(), "test-token", req)
	require.NoError(t, err)
	assert.Equal(t, "100999", result.NewSyncCursor)
	assert.False(t, result.ExpiredCursor)
	require.Len(t, result.Threads, 1)
	require.Len(t, result.Messages, 1)
	require.Len(t, result.Bodies, 1)
	assert.Equal(t, "Welcome", result.Threads[0].Subject)
	assert.True(t, result.Threads[0].InInbox)
	assert.True(t, result.Threads[0].IsUnread)
}

func TestProvider_IncrementalSyncThreads_Delta(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/users/me/history", func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "100999", r.URL.Query().Get("startHistoryId"))
		resp := gmailHistoryListResponse{
			HistoryID: "101500",
			History: []gmailHistoryItem{
				{
					ID: "h_1",
					MessagesAdded: []gmailMessageItem{
						{Message: gmailMessage{ID: "msg_2", ThreadID: "thread_2"}},
					},
				},
			},
		}
		_ = json.MarshalWrite(w, resp)
	})

	mux.HandleFunc("/users/me/threads/thread_2", func(w http.ResponseWriter, r *http.Request) {
		resp := gmailThread{
			ID: "thread_2",
			Messages: []gmailMessage{
				{
					ID:           "msg_2",
					ThreadID:     "thread_2",
					LabelIDs:     []string{"INBOX"},
					Snippet:      "Delta message",
					InternalDate: "1680005000000",
					Payload: &gmailMessagePayload{
						MimeType: "text/plain",
						Headers: []gmailHeader{
							{Name: "Subject", Value: "Delta update"},
							{Name: "From", Value: "sender@example.com"},
						},
					},
				},
			},
		}
		_ = json.MarshalWrite(w, resp)
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	provider := NewProvider(Config{
		GmailURL: server.URL,
	})

	req := &domainmail.SyncThreadsRequest{
		SyncCursor: "100999",
	}

	result, err := provider.SyncThreads(context.Background(), "test-token", req)
	require.NoError(t, err)
	assert.Equal(t, "101500", result.NewSyncCursor)
	assert.False(t, result.ExpiredCursor)
	require.Len(t, result.Threads, 1)
	assert.Equal(t, "thread_2", *result.Threads[0].ProviderThreadID)
}

func TestProvider_IncrementalSyncThreads_ExpiredCursor404(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/users/me/history", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error": {"code": 404, "message": "HistoryId not found"}}`))
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	provider := NewProvider(Config{
		GmailURL: server.URL,
	})

	req := &domainmail.SyncThreadsRequest{
		SyncCursor: "old_expired_cursor",
	}

	result, err := provider.SyncThreads(context.Background(), "test-token", req)
	require.NoError(t, err)
	assert.True(t, result.ExpiredCursor, "Should signal cursor expiration on 404")
}

func TestBuildRFC5322_ThreadingHeaders(t *testing.T) {
	replyToID := "original-msg-123@example.com"
	draft := &domainmail.Draft{
		From:             "Me <me@example.com>",
		To:               []domainmail.Participant{{Name: "You", Email: "you@example.com"}},
		Subject:          "Re: Project Update",
		BodyHTML:         "<p>Thanks for the update!</p>",
		ReplyToMessageID: &replyToID,
	}

	mimeBytes := buildRFC5322(draft)
	mimeStr := string(mimeBytes)

	assert.Contains(t, mimeStr, "From: Me <me@example.com>")
	assert.Contains(t, mimeStr, "To: You <you@example.com>")
	assert.Contains(t, mimeStr, "Subject: Re: Project Update")
	assert.Contains(t, mimeStr, "In-Reply-To: <original-msg-123@example.com>")
	assert.Contains(t, mimeStr, "References: <original-msg-123@example.com>")
	assert.Contains(t, mimeStr, "Content-Type: text/html; charset=UTF-8")
	assert.Contains(t, mimeStr, "<p>Thanks for the update!</p>")
}

func TestProvider_DraftOperations(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/users/me/drafts", func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		resp := gmailDraft{
			ID: "draft_100",
			Message: &gmailMessage{
				ID:       "msg_draft_100",
				ThreadID: "thread_draft_100",
			},
		}
		_ = json.MarshalWrite(w, resp)
	})

	mux.HandleFunc("/users/me/drafts/draft_100", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut {
			resp := gmailDraft{
				ID: "draft_100",
				Message: &gmailMessage{
					ID: "msg_draft_100_v2",
				},
			}
			_ = json.MarshalWrite(w, resp)
			return
		}
		if r.Method == http.MethodDelete {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		http.NotFound(w, r)
	})

	mux.HandleFunc("/users/me/drafts/send", func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		resp := gmailMessage{
			ID:           "sent_msg_999",
			ThreadID:     "thread_draft_100",
			LabelIDs:     []string{"SENT"},
			InternalDate: "1680009999000",
			Payload: &gmailMessagePayload{
				Headers: []gmailHeader{
					{Name: "Subject", Value: "Sent draft"},
					{Name: "From", Value: "me@example.com"},
				},
			},
		}
		_ = json.MarshalWrite(w, resp)
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	provider := NewProvider(Config{
		GmailURL: server.URL,
	})

	draft := &domainmail.Draft{
		From:     "me@example.com",
		To:       []domainmail.Participant{{Email: "dest@example.com"}},
		Subject:  "Hello",
		BodyHTML: "<b>Testing</b>",
	}

	created, err := provider.CreateDraft(context.Background(), "test-token", draft)
	require.NoError(t, err)
	require.NotNil(t, created.ProviderDraftID)
	assert.Equal(t, "draft_100", *created.ProviderDraftID)

	// Update draft
	created.BodyHTML = "<b>Updated</b>"
	updated, err := provider.UpdateDraft(context.Background(), "test-token", created)
	require.NoError(t, err)
	assert.Equal(t, "msg_draft_100_v2", *updated.ProviderMessageID)

	// Send draft
	sentMsg, err := provider.SendDraft(context.Background(), "test-token", *created.ProviderDraftID)
	require.NoError(t, err)
	assert.Equal(t, "sent_msg_999", *sentMsg.ProviderMessageID)

	// Delete draft
	err = provider.DeleteDraft(context.Background(), "test-token", "draft_100")
	require.NoError(t, err)
}

func TestProvider_AttachmentStreamAndUpload(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/users/me/messages/msg_1/attachments/att_1", func(w http.ResponseWriter, r *http.Request) {
		rawContent := []byte("Attachment binary payload content")
		resp := gmailAttachmentResponse{
			AttachmentID: "att_1",
			Size:         int64(len(rawContent)),
			Data:         base64.URLEncoding.EncodeToString(rawContent),
		}
		_ = json.MarshalWrite(w, resp)
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	provider := NewProvider(Config{
		GmailURL: server.URL,
	})

	stream, contentType, size, err := provider.OpenAttachmentStream(context.Background(), "test-token", "msg_1", "att_1")
	require.NoError(t, err)
	defer stream.Close()

	data, err := io.ReadAll(stream)
	require.NoError(t, err)
	assert.Equal(t, "Attachment binary payload content", string(data))
	assert.Equal(t, int64(len(data)), size)
	assert.NotEmpty(t, contentType)

	// Test upload attachment size guard (>25 MB)
	oversized := bytes.Repeat([]byte("A"), 25*1024*1024+10)
	_, err = provider.UploadDraftAttachment(context.Background(), "test-token", "draft_1", "large.bin", "application/octet-stream", bytes.NewReader(oversized))
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "25 MB")
}

func TestProvider_DeleteDraft_ResolvesMessageID(t *testing.T) {
	deletedResolvedDraft := false

	mux := http.NewServeMux()
	mux.HandleFunc("/users/me/drafts", func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		resp := gmailDraftListResponse{
			Drafts: []gmailDraft{
				{
					ID:      "r_resolved_draft_99",
					Message: &gmailMessage{ID: "gmail_msg_42"},
				},
			},
		}
		_ = json.MarshalWrite(w, resp)
	})
	mux.HandleFunc("/users/me/drafts/gmail_msg_42", func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	})
	mux.HandleFunc("/users/me/drafts/r_resolved_draft_99", func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodDelete, r.Method)
		deletedResolvedDraft = true
		w.WriteHeader(http.StatusNoContent)
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	provider := NewProvider(Config{GmailURL: server.URL})
	err := provider.DeleteDraft(context.Background(), "test-token", "gmail_msg_42")
	require.NoError(t, err)
	assert.True(t, deletedResolvedDraft)
}
