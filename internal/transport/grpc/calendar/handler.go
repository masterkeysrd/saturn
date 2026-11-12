package calendar

import (
	"context"
	"time"

	calendarv1 "github.com/masterkeysrd/saturn/apis/saturn/calendar/v1"
	calendaraggregator "github.com/masterkeysrd/saturn/internal/aggregator/calendar"
	appcalendar "github.com/masterkeysrd/saturn/internal/application/calendar"
	domaincalendar "github.com/masterkeysrd/saturn/internal/domain/calendar"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Handler implements calendarv1.CalendarServiceServer, routing mutations to
// the application Coordinator and queries to the read-only Aggregator.
type Handler struct {
	calendarv1.UnimplementedCalendarServiceServer
	coordinator appcalendar.Coordinator
	aggregator  *calendaraggregator.Service
}

// NewHandler creates a new Calendar gRPC service handler.
func NewHandler(coordinator appcalendar.Coordinator, aggregator *calendaraggregator.Service) *Handler {
	return &Handler{
		coordinator: coordinator,
		aggregator:  aggregator,
	}
}

var _ calendarv1.CalendarServiceServer = (*Handler)(nil)

func getSpaceID(ctx context.Context, op errors.Op) (string, error) {
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok || spaceID == "" {
		return "", errors.E(op, errors.Unauthenticated, "missing active space context")
	}
	return spaceID, nil
}

func (h *Handler) ListCalendars(ctx context.Context, _ *calendarv1.ListCalendarsRequest) (*calendarv1.ListCalendarsResponse, error) {
	const op errors.Op = "grpc/calendar.ListCalendars"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	cals, err := h.aggregator.ListCalendars(ctx, spaceID)
	if err != nil {
		return nil, err
	}

	protoCals := make([]*calendarv1.Calendar, len(cals))
	for i, c := range cals {
		protoCals[i] = mapDomainCalendarToProto(c)
	}

	return &calendarv1.ListCalendarsResponse{
		Calendars: protoCals,
	}, nil
}

func (h *Handler) GetCalendar(ctx context.Context, req *calendarv1.GetCalendarRequest) (*calendarv1.Calendar, error) {
	const op errors.Op = "grpc/calendar.GetCalendar"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	cal, err := h.aggregator.GetCalendar(ctx, spaceID, req.GetId())
	if err != nil {
		return nil, err
	}

	return mapDomainCalendarToProto(cal), nil
}

func (h *Handler) CreateCalendar(ctx context.Context, req *calendarv1.CreateCalendarRequest) (*calendarv1.Calendar, error) {
	domainCal := mapProtoToDomainCalendar(req.GetCalendar())
	cal, err := h.coordinator.CreateCalendar(ctx, &appcalendar.CreateCalendarRequest{
		Calendar: domainCal,
	})
	if err != nil {
		return nil, err
	}

	return mapDomainCalendarToProto(cal), nil
}

func (h *Handler) UpdateCalendar(ctx context.Context, req *calendarv1.UpdateCalendarRequest) (*calendarv1.Calendar, error) {
	domainCal := mapProtoToDomainCalendar(req.GetCalendar())
	var mask []string
	if req.GetUpdateMask() != nil {
		mask = req.GetUpdateMask().GetPaths()
	}

	cal, err := h.coordinator.UpdateCalendar(ctx, &appcalendar.UpdateCalendarRequest{
		ID:         req.GetId(),
		Calendar:   domainCal,
		UpdateMask: mask,
	})
	if err != nil {
		return nil, err
	}

	return mapDomainCalendarToProto(cal), nil
}

func (h *Handler) DeleteCalendar(ctx context.Context, req *calendarv1.DeleteCalendarRequest) (*emptypb.Empty, error) {
	if err := h.coordinator.DeleteCalendar(ctx, &appcalendar.DeleteCalendarRequest{
		ID: req.GetId(),
	}); err != nil {
		return nil, err
	}
	return &emptypb.Empty{}, nil
}

func (h *Handler) EnsureDefaultCalendar(ctx context.Context, _ *calendarv1.EnsureDefaultCalendarRequest) (*calendarv1.Calendar, error) {
	cal, err := h.coordinator.EnsureDefaultCalendar(ctx, &appcalendar.EnsureDefaultCalendarRequest{})
	if err != nil {
		return nil, err
	}
	return mapDomainCalendarToProto(cal), nil
}

func (h *Handler) ListEvents(ctx context.Context, req *calendarv1.ListEventsRequest) (*calendarv1.ListEventsResponse, error) {
	const op errors.Op = "grpc/calendar.ListEvents"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	timeMin := req.GetTimeMin().AsTime()
	timeMax := req.GetTimeMax().AsTime()

	occurrences, err := h.aggregator.ListEvents(
		ctx,
		spaceID,
		req.GetCalendarIds(),
		timeMin,
		timeMax,
		req.GetQuery(),
	)
	if err != nil {
		return nil, err
	}

	protoOccs := make([]*calendarv1.EventOccurrence, len(occurrences))
	for i, occ := range occurrences {
		protoOccs[i] = mapProjectionToProto(occ)
	}

	return &calendarv1.ListEventsResponse{
		Occurrences: protoOccs,
	}, nil
}

func (h *Handler) GetEvent(ctx context.Context, req *calendarv1.GetEventRequest) (*calendarv1.Event, error) {
	const op errors.Op = "grpc/calendar.GetEvent"

	spaceID, err := getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	ev, err := h.aggregator.GetEvent(ctx, spaceID, req.GetId())
	if err != nil {
		return nil, err
	}

	return mapDomainEventToProto(ev), nil
}

func (h *Handler) CreateEvent(ctx context.Context, req *calendarv1.CreateEventRequest) (*calendarv1.Event, error) {
	domainEv := mapProtoToDomainEvent(req.GetEvent())
	ev, err := h.coordinator.CreateEvent(ctx, &appcalendar.CreateEventRequest{
		Event: domainEv,
	})
	if err != nil {
		return nil, err
	}

	return mapDomainEventToProto(ev), nil
}

func (h *Handler) UpdateEvent(ctx context.Context, req *calendarv1.UpdateEventRequest) (*calendarv1.Event, error) {
	domainEv := mapProtoToDomainEvent(req.GetEvent())
	var mask []string
	if req.GetUpdateMask() != nil {
		mask = req.GetUpdateMask().GetPaths()
	}

	scope := domaincalendar.RecurrenceEditScopeAllEvents
	switch req.GetRecurrenceScope() {
	case calendarv1.RecurrenceScope_RECURRENCE_SCOPE_THIS_EVENT:
		scope = domaincalendar.RecurrenceEditScopeThisEvent
	case calendarv1.RecurrenceScope_RECURRENCE_SCOPE_THIS_AND_FOLLOWING:
		scope = domaincalendar.RecurrenceEditScopeThisAndFollowing
	case calendarv1.RecurrenceScope_RECURRENCE_SCOPE_ALL_EVENTS:
		scope = domaincalendar.RecurrenceEditScopeAllEvents
	}

	var targetStartTime *time.Time
	if req.GetTargetStartTime() != nil {
		t := req.GetTargetStartTime().AsTime()
		targetStartTime = &t
	}
	var targetStartDate *string
	if req.GetTargetStartDate() != "" {
		s := req.GetTargetStartDate()
		targetStartDate = &s
	}

	ev, err := h.coordinator.UpdateEvent(ctx, &appcalendar.UpdateEventRequest{
		ID:              req.GetId(),
		Event:           domainEv,
		UpdateMask:      mask,
		Scope:           scope,
		TargetStartTime: targetStartTime,
		TargetStartDate: targetStartDate,
	})
	if err != nil {
		return nil, err
	}

	return mapDomainEventToProto(ev), nil
}

func (h *Handler) DeleteEvent(ctx context.Context, req *calendarv1.DeleteEventRequest) (*emptypb.Empty, error) {
	scope := domaincalendar.RecurrenceEditScopeAllEvents
	switch req.GetRecurrenceScope() {
	case calendarv1.RecurrenceScope_RECURRENCE_SCOPE_THIS_EVENT:
		scope = domaincalendar.RecurrenceEditScopeThisEvent
	case calendarv1.RecurrenceScope_RECURRENCE_SCOPE_THIS_AND_FOLLOWING:
		scope = domaincalendar.RecurrenceEditScopeThisAndFollowing
	case calendarv1.RecurrenceScope_RECURRENCE_SCOPE_ALL_EVENTS:
		scope = domaincalendar.RecurrenceEditScopeAllEvents
	}

	var targetStartTime *time.Time
	if req.GetTargetStartTime() != nil {
		t := req.GetTargetStartTime().AsTime()
		targetStartTime = &t
	}
	var targetStartDate *string
	if req.GetTargetStartDate() != "" {
		s := req.GetTargetStartDate()
		targetStartDate = &s
	}

	if err := h.coordinator.DeleteEvent(ctx, &appcalendar.DeleteEventRequest{
		ID:              req.GetId(),
		Scope:           scope,
		TargetStartTime: targetStartTime,
		TargetStartDate: targetStartDate,
	}); err != nil {
		return nil, err
	}

	return &emptypb.Empty{}, nil
}

func (h *Handler) RespondToEvent(ctx context.Context, req *calendarv1.RespondToEventRequest) (*calendarv1.Event, error) {
	status := "needs_action"
	switch req.GetResponse() {
	case calendarv1.AttendeeResponseStatus_ATTENDEE_RESPONSE_STATUS_ACCEPTED:
		status = "accepted"
	case calendarv1.AttendeeResponseStatus_ATTENDEE_RESPONSE_STATUS_DECLINED:
		status = "declined"
	case calendarv1.AttendeeResponseStatus_ATTENDEE_RESPONSE_STATUS_TENTATIVE:
		status = "tentative"
	}

	ev, err := h.coordinator.RespondToEvent(ctx, &appcalendar.RespondToEventRequest{
		ID:             req.GetId(),
		ResponseStatus: status,
	})
	if err != nil {
		return nil, err
	}

	return mapDomainEventToProto(ev), nil
}

// Proto <-> Domain Converters

func mapDomainCalendarToProto(cal *domaincalendar.Calendar) *calendarv1.Calendar {
	if cal == nil {
		return nil
	}

	src := calendarv1.CalendarSource_CALENDAR_SOURCE_NATIVE
	if cal.Source == domaincalendar.SourceExternal {
		src = calendarv1.CalendarSource_CALENDAR_SOURCE_EXTERNAL
	}

	role := calendarv1.AccessRole_ACCESS_ROLE_READER
	switch cal.AccessRole {
	case domaincalendar.AccessRoleOwner:
		role = calendarv1.AccessRole_ACCESS_ROLE_OWNER
	case domaincalendar.AccessRoleWriter:
		role = calendarv1.AccessRole_ACCESS_ROLE_WRITER
	case domaincalendar.AccessRoleReader:
		role = calendarv1.AccessRole_ACCESS_ROLE_READER
	case domaincalendar.AccessRoleFreeBusy:
		role = calendarv1.AccessRole_ACCESS_ROLE_FREE_BUSY_READER
	}

	protoCal := &calendarv1.Calendar{
		Id:              cal.ID,
		SpaceId:         cal.SpaceID,
		Source:          src,
		Name:            cal.Name,
		Timezone:        cal.Timezone,
		AccessRole:      role,
		IsPrimary:       cal.IsPrimary,
		IsEnabled:       cal.IsEnabled,
		IsDefaultNative: cal.IsDefaultNative,
		CreateTime:      timestamppb.New(cal.CreateTime),
		UpdateTime:      timestamppb.New(cal.UpdateTime),
	}

	if cal.ConnectedAccountID != nil {
		protoCal.ConnectedAccountId = *cal.ConnectedAccountID
	}
	if cal.ProviderCalendarID != nil {
		protoCal.ProviderCalendarId = *cal.ProviderCalendarID
	}
	if cal.Description != nil {
		protoCal.Description = *cal.Description
	}
	if cal.Color != nil {
		protoCal.Color = *cal.Color
	}
	if cal.LastSyncedAt != nil {
		protoCal.LastSyncTime = timestamppb.New(*cal.LastSyncedAt)
	}

	return protoCal
}

func mapProtoToDomainCalendar(p *calendarv1.Calendar) *domaincalendar.Calendar {
	if p == nil {
		return nil
	}

	cal := &domaincalendar.Calendar{
		ID:        p.GetId(),
		Name:      p.GetName(),
		Timezone:  p.GetTimezone(),
		IsEnabled: p.GetIsEnabled(),
	}
	if p.GetDescription() != "" {
		desc := p.GetDescription()
		cal.Description = &desc
	}
	if p.GetColor() != "" {
		color := p.GetColor()
		cal.Color = &color
	}
	return cal
}

func mapDomainEventToProto(ev *domaincalendar.Event) *calendarv1.Event {
	if ev == nil {
		return nil
	}

	src := calendarv1.CalendarSource_CALENDAR_SOURCE_NATIVE
	if ev.ProviderEventID != nil && *ev.ProviderEventID != "" {
		src = calendarv1.CalendarSource_CALENDAR_SOURCE_EXTERNAL
	}

	protoEv := &calendarv1.Event{
		Id:         ev.ID,
		CalendarId: ev.CalendarID,
		Source:     src,
		Title:      ev.Title,
		IsAllDay:   ev.IsAllDay,
		CreateTime: timestamppb.New(ev.CreateTime),
		UpdateTime: timestamppb.New(ev.UpdateTime),
	}

	if ev.ProviderEventID != nil {
		protoEv.ProviderEventId = *ev.ProviderEventID
	}
	if ev.ETag != nil {
		protoEv.Etag = *ev.ETag
	}
	if ev.Description != nil {
		protoEv.Description = *ev.Description
	}
	if ev.Location != nil {
		protoEv.Location = *ev.Location
	}
	if ev.ConferenceURL != nil {
		protoEv.MeetUrl = *ev.ConferenceURL
	}
	if ev.StartTime != nil {
		protoEv.StartTime = timestamppb.New(*ev.StartTime)
	}
	if ev.EndTime != nil {
		protoEv.EndTime = timestamppb.New(*ev.EndTime)
	}
	if ev.Timezone != nil {
		protoEv.Timezone = *ev.Timezone
	}
	if ev.StartDate != nil {
		protoEv.StartDate = *ev.StartDate
	}
	if ev.EndDate != nil {
		protoEv.EndDate = *ev.EndDate
	}
	if ev.RRULE != nil {
		protoEv.Rrule = *ev.RRULE
	}
	protoEv.Exdates = ev.EXDates
	protoEv.ExdatesAllDay = ev.EXDatesAllDay
	if ev.RecurringMasterID != nil {
		protoEv.RecurringMasterId = *ev.RecurringMasterID
	}
	if ev.OriginalStartTime != nil {
		protoEv.OriginalStartTime = timestamppb.New(*ev.OriginalStartTime)
	}
	if ev.OriginalStartDate != nil {
		protoEv.OriginalStartDate = *ev.OriginalStartDate
	}
	if ev.SourceMailMessageID != nil {
		protoEv.SourceMailMessageId = *ev.SourceMailMessageID
	}

	switch ev.Status {
	case domaincalendar.EventStatusConfirmed:
		protoEv.Status = calendarv1.EventStatus_EVENT_STATUS_CONFIRMED
	case domaincalendar.EventStatusTentative:
		protoEv.Status = calendarv1.EventStatus_EVENT_STATUS_TENTATIVE
	case domaincalendar.EventStatusCancelled:
		protoEv.Status = calendarv1.EventStatus_EVENT_STATUS_CANCELLED
	}

	if org, err := ev.Organizer(); err == nil && org != nil {
		protoEv.Organizer = &calendarv1.Organizer{
			Email:       org.Email,
			DisplayName: org.DisplayName,
			IsSelf:      org.Self,
		}
	}

	if atts, err := ev.Attendees(); err == nil {
		for _, a := range atts {
			resp := calendarv1.AttendeeResponseStatus_ATTENDEE_RESPONSE_STATUS_NEEDS_ACTION
			switch a.ResponseStatus {
			case "accepted":
				resp = calendarv1.AttendeeResponseStatus_ATTENDEE_RESPONSE_STATUS_ACCEPTED
			case "declined":
				resp = calendarv1.AttendeeResponseStatus_ATTENDEE_RESPONSE_STATUS_DECLINED
			case "tentative":
				resp = calendarv1.AttendeeResponseStatus_ATTENDEE_RESPONSE_STATUS_TENTATIVE
			}
			protoEv.Attendees = append(protoEv.Attendees, &calendarv1.Attendee{
				Email:          a.Email,
				DisplayName:    a.DisplayName,
				ResponseStatus: resp,
				IsOptional:     a.Optional,
				IsOrganizer:    a.Organizer,
			})
		}
	}

	if rems, err := ev.Reminders(); err == nil {
		for _, r := range rems {
			protoEv.Reminders = append(protoEv.Reminders, &calendarv1.Reminder{
				Method:  r.Method,
				Minutes: r.Minutes,
			})
		}
	}

	return protoEv
}

func mapProtoToDomainEvent(p *calendarv1.Event) *domaincalendar.Event {
	if p == nil {
		return nil
	}

	ev := &domaincalendar.Event{
		ID:         p.GetId(),
		CalendarID: p.GetCalendarId(),
		Title:      p.GetTitle(),
		IsAllDay:   p.GetIsAllDay(),
	}

	if p.GetDescription() != "" {
		desc := p.GetDescription()
		ev.Description = &desc
	}
	if p.GetLocation() != "" {
		loc := p.GetLocation()
		ev.Location = &loc
	}
	if p.GetStartTime() != nil {
		t := p.GetStartTime().AsTime()
		ev.StartTime = &t
	}
	if p.GetEndTime() != nil {
		t := p.GetEndTime().AsTime()
		ev.EndTime = &t
	}
	if p.GetTimezone() != "" {
		tz := p.GetTimezone()
		ev.Timezone = &tz
	}
	if p.GetStartDate() != "" {
		sd := p.GetStartDate()
		ev.StartDate = &sd
	}
	if p.GetEndDate() != "" {
		ed := p.GetEndDate()
		ev.EndDate = &ed
	}
	if p.GetRrule() != "" {
		rrule := p.GetRrule()
		ev.RRULE = &rrule
	}
	ev.EXDates = p.GetExdates()
	ev.EXDatesAllDay = p.GetExdatesAllDay()
	if p.GetSourceMailMessageId() != "" {
		mid := p.GetSourceMailMessageId()
		ev.SourceMailMessageID = &mid
	}

	switch p.GetStatus() {
	case calendarv1.EventStatus_EVENT_STATUS_CONFIRMED:
		ev.Status = domaincalendar.EventStatusConfirmed
	case calendarv1.EventStatus_EVENT_STATUS_TENTATIVE:
		ev.Status = domaincalendar.EventStatusTentative
	case calendarv1.EventStatus_EVENT_STATUS_CANCELLED:
		ev.Status = domaincalendar.EventStatusCancelled
	default:
		ev.Status = domaincalendar.EventStatusConfirmed
	}

	if p.GetOrganizer() != nil {
		_ = ev.SetOrganizer(&domaincalendar.Organizer{
			Email:       p.GetOrganizer().GetEmail(),
			DisplayName: p.GetOrganizer().GetDisplayName(),
			Self:        p.GetOrganizer().GetIsSelf(),
		})
	}

	if len(p.GetAttendees()) > 0 {
		var atts []domaincalendar.Attendee
		for _, a := range p.GetAttendees() {
			resp := "needs_action"
			switch a.GetResponseStatus() {
			case calendarv1.AttendeeResponseStatus_ATTENDEE_RESPONSE_STATUS_ACCEPTED:
				resp = "accepted"
			case calendarv1.AttendeeResponseStatus_ATTENDEE_RESPONSE_STATUS_DECLINED:
				resp = "declined"
			case calendarv1.AttendeeResponseStatus_ATTENDEE_RESPONSE_STATUS_TENTATIVE:
				resp = "tentative"
			}
			atts = append(atts, domaincalendar.Attendee{
				Email:          a.GetEmail(),
				DisplayName:    a.GetDisplayName(),
				ResponseStatus: resp,
				Optional:       a.GetIsOptional(),
				Organizer:      a.GetIsOrganizer(),
			})
		}
		_ = ev.SetAttendees(atts)
	}

	if len(p.GetReminders()) > 0 {
		var rems []domaincalendar.Reminder
		for _, r := range p.GetReminders() {
			rems = append(rems, domaincalendar.Reminder{
				Method:  r.GetMethod(),
				Minutes: r.GetMinutes(),
			})
		}
		_ = ev.SetReminders(rems)
	}

	return ev
}

func mapProjectionToProto(occ *calendaraggregator.OccurrenceProjection) *calendarv1.EventOccurrence {
	if occ == nil {
		return nil
	}

	protoOcc := &calendarv1.EventOccurrence{
		EventId:      occ.EventID,
		CalendarId:   occ.CalendarID,
		InstanceId:   occ.InstanceID,
		Title:        occ.Title,
		Description:  occ.Description,
		Location:     occ.Location,
		IsAllDay:     occ.IsAllDay,
		Timezone:     occ.Timezone,
		IsException:  occ.IsException,
		MeetUrl:      occ.MeetURL,
		Color:        occ.Color,
		CalendarName: occ.CalendarName,
		IsVirtual:    occ.IsVirtual,
		SourceType:   occ.SourceType,
	}

	if occ.MasterID != nil {
		protoOcc.MasterId = *occ.MasterID
	}
	if occ.StartTime != nil {
		protoOcc.StartTime = timestamppb.New(*occ.StartTime)
	}
	if occ.EndTime != nil {
		protoOcc.EndTime = timestamppb.New(*occ.EndTime)
	}
	if occ.StartDate != nil {
		protoOcc.StartDate = *occ.StartDate
	}
	if occ.EndDate != nil {
		protoOcc.EndDate = *occ.EndDate
	}

	switch occ.Status {
	case domaincalendar.EventStatusConfirmed:
		protoOcc.Status = calendarv1.EventStatus_EVENT_STATUS_CONFIRMED
	case domaincalendar.EventStatusTentative:
		protoOcc.Status = calendarv1.EventStatus_EVENT_STATUS_TENTATIVE
	case domaincalendar.EventStatusCancelled:
		protoOcc.Status = calendarv1.EventStatus_EVENT_STATUS_CANCELLED
	default:
		protoOcc.Status = calendarv1.EventStatus_EVENT_STATUS_CONFIRMED
	}

	if occ.Organizer != nil {
		protoOcc.Organizer = &calendarv1.Organizer{
			Email:       occ.Organizer.Email,
			DisplayName: occ.Organizer.DisplayName,
			IsSelf:      occ.Organizer.Self,
		}
	}

	for _, a := range occ.Attendees {
		resp := calendarv1.AttendeeResponseStatus_ATTENDEE_RESPONSE_STATUS_NEEDS_ACTION
		switch a.ResponseStatus {
		case "accepted":
			resp = calendarv1.AttendeeResponseStatus_ATTENDEE_RESPONSE_STATUS_ACCEPTED
		case "declined":
			resp = calendarv1.AttendeeResponseStatus_ATTENDEE_RESPONSE_STATUS_DECLINED
		case "tentative":
			resp = calendarv1.AttendeeResponseStatus_ATTENDEE_RESPONSE_STATUS_TENTATIVE
		}
		protoOcc.Attendees = append(protoOcc.Attendees, &calendarv1.Attendee{
			Email:          a.Email,
			DisplayName:    a.DisplayName,
			ResponseStatus: resp,
			IsOptional:     a.Optional,
			IsOrganizer:    a.Organizer,
		})
	}

	for _, r := range occ.Reminders {
		protoOcc.Reminders = append(protoOcc.Reminders, &calendarv1.Reminder{
			Method:  r.Method,
			Minutes: r.Minutes,
		})
	}

	return protoOcc
}
