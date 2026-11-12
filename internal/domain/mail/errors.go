package mail

import "github.com/masterkeysrd/saturn/internal/platform/errors"

// Error codes for the mail domain.
const (
	ErrMailboxNotFound     errors.Code = "MAILBOX_NOT_FOUND"
	ErrThreadNotFound      errors.Code = "THREAD_NOT_FOUND"
	ErrMessageNotFound     errors.Code = "MESSAGE_NOT_FOUND"
	ErrMessageBodyNotFound errors.Code = "MESSAGE_BODY_NOT_FOUND"
	ErrDraftNotFound       errors.Code = "DRAFT_NOT_FOUND"
	ErrSyncStateNotFound   errors.Code = "SYNC_STATE_NOT_FOUND"
	ErrInvalidMailbox      errors.Code = "INVALID_MAILBOX"
	ErrInvalidThread       errors.Code = "INVALID_THREAD"
	ErrInvalidMessage      errors.Code = "INVALID_MESSAGE"
	ErrInvalidDraft        errors.Code = "INVALID_DRAFT"
	ErrAttachmentTooLarge  errors.Code = "ATTACHMENT_TOO_LARGE"
)
