package event

import (
	"encoding/json/v2"
	"fmt"

	calendarv1 "github.com/masterkeysrd/saturn/apis/saturn/calendar/v1"
	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	mailv1 "github.com/masterkeysrd/saturn/apis/saturn/mail/v1"
	domaincalendar "github.com/masterkeysrd/saturn/internal/domain/calendar"
	domainfinance "github.com/masterkeysrd/saturn/internal/domain/finance"
	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// RegisterWorkflowTriggerTopics registers all protobuf-generated workflow trigger topics onto reg.
func RegisterWorkflowTriggerTopics(reg *workflow.Registry) {
	mailv1.RegisterWorkflowTriggerTopics(reg)
	calendarv1.RegisterWorkflowTriggerTopics(reg)
	financev1.RegisterWorkflowTriggerTopics(reg)
}

// RegisterDomainEventConverters registers outbound domain-event-to-proto converters on reg.
func RegisterDomainEventConverters(reg *eventbus.ConverterRegistry) {
	reg.Register(domainmail.TopicMessageReceived, func(ev *domainmail.MessageReceivedEvent) (*mailv1.MessageReceivedEvent, error) {
		if ev == nil || ev.Message == nil {
			return nil, fmt.Errorf("mail.MessageReceivedEvent missing message")
		}
		pbMsg := domainMailMessageToProto(ev.Message, ev.BodyPlain, ev.BodyHTML)
		return &mailv1.MessageReceivedEvent{Message: pbMsg}, nil
	})

	reg.Register(domaincalendar.TopicEventCreated, func(ev *domaincalendar.EventCreatedEvent) (*calendarv1.CalendarEventCreatedEvent, error) {
		if ev == nil || ev.Event == nil {
			return nil, fmt.Errorf("calendar.EventCreatedEvent missing event")
		}
		return &calendarv1.CalendarEventCreatedEvent{
			Event: domainCalendarEventToProto(ev.Event),
		}, nil
	})

	reg.Register(domaincalendar.TopicEventUpdated, func(ev *domaincalendar.EventUpdatedEvent) (*calendarv1.CalendarEventUpdatedEvent, error) {
		if ev == nil || ev.Event == nil {
			return nil, fmt.Errorf("calendar.EventUpdatedEvent missing event")
		}
		return &calendarv1.CalendarEventUpdatedEvent{
			Event: domainCalendarEventToProto(ev.Event),
		}, nil
	})

	reg.Register(domainfinance.TopicScheduledTransactionCreated, func(ev *domainfinance.ScheduledTransactionCreatedEvent) (*financev1.ScheduledTransactionCreatedEvent, error) {
		if ev == nil || ev.ScheduledTransaction == nil {
			return nil, fmt.Errorf("finance.ScheduledTransactionCreatedEvent missing scheduled_transaction")
		}
		return &financev1.ScheduledTransactionCreatedEvent{
			ScheduledTransaction: domainScheduledTxToProto(ev.ScheduledTransaction),
		}, nil
	})

	reg.Register(domainfinance.TopicScheduledTransactionUpdated, func(ev *domainfinance.ScheduledTransactionUpdatedEvent) (*financev1.ScheduledTransactionUpdatedEvent, error) {
		if ev == nil || ev.ScheduledTransaction == nil {
			return nil, fmt.Errorf("finance.ScheduledTransactionUpdatedEvent missing scheduled_transaction")
		}
		return &financev1.ScheduledTransactionUpdatedEvent{
			ScheduledTransaction: domainScheduledTxToProto(ev.ScheduledTransaction),
		}, nil
	})

	reg.Register(domainfinance.TopicScheduledTransactionPaid, func(ev *domainfinance.ScheduledTransactionPaidEvent) (*financev1.ScheduledTransactionPaidEvent, error) {
		if ev == nil || ev.ScheduledTransaction == nil {
			return nil, fmt.Errorf("finance.ScheduledTransactionPaidEvent missing scheduled_transaction")
		}
		return &financev1.ScheduledTransactionPaidEvent{
			ScheduledTransaction: domainScheduledTxToProto(ev.ScheduledTransaction),
			TransactionId:        ev.TransactionID,
			PaidAt:               timestamppb.New(ev.ScheduledTransaction.UpdateTime),
		}, nil
	})

	reg.Register(domainfinance.TopicInboxItemCreated, func(ev *domainfinance.InboxItemCreatedEvent) (*financev1.InboxItemCreatedEvent, error) {
		if ev == nil || ev.InboxItem == nil {
			return nil, fmt.Errorf("finance.InboxItemCreatedEvent missing inbox_item")
		}
		return &financev1.InboxItemCreatedEvent{
			InboxItem: domainInboxItemToProto(ev.InboxItem),
		}, nil
	})

	reg.Register(domainfinance.TopicInboxItemApproved, func(ev *domainfinance.InboxItemApprovedEvent) (*financev1.InboxItemApprovedEvent, error) {
		if ev == nil || ev.InboxItem == nil {
			return nil, fmt.Errorf("finance.InboxItemApprovedEvent missing inbox_item")
		}
		return &financev1.InboxItemApprovedEvent{
			InboxItem: domainInboxItemToProto(ev.InboxItem),
		}, nil
	})

	reg.Register(domainfinance.TopicTransactionCreated, func(ev *domainfinance.TransactionCreatedEvent) (*financev1.TransactionCreatedEvent, error) {
		if ev == nil || ev.Transaction == nil {
			return nil, fmt.Errorf("finance.TransactionCreatedEvent missing transaction")
		}
		return &financev1.TransactionCreatedEvent{
			Transaction: domainTransactionToProto(ev.Transaction),
		}, nil
	})
}

func domainMailMessageToProto(m *domainmail.Message, bodyPlain, bodyHTML string) *mailv1.Message {
	pb := &mailv1.Message{
		Id:                 m.ID,
		SpaceId:            m.SpaceID,
		ConnectedAccountId: m.ConnectedAccountID,
		ThreadId:           m.ThreadID,
		Subject:            m.Subject,
		Snippet:            m.Snippet,
		From:               domainParticipantToProto(m.From),
		ReceivedAt:         timestamppb.New(m.ReceivedAt),
		IsUnread:           m.IsUnread,
		IsStarred:          m.IsStarred,
		IsDraft:            m.IsDraft,
		HasRemoteImages:    m.HasRemoteImages,
		BodyCached:         m.BodyCached,
		BodyPlain:          bodyPlain,
		BodyHtml:           bodyHTML,
		CreateTime:         timestamppb.New(m.CreateTime),
		UpdateTime:         timestamppb.New(m.UpdateTime),
	}
	if m.ProviderMessageID != nil {
		pb.ProviderMessageId = *m.ProviderMessageID
	}
	if m.RFCMessageID != nil {
		pb.RfcMessageId = *m.RFCMessageID
	}
	if m.SentAt != nil {
		pb.SentAt = timestamppb.New(*m.SentAt)
	}
	for _, p := range m.To {
		pb.To = append(pb.To, domainParticipantToProto(p))
	}
	for _, p := range m.Cc {
		pb.Cc = append(pb.Cc, domainParticipantToProto(p))
	}
	for _, p := range m.Bcc {
		pb.Bcc = append(pb.Bcc, domainParticipantToProto(p))
	}
	for _, p := range m.ReplyTo {
		pb.ReplyTo = append(pb.ReplyTo, domainParticipantToProto(p))
	}
	for _, att := range m.Attachments {
		pb.Attachments = append(pb.Attachments, &mailv1.Attachment{
			Id:          att.ID,
			Filename:    att.Filename,
			ContentType: att.ContentType,
			Size:        att.Size,
			ContentId:   att.ContentID,
			IsInline:    att.IsInline,
		})
	}
	return pb
}

func domainParticipantToProto(p domainmail.Participant) *mailv1.Participant {
	return &mailv1.Participant{
		Name:       p.Name,
		Email:      p.Email,
		AvatarUrl:  p.AvatarURL,
		IsVerified: p.IsVerified,
	}
}

func domainCalendarEventToProto(ev *domaincalendar.Event) *calendarv1.Event {
	pb := &calendarv1.Event{
		Id:            ev.ID,
		CalendarId:    ev.CalendarID,
		Title:         ev.Title,
		IsAllDay:      ev.IsAllDay,
		Exdates:       ev.EXDates,
		ExdatesAllDay: ev.EXDatesAllDay,
		CreateTime:    timestamppb.New(ev.CreateTime),
		UpdateTime:    timestamppb.New(ev.UpdateTime),
	}
	if ev.ProviderEventID != nil {
		pb.ProviderEventId = *ev.ProviderEventID
	}
	if ev.ETag != nil {
		pb.Etag = *ev.ETag
	}
	if ev.Description != nil {
		pb.Description = *ev.Description
	}
	if ev.Location != nil {
		pb.Location = *ev.Location
	}
	if ev.ConferenceURL != nil {
		pb.MeetUrl = *ev.ConferenceURL
	}
	if ev.StartTime != nil {
		pb.StartTime = timestamppb.New(*ev.StartTime)
	}
	if ev.EndTime != nil {
		pb.EndTime = timestamppb.New(*ev.EndTime)
	}
	if ev.Timezone != nil {
		pb.Timezone = *ev.Timezone
	}
	if ev.StartDate != nil {
		pb.StartDate = *ev.StartDate
	}
	if ev.EndDate != nil {
		pb.EndDate = *ev.EndDate
	}
	if ev.RRULE != nil {
		pb.Rrule = *ev.RRULE
	}
	if ev.RecurringMasterID != nil {
		pb.RecurringMasterId = *ev.RecurringMasterID
	}
	if ev.OriginalStartTime != nil {
		pb.OriginalStartTime = timestamppb.New(*ev.OriginalStartTime)
	}
	if ev.OriginalStartDate != nil {
		pb.OriginalStartDate = *ev.OriginalStartDate
	}
	if ev.SourceMailMessageID != nil {
		pb.SourceMailMessageId = *ev.SourceMailMessageID
	}
	switch ev.Status {
	case domaincalendar.EventStatusConfirmed:
		pb.Status = calendarv1.EventStatus_EVENT_STATUS_CONFIRMED
	case domaincalendar.EventStatusTentative:
		pb.Status = calendarv1.EventStatus_EVENT_STATUS_TENTATIVE
	case domaincalendar.EventStatusCancelled:
		pb.Status = calendarv1.EventStatus_EVENT_STATUS_CANCELLED
	}
	if len(ev.RemindersJSON) > 0 {
		var rems []domaincalendar.Reminder
		if err := json.Unmarshal(ev.RemindersJSON, &rems); err == nil {
			for _, r := range rems {
				pb.Reminders = append(pb.Reminders, &calendarv1.Reminder{
					Method:  r.Method,
					Minutes: int32(r.Minutes),
				})
			}
		}
	}
	return pb
}

func domainScheduledTxToProto(st *domainfinance.ScheduledTransaction) *financev1.ScheduledTransaction {
	var sourceType financev1.ScheduledTransaction_SourceType
	switch st.SourceType {
	case string(domainfinance.SourceTypeRecurrentTransaction):
		sourceType = financev1.ScheduledTransaction_RECURRENT_TRANSACTION
	case "LOAN":
		sourceType = financev1.ScheduledTransaction_LOAN
	case "TAX":
		sourceType = financev1.ScheduledTransaction_TAX
	}

	pb := &financev1.ScheduledTransaction{
		Id:         string(st.ID),
		SourceType: sourceType,
		SourceId:   st.SourceID,
		Amount:     st.Amount,
		Currency:   string(st.Currency),
		DueDate:    timestamppb.New(st.DueDate),
		CreateTime: timestamppb.New(st.CreateTime),
		UpdateTime: timestamppb.New(st.UpdateTime),
		Metadata: &financev1.ScheduledTransaction_Metadata{
			Name:        st.Metadata.Name,
			DueDate:     st.Metadata.DueDate,
			Description: st.Metadata.Description,
			VendorName:  st.Metadata.VendorName,
			InvoiceId:   st.Metadata.InvoiceID,
			Notes:       st.Metadata.Notes,
		},
	}
	if st.BudgetID != nil {
		pb.BudgetId = new(string(*st.BudgetID))
	}
	if st.AccountID != nil {
		pb.AccountId = new(string(*st.AccountID))
	}
	switch st.Status {
	case domainfinance.ScheduledTransactionPending:
		pb.Status = financev1.ScheduledTransaction_PENDING
	case domainfinance.ScheduledTransactionProcessing:
		pb.Status = financev1.ScheduledTransaction_PROCESSING
	case domainfinance.ScheduledTransactionSkipped:
		pb.Status = financev1.ScheduledTransaction_SKIPPED
	case domainfinance.ScheduledTransactionPaid:
		pb.Status = financev1.ScheduledTransaction_PAID
	}
	switch st.Type {
	case domainfinance.TransactionTypeExpense:
		pb.Type = financev1.RecurringType_EXPENSE
	case domainfinance.TransactionTypeIncome:
		pb.Type = financev1.RecurringType_INCOME
	}
	return pb
}

func domainInboxItemToProto(item *domainfinance.InboxItem) *financev1.InboxItem {
	pb := &financev1.InboxItem{
		Id:              item.ID,
		FlowRunId:       item.FlowRunID,
		Amount:          item.Amount,
		Currency:        item.Currency,
		VendorName:      item.VendorName,
		TransactionDate: timestamppb.New(item.TransactionDate),
		RawPayload:      item.RawPayload,
		CreateTime:      timestamppb.New(item.CreateTime),
	}
	if item.AccountID != nil {
		pb.AccountId = *item.AccountID
	}
	if item.BudgetID != nil {
		pb.BudgetId = *item.BudgetID
	}
	if item.ScheduledTransactionID != nil {
		pb.ScheduledTransactionId = *item.ScheduledTransactionID
	}
	if item.TransactionID != nil {
		pb.TransactionId = *item.TransactionID
	}
	if item.BorrowingID != nil {
		pb.BorrowingId = item.BorrowingID
	}
	switch item.Status {
	case domainfinance.InboxItemPending:
		pb.Status = financev1.InboxItem_PENDING
	case domainfinance.InboxItemProcessing:
		pb.Status = financev1.InboxItem_PROCESSING
	case domainfinance.InboxItemResolved:
		pb.Status = financev1.InboxItem_RESOLVED
	case domainfinance.InboxItemArchived:
		pb.Status = financev1.InboxItem_ARCHIVED
	}
	switch item.DocType {
	case domainfinance.InboxItemDocInvoice:
		pb.DocType = financev1.InboxItem_INVOICE
	case domainfinance.InboxItemDocReceipt:
		pb.DocType = financev1.InboxItem_RECEIPT
	case domainfinance.InboxItemDocBankNotification:
		pb.DocType = financev1.InboxItem_BANK_NOTIFICATION
	case domainfinance.InboxItemDocUnknown:
		pb.DocType = financev1.InboxItem_UNKNOWN
	}
	if len(item.Metadata) > 0 {
		pb.Metadata = make(map[string]string, len(item.Metadata))
		for k, v := range item.Metadata {
			pb.Metadata[k] = fmt.Sprint(v)
		}
	}
	return pb
}

func domainTransactionToProto(txn *domainfinance.Transaction) *financev1.Transaction {
	pb := &financev1.Transaction{
		Id:              string(txn.ID),
		Amount:          txn.Amount,
		Currency:        string(txn.Currency),
		AmountInBase:    txn.AmountInBase,
		Description:     txn.Description,
		TransactionDate: timestamppb.New(txn.TransactionDate),
		EffectiveDate:   timestamppb.New(txn.EffectiveDate),
		CreateTime:      timestamppb.New(txn.CreateTime),
		UpdateTime:      timestamppb.New(txn.UpdateTime),
	}
	if txn.BudgetID != nil {
		pb.BudgetId = string(*txn.BudgetID)
	}
	if txn.PeriodID != nil {
		pb.PeriodId = string(*txn.PeriodID)
	}
	if txn.AccountID != nil {
		pb.AccountId = new(string(*txn.AccountID))
	}
	switch txn.Type {
	case domainfinance.TransactionTypeExpense:
		pb.Type = financev1.Transaction_EXPENSE
	case domainfinance.TransactionTypeIncome:
		pb.Type = financev1.Transaction_INCOME
	case domainfinance.TransactionTypeTransferOut:
		pb.Type = financev1.Transaction_TRANSFER_OUT
	case domainfinance.TransactionTypeTransferIn:
		pb.Type = financev1.Transaction_TRANSFER_IN
	case domainfinance.TransactionTypeBalanceAdjustment:
		pb.Type = financev1.Transaction_BALANCE_ADJUSTMENT
	}
	meta := make(map[string]string)
	if txn.Metadata.ScheduledTransactionID != nil {
		meta["scheduled_transaction_id"] = string(*txn.Metadata.ScheduledTransactionID)
	}
	if txn.Metadata.RecurringTransactionID != nil {
		meta["recurring_transaction_id"] = string(*txn.Metadata.RecurringTransactionID)
	}
	if txn.Metadata.BorrowingID != nil {
		meta["borrowing_id"] = string(*txn.Metadata.BorrowingID)
	}
	if txn.Metadata.TransferID != nil {
		meta["transfer_id"] = string(*txn.Metadata.TransferID)
	}
	if txn.Metadata.Notes != "" {
		meta["notes"] = txn.Metadata.Notes
	}
	if len(meta) > 0 {
		pb.Metadata = meta
	}
	return pb
}
