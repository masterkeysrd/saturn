package finance

import (
	"context"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

func TestService_StageInboxItemIdempotencyAndEvents(t *testing.T) {
	ctx := context.Background()
	spIDStr, _ := id.Generate("spc_")
	spID := SpaceID(spIDStr)
	rCtx := NewRequestContext(spID, "usr_1", time.UTC, "USD")

	var topics []string
	eventsMock := &EventPublisherMock{
		PublishFunc: func(_ context.Context, topic string, _ any) error {
			topics = append(topics, topic)
			return nil
		},
	}

	settingsStore := newSettingsStoreMock(nil)
	_ = settingsStore.Create(ctx, rCtx, &Settings{BaseCurrency: Currency("USD")})
	inboxStore := newInboxItemStoreMock(nil)
	txnStore := newTransactionStoreMock(nil)
	eventStore := newTransactionEventStoreMock(nil)
	accStore := newAccountStoreMock(nil)
	bgtID, _ := NewBudgetID()
	bgtStore := newBudgetStoreMock(map[BudgetID]*Budget{
		bgtID: {
			ID:          bgtID,
			Name:        "General",
			LimitAmount: 10000,
			Currency:    "USD",
			Interval:    IntervalMonthly,
			Status:      BudgetStatusActive,
		},
	})
	periodStore := newPeriodStoreMock(nil)
	rateStore := newExchangeRateStoreMock(nil)

	svc := NewService(Dependencies{
		Settings:              settingsStore,
		BudgetStore:           bgtStore,
		PeriodStore:           periodStore,
		ExchangeRateStore:     rateStore,
		AccountStore:          accStore,
		TransactionStore:      txnStore,
		TransactionEventStore: eventStore,
		InboxItemStore:        inboxStore,
		Events:                eventsMock,
	})

	idemKey := "mail:msg_123"
	flowRunID := "wfr_abc"

	first, err := svc.StageInboxItem(ctx, rCtx, &StageInboxItem{
		FlowRunID:       &flowRunID,
		IdempotencyKey:  &idemKey,
		DocType:         InboxItemDocReceipt,
		Vendor:          "Acme Store",
		Amount:          2500,
		Currency:        "USD",
		SuggestedBudget: string(bgtID),
	})
	if err != nil {
		t.Fatalf("first StageInboxItem failed: %v", err)
	}
	if first.FlowRunID == nil || *first.FlowRunID != flowRunID {
		t.Fatalf("expected FlowRunID %q, got %v", flowRunID, first.FlowRunID)
	}

	// Second call with same idempotency key returns same item without emitting duplicate event
	second, err := svc.StageInboxItem(ctx, rCtx, &StageInboxItem{
		FlowRunID:      new("wfr_retry"),
		IdempotencyKey: &idemKey,
		DocType:        InboxItemDocReceipt,
		Vendor:         "Acme Store",
		Amount:         2500,
		Currency:       "USD",
	})
	if err != nil {
		t.Fatalf("second StageInboxItem failed: %v", err)
	}
	if second.ID != first.ID {
		t.Fatalf("expected deduplicated item ID %q, got %q", first.ID, second.ID)
	}
	if len(topics) != 1 || topics[0] != TopicInboxItemCreated {
		t.Fatalf("expected 1 %q event, got %v", TopicInboxItemCreated, topics)
	}

	// Approve item -> emits TransactionCreated and InboxItemApproved
	if _, err := svc.ApproveInboxItem(ctx, rCtx, first.ID); err != nil {
		t.Fatalf("ApproveInboxItem failed: %v", err)
	}
	if len(topics) != 3 || topics[1] != TopicTransactionCreated || topics[2] != TopicInboxItemApproved {
		t.Fatalf("expected [inbox_item.created, transaction.created, inbox_item.approved], got %v", topics)
	}
}
