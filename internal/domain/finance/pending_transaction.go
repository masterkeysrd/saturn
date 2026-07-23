package finance

import (
	"time"
)

// PendingTransaction represents a parsed inbound transaction waiting in the staging queue.
type PendingTransaction struct {
	ID                 string
	SpaceID            string
	IntegrationID      string
	RawVendor          string
	SuggestedVendor    string
	Amount             int64
	Currency           string
	SuggestedAccountID *string
	SuggestedBudgetID  *string
	SuggestedPaymentID *string
	MetadataJSON       string // JSON string representation
	CreateTime         time.Time
}

// StageTransaction defines parameters to draft and stage a pending transaction.
type StageTransaction struct {
	IntegrationID   string
	Vendor          string
	Amount          int64
	Currency        string
	CardLastFour    string
	SuggestedBudget string
	Date            string
	MetadataJSON    string
}

// ApprovePendingTransaction holds fields mapping override values during staging confirmation.
type ApprovePendingTransaction struct {
	ID                 string
	AccountID          string
	BudgetID           string
	ScheduledPaymentID string
	Amount             int64
	Description        string
}
