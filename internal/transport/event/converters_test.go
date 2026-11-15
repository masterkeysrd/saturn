package event

import (
	"testing"
	"time"

	calendarv1 "github.com/masterkeysrd/saturn/apis/saturn/calendar/v1"
	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	mailv1 "github.com/masterkeysrd/saturn/apis/saturn/mail/v1"
	domaincalendar "github.com/masterkeysrd/saturn/internal/domain/calendar"
	domainfinance "github.com/masterkeysrd/saturn/internal/domain/finance"
	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
	"google.golang.org/protobuf/proto"
)

func TestRegisterDomainEventConverters(t *testing.T) {
	reg := eventbus.NewConverterRegistry()
	RegisterDomainEventConverters(reg)

	now := time.Date(2026, 5, 1, 10, 0, 0, 0, time.UTC)

	tests := []struct {
		name    string
		topic   string
		event   any
		wantErr bool
		check   func(t *testing.T, msg proto.Message)
	}{
		{
			name:  "mail.message.received",
			topic: domainmail.TopicMessageReceived,
			event: &domainmail.MessageReceivedEvent{
				Message: &domainmail.Message{
					ID:                 "msg_1",
					ConnectedAccountID: "cac_1",
					ThreadID:           "mth_1",
					Subject:            "Invoice #42",
					From:               domainmail.Participant{Name: "Acme", Email: "billing@acme.com"},
					ReceivedAt:         now,
					Attachments:        []domainmail.AttachmentMeta{{ID: "mat_1", Filename: "inv.pdf", ContentType: "application/pdf", Size: 120}},
				},
				BodyPlain: "Amount due $50",
				BodyHTML:  "<p>Amount due $50</p>",
			},
			check: func(t *testing.T, msg proto.Message) {
				ev, ok := msg.(*mailv1.MessageReceivedEvent)
				if !ok || ev.Message == nil {
					t.Fatalf("expected *mailv1.MessageReceivedEvent with Message, got %T", msg)
				}
				if ev.Message.Id != "msg_1" || ev.Message.BodyPlain != "Amount due $50" || len(ev.Message.Attachments) != 1 {
					t.Fatalf("unexpected converted mail message: %+v", ev.Message)
				}
			},
		},
		{
			name:  "calendar.event.created",
			topic: domaincalendar.TopicEventCreated,
			event: &domaincalendar.EventCreatedEvent{
				Event: &domaincalendar.Event{
					ID:         "cev_1",
					CalendarID: "cal_1",
					Title:      "Rent Due",
					Status:     domaincalendar.EventStatusConfirmed,
					StartTime:  &now,
				},
			},
			check: func(t *testing.T, msg proto.Message) {
				ev, ok := msg.(*calendarv1.CalendarEventCreatedEvent)
				if !ok || ev.Event == nil || ev.Event.Id != "cev_1" || ev.Event.Title != "Rent Due" {
					t.Fatalf("unexpected converted calendar created event: %+v", msg)
				}
			},
		},
		{
			name:  "calendar.event.updated",
			topic: domaincalendar.TopicEventUpdated,
			event: &domaincalendar.EventUpdatedEvent{
				Event: &domaincalendar.Event{
					ID:         "cev_1",
					CalendarID: "cal_1",
					Title:      "Rent Due Updated",
				},
			},
			check: func(t *testing.T, msg proto.Message) {
				ev, ok := msg.(*calendarv1.CalendarEventUpdatedEvent)
				if !ok || ev.Event == nil || ev.Event.Title != "Rent Due Updated" {
					t.Fatalf("unexpected converted calendar updated event: %+v", msg)
				}
			},
		},
		{
			name:  "finance.scheduled_transaction.created",
			topic: domainfinance.TopicScheduledTransactionCreated,
			event: &domainfinance.ScheduledTransactionCreatedEvent{
				ScheduledTransaction: &domainfinance.ScheduledTransaction{
					ID:         "sch_1",
					SourceType: "RECURRENT_TRANSACTION",
					SourceID:   "rec_1",
					Amount:     150000,
					Currency:   "USD",
					Status:     domainfinance.ScheduledTransactionPending,
					Type:       domainfinance.TransactionTypeExpense,
					DueDate:    now,
				},
			},
			check: func(t *testing.T, msg proto.Message) {
				ev, ok := msg.(*financev1.ScheduledTransactionCreatedEvent)
				if !ok || ev.ScheduledTransaction == nil || ev.ScheduledTransaction.Id != "sch_1" {
					t.Fatalf("unexpected converted scheduled tx created event: %+v", msg)
				}
			},
		},
		{
			name:  "finance.scheduled_transaction.updated",
			topic: domainfinance.TopicScheduledTransactionUpdated,
			event: &domainfinance.ScheduledTransactionUpdatedEvent{
				ScheduledTransaction: &domainfinance.ScheduledTransaction{ID: "sch_1", Amount: 2000},
			},
			check: func(t *testing.T, msg proto.Message) {
				ev, ok := msg.(*financev1.ScheduledTransactionUpdatedEvent)
				if !ok || ev.ScheduledTransaction == nil || ev.ScheduledTransaction.Amount != 2000 {
					t.Fatalf("unexpected converted scheduled tx updated event: %+v", msg)
				}
			},
		},
		{
			name:  "finance.scheduled_transaction.paid",
			topic: domainfinance.TopicScheduledTransactionPaid,
			event: &domainfinance.ScheduledTransactionPaidEvent{
				ScheduledTransaction: &domainfinance.ScheduledTransaction{
					ID:         "sch_1",
					Status:     domainfinance.ScheduledTransactionPaid,
					UpdateTime: now,
				},
				TransactionID: new("txn_1"),
			},
			check: func(t *testing.T, msg proto.Message) {
				ev, ok := msg.(*financev1.ScheduledTransactionPaidEvent)
				if !ok || ev.ScheduledTransaction == nil || ev.GetTransactionId() != "txn_1" {
					t.Fatalf("unexpected converted scheduled tx paid event: %+v", msg)
				}
			},
		},
		{
			name:  "finance.inbox_item.created",
			topic: domainfinance.TopicInboxItemCreated,
			event: &domainfinance.InboxItemCreatedEvent{
				InboxItem: &domainfinance.InboxItem{
					ID:         "ibx_1",
					FlowRunID:  new("wfr_1"),
					DocType:    domainfinance.InboxItemDocReceipt,
					Status:     domainfinance.InboxItemPending,
					VendorName: "Coffee",
					Amount:     450,
					Currency:   "USD",
				},
			},
			check: func(t *testing.T, msg proto.Message) {
				ev, ok := msg.(*financev1.InboxItemCreatedEvent)
				if !ok || ev.InboxItem == nil || ev.InboxItem.GetFlowRunId() != "wfr_1" {
					t.Fatalf("unexpected converted inbox created event: %+v", msg)
				}
			},
		},
		{
			name:  "finance.inbox_item.approved",
			topic: domainfinance.TopicInboxItemApproved,
			event: &domainfinance.InboxItemApprovedEvent{
				InboxItem: &domainfinance.InboxItem{
					ID:            "ibx_1",
					Status:        domainfinance.InboxItemResolved,
					TransactionID: new("txn_1"),
				},
			},
			check: func(t *testing.T, msg proto.Message) {
				ev, ok := msg.(*financev1.InboxItemApprovedEvent)
				if !ok || ev.InboxItem == nil || ev.InboxItem.TransactionId != "txn_1" {
					t.Fatalf("unexpected converted inbox approved event: %+v", msg)
				}
			},
		},
		{
			name:  "finance.transaction.created",
			topic: domainfinance.TopicTransactionCreated,
			event: &domainfinance.TransactionCreatedEvent{
				Transaction: &domainfinance.Transaction{
					ID:       "txn_1",
					Type:     domainfinance.TransactionTypeExpense,
					Amount:   1200,
					Currency: "USD",
				},
			},
			check: func(t *testing.T, msg proto.Message) {
				ev, ok := msg.(*financev1.TransactionCreatedEvent)
				if !ok || ev.Transaction == nil || ev.Transaction.Id != "txn_1" {
					t.Fatalf("unexpected converted transaction created event: %+v", msg)
				}
			},
		},
		{
			name:    "Unknown topic returns error",
			topic:   "unknown.topic",
			event:   struct{}{},
			wantErr: true,
		},
		{
			name:    "Nil inner entity returns error",
			topic:   domaincalendar.TopicEventCreated,
			event:   &domaincalendar.EventCreatedEvent{},
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			msg, err := reg.Convert(t.Context(), tc.topic, tc.event)
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			tc.check(t, msg)
		})
	}
}

func TestRegisterWorkflowTriggerTopics(t *testing.T) {
	reg := workflow.NewRegistry()
	RegisterWorkflowTriggerTopics(reg)

	catalog := reg.Catalog()
	want := []string{
		domaincalendar.TopicEventCreated,
		domaincalendar.TopicEventUpdated,
		domainfinance.TopicInboxItemApproved,
		domainfinance.TopicInboxItemCreated,
		domainfinance.TopicScheduledTransactionCreated,
		domainfinance.TopicScheduledTransactionPaid,
		domainfinance.TopicScheduledTransactionUpdated,
		domainfinance.TopicTransactionCreated,
		domainmail.TopicMessageReceived,
	}

	got := make(map[string]workflow.TriggerTopicDescriptor, len(catalog.TriggerTopics))
	for _, topic := range catalog.TriggerTopics {
		got[topic.Topic] = topic
	}

	for _, name := range want {
		desc, ok := got[name]
		if !ok {
			t.Errorf("expected generated trigger topic %q to be registered", name)
			continue
		}
		if desc.DisplayName == "" || desc.Description == "" {
			t.Errorf("topic %q missing DisplayName or Description: %+v", name, desc)
		}
		if desc.PayloadSchema["type"] != "object" {
			t.Errorf("topic %q expected object PayloadSchema, got %+v", name, desc.PayloadSchema)
		}
	}
}
