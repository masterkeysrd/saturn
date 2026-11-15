package finance

import "context"

const (
	// TopicScheduledTransactionCreated is emitted when a pending scheduled transaction is created.
	TopicScheduledTransactionCreated = "finance.scheduled_transaction.created"
	// TopicScheduledTransactionUpdated is emitted when a scheduled transaction is modified.
	TopicScheduledTransactionUpdated = "finance.scheduled_transaction.updated"
	// TopicScheduledTransactionPaid is emitted when a scheduled transaction transitions to paid.
	TopicScheduledTransactionPaid = "finance.scheduled_transaction.paid"
	// TopicInboxItemCreated is emitted when a pending inbox item is staged.
	TopicInboxItemCreated = "finance.inbox_item.created"
	// TopicInboxItemApproved is emitted when an inbox item is approved into the ledger.
	TopicInboxItemApproved = "finance.inbox_item.approved"
	// TopicTransactionCreated is emitted when a ledger transaction is created.
	TopicTransactionCreated = "finance.transaction.created"
)

// EventPublisher emits pure finance domain events inside active transactions.
// @Mock
type EventPublisher interface {
	Publish(ctx context.Context, topic string, event any) error
}

// ScheduledTransactionCreatedEvent is emitted when a pending ScheduledTransaction is created.
type ScheduledTransactionCreatedEvent struct {
	ScheduledTransaction *ScheduledTransaction
}

// ScheduledTransactionUpdatedEvent is emitted when a ScheduledTransaction is modified.
type ScheduledTransactionUpdatedEvent struct {
	ScheduledTransaction *ScheduledTransaction
}

// ScheduledTransactionPaidEvent is emitted when a ScheduledTransaction transitions to paid.
type ScheduledTransactionPaidEvent struct {
	ScheduledTransaction *ScheduledTransaction
	TransactionID        *string
}

// InboxItemCreatedEvent is emitted when a new pending InboxItem is staged.
type InboxItemCreatedEvent struct {
	InboxItem *InboxItem
}

// InboxItemApprovedEvent is emitted when an InboxItem is resolved into the ledger.
type InboxItemApprovedEvent struct {
	InboxItem *InboxItem
}

// TransactionCreatedEvent is emitted when a ledger Transaction is created.
type TransactionCreatedEvent struct {
	Transaction *Transaction
}
