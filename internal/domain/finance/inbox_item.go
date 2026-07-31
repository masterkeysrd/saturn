package finance

import (
	"fmt"
	"strings"
	"time"
)

type InboxItemStatus string

const (
	InboxItemPending    InboxItemStatus = "pending"
	InboxItemProcessing InboxItemStatus = "processing"
	InboxItemResolved   InboxItemStatus = "resolved"
	InboxItemArchived   InboxItemStatus = "archived"
)

type InboxItemDocType string

const (
	InboxItemDocInvoice            InboxItemDocType = "invoice"
	InboxItemDocReceipt            InboxItemDocType = "receipt"
	InboxItemDocBankNotification   InboxItemDocType = "bank_notification"
	InboxItemDocUnknown            InboxItemDocType = "unknown"
	InboxItemDocSystemVerification InboxItemDocType = "system_verification"
)

type BorrowingLinkType string

const (
	BorrowingLinkTypeInitialReceipt BorrowingLinkType = "INITIAL_RECEIPT"
	BorrowingLinkTypeRepayment      BorrowingLinkType = "REPAYMENT"
	BorrowingLinkTypeAdditionalLoan BorrowingLinkType = "ADDITIONAL_LOAN"
)

// ParseInboxItemDocType converts string classifications into strongly-typed InboxItemDocType constants.
func ParseInboxItemDocType(s string) InboxItemDocType {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case "INVOICE":
		return InboxItemDocInvoice
	case "RECEIPT":
		return InboxItemDocReceipt
	case "BANK_NOTIFICATION":
		return InboxItemDocBankNotification
	case "SYSTEM_VERIFICATION":
		return InboxItemDocSystemVerification
	default:
		return InboxItemDocUnknown
	}
}

// InboxItem represents a parsed inbound signal waiting in the staging queue.
type InboxItem struct {
	ID                 string             `json:"id"`
	SpaceID            string             `json:"spaceId"`
	IntegrationID      string             `json:"integrationId"`
	Status             InboxItemStatus    `json:"status"`
	DocType            InboxItemDocType   `json:"docType"`
	Amount             int64              `json:"amount"`
	Currency           string             `json:"currency"`
	VendorName         string             `json:"vendorName"`
	TransactionDate    time.Time          `json:"transactionDate"`
	AccountID          *string            `json:"accountId,omitempty"`
	BudgetID           *string            `json:"budgetId,omitempty"`
	ScheduledPaymentID *string            `json:"scheduledPaymentId,omitempty"`
	TransactionID      *string            `json:"transactionId,omitempty"`
	BorrowingID        *string            `json:"borrowingId,omitempty"`
	BorrowingLinkType  *BorrowingLinkType `json:"borrowingLinkType,omitempty"`
	RawPayload         string             `json:"rawPayload"`
	Metadata           map[string]any     `json:"metadata"`
	CreateTime         time.Time          `json:"createTime"`
}

// MetadataBool retrieves a boolean value from the metadata map safely.
func (i *InboxItem) MetadataBool(key string) bool {
	if i == nil || i.Metadata == nil {
		return false
	}
	v, _ := i.Metadata[key].(bool)
	return v
}

// MetadataString retrieves a string value from the metadata map safely.
func (i *InboxItem) MetadataString(key string) string {
	if i == nil || i.Metadata == nil {
		return ""
	}
	v, _ := i.Metadata[key].(string)
	return v
}

// StageInboxItem defines parameters to draft and stage an inbox item.
type StageInboxItem struct {
	IntegrationID   string
	DocType         InboxItemDocType
	Vendor          string
	Amount          int64
	Currency        string
	AccountID       *string
	CardLastFour    string
	SuggestedBudget string
	Date            string
	RawPayload      string
	Metadata        map[string]any
}

// ApproveInboxItem holds fields mapping override values during inbox confirmation.
type ApproveInboxItem struct {
	ID                         string
	AccountID                  string
	BudgetID                   string
	ScheduledPaymentID         string
	Amount                     int64
	Description                string
	DocType                    InboxItemDocType
	DestinationAccountID       string
	TransactionType            string
	TransactionID              string
	BorrowingID                string
	BorrowingLinkType          BorrowingLinkType
	OverwriteLinkedTransaction bool
	TransferLeg                string
	Currency                   string
}

// DefaultInboxItemSortField represents the fallback sorting column name for inbox items.
const DefaultInboxItemSortField = "create_time"

// InboxItemSortFields registry maps sortable inbox item field names to their cursor string extraction logic.
var InboxItemSortFields = map[string]func(*InboxItem) string{
	"create_time":      func(i *InboxItem) string { return i.CreateTime.Format(time.RFC3339Nano) },
	"amount":           func(i *InboxItem) string { return fmt.Sprintf("%018d", i.Amount) },
	"vendor_name":      func(i *InboxItem) string { return i.VendorName },
	"transaction_date": func(i *InboxItem) string { return i.TransactionDate.Format(time.RFC3339Nano) },
}

// IsInboxItemSortField validates if a sort column name is allowed.
func IsInboxItemSortField(field string) bool {
	_, ok := InboxItemSortFields[field]
	return ok
}

// GetSortValue extracts the keyset paging cursor value for a given field.
func (i *InboxItem) GetSortValue(field string) string {
	if fn, ok := InboxItemSortFields[field]; ok {
		return fn(i)
	}
	return i.GetSortValue(DefaultInboxItemSortField)
}
