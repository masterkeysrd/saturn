package google

import (
	"bytes"
	"context"
	"encoding/json/v2"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	domaincalendar "github.com/masterkeysrd/saturn/internal/domain/calendar"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	platformerrors "github.com/masterkeysrd/saturn/internal/platform/errors"
)

// Ensure Provider implements domaincalendar.ExternalCalendarProvider.
var _ domaincalendar.ExternalCalendarProvider = (*Provider)(nil)

// googleCalendarListResponse models the Google calendarList.list response.
type googleCalendarListResponse struct {
	Items         []googleCalendarItem `json:"items"`
	NextPageToken string               `json:"nextPageToken,omitempty"`
}

type googleCalendarItem struct {
	ID              string `json:"id"`
	Summary         string `json:"summary"`
	Description     string `json:"description,omitempty"`
	BackgroundColor string `json:"backgroundColor,omitempty"`
	ColorID         string `json:"colorId,omitempty"`
	TimeZone        string `json:"timeZone,omitempty"`
	AccessRole      string `json:"accessRole,omitempty"`
	Primary         bool   `json:"primary,omitempty"`
	Deleted         bool   `json:"deleted,omitempty"`
}

// ListCalendars fetches all calendars accessible to the connected account.
func (p *Provider) ListCalendars(ctx context.Context, accessToken string) ([]*domaincalendar.DiscoveredCalendar, error) {
	const op platformerrors.Op = "platform/connector/google.ListCalendars"

	var results []*domaincalendar.DiscoveredCalendar
	pageToken := ""

	for {
		endpoint := fmt.Sprintf("%s/users/me/calendarList?maxResults=250", p.cfg.CalendarURL)
		if pageToken != "" {
			endpoint += "&pageToken=" + url.QueryEscape(pageToken)
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return nil, platformerrors.E(op, err)
		}
		req.Header.Set("Authorization", "Bearer "+accessToken)

		resp, err := p.httpClient.Do(req)
		if err != nil {
			return nil, platformerrors.E(op, err)
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, platformerrors.E(op, err)
		}

		if resp.StatusCode == http.StatusUnauthorized {
			return nil, platformerrors.E(op, connector.ErrInvalidGrant)
		}
		if resp.StatusCode == http.StatusTooManyRequests {
			return nil, platformerrors.E(op, connector.ErrRateLimited)
		}
		if resp.StatusCode != http.StatusOK {
			return nil, platformerrors.E(op, fmt.Sprintf("list calendars failed with status %d: %s", resp.StatusCode, string(body)))
		}

		var listResp googleCalendarListResponse
		if err := json.Unmarshal(body, &listResp); err != nil {
			return nil, platformerrors.E(op, fmt.Errorf("decode calendar list: %w", err))
		}

		for _, item := range listResp.Items {
			if item.Deleted {
				continue
			}
			role := parseGoogleAccessRole(item.AccessRole)
			color := item.BackgroundColor
			if color == "" {
				color = "#3b82f6"
			}
			results = append(results, &domaincalendar.DiscoveredCalendar{
				ProviderCalendarID: item.ID,
				Name:               item.Summary,
				Description:        item.Description,
				Color:              color,
				Timezone:           item.TimeZone,
				AccessRole:         role,
				IsPrimary:          item.Primary,
			})
		}

		if listResp.NextPageToken == "" {
			break
		}
		pageToken = listResp.NextPageToken
	}

	return results, nil
}

// googleEventsResponse models the Google events.list response.
type googleEventsResponse struct {
	Items         []googleEventItem `json:"items"`
	NextPageToken string            `json:"nextPageToken,omitempty"`
	NextSyncToken string            `json:"nextSyncToken,omitempty"`
}

type googleEventItem struct {
	ID                 string                    `json:"id"`
	ICalUID            string                    `json:"iCalUID,omitempty"`
	Status             string                    `json:"status,omitempty"`
	Summary            string                    `json:"summary,omitempty"`
	Description        string                    `json:"description,omitempty"`
	Location           string                    `json:"location,omitempty"`
	Start              *googleEventDateTime      `json:"start,omitempty"`
	End                *googleEventDateTime      `json:"end,omitempty"`
	Recurrence         []string                  `json:"recurrence,omitempty"`
	RecurringEventID   string                    `json:"recurringEventId,omitempty"`
	OriginalStartTime  *googleEventDateTime      `json:"originalStartTime,omitempty"`
	Organizer          *googleOrganizer          `json:"organizer,omitempty"`
	Attendees          []googleAttendee          `json:"attendees,omitempty"`
	Reminders          *googleReminders          `json:"reminders,omitempty"`
	ConferenceData     *googleConferenceData     `json:"conferenceData,omitempty"`
	ETag               string                    `json:"etag,omitempty"`
	Updated            string                    `json:"updated,omitempty"`
}

type googleEventDateTime struct {
	Date     string `json:"date,omitempty"`     // YYYY-MM-DD for all-day
	DateTime string `json:"dateTime,omitempty"` // RFC3339 for timed
	TimeZone string `json:"timeZone,omitempty"`
}

type googleOrganizer struct {
	Email       string `json:"email,omitempty"`
	DisplayName string `json:"displayName,omitempty"`
	Self        bool   `json:"self,omitempty"`
}

type googleAttendee struct {
	Email          string `json:"email,omitempty"`
	DisplayName    string `json:"displayName,omitempty"`
	ResponseStatus string `json:"responseStatus,omitempty"`
	Optional       bool   `json:"optional,omitempty"`
	Organizer      bool   `json:"organizer,omitempty"`
}

type googleReminders struct {
	UseDefault bool                     `json:"useDefault"`
	Overrides  []googleReminderOverride `json:"overrides,omitempty"`
}

type googleReminderOverride struct {
	Method  string `json:"method"`
	Minutes int32  `json:"minutes"`
}

type googleConferenceData struct {
	EntryPoints []googleEntryPoint `json:"entryPoints,omitempty"`
}

type googleEntryPoint struct {
	EntryPointType string `json:"entryPointType,omitempty"` // "video"
	URI            string `json:"uri,omitempty"`
}

// SyncEvents retrieves event changes since syncCursor using incremental sync tokens.
func (p *Provider) SyncEvents(ctx context.Context, accessToken, providerCalendarID, syncCursor string) (*domaincalendar.EventSyncResult, error) {
	const op platformerrors.Op = "platform/connector/google.SyncEvents"

	var events []*domaincalendar.DiscoveredEvent
	pageToken := ""

	for {
		endpoint := fmt.Sprintf(
			"%s/calendars/%s/events?singleEvents=false&maxResults=2500",
			p.cfg.CalendarURL,
			url.PathEscape(providerCalendarID),
		)
		if pageToken != "" {
			endpoint += "&pageToken=" + url.QueryEscape(pageToken)
		} else if syncCursor != "" {
			endpoint += "&syncToken=" + url.QueryEscape(syncCursor)
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return nil, platformerrors.E(op, err)
		}
		req.Header.Set("Authorization", "Bearer "+accessToken)

		resp, err := p.httpClient.Do(req)
		if err != nil {
			return nil, platformerrors.E(op, err)
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, platformerrors.E(op, err)
		}

		// Handle 410 Gone: syncToken has expired or invalidated by Google. A full resync is required.
		if resp.StatusCode == http.StatusGone {
			return &domaincalendar.EventSyncResult{
				FullResyncRequired: true,
			}, nil
		}
		if resp.StatusCode == http.StatusUnauthorized {
			return nil, platformerrors.E(op, connector.ErrInvalidGrant)
		}
		if resp.StatusCode == http.StatusTooManyRequests {
			return nil, platformerrors.E(op, connector.ErrRateLimited)
		}
		if resp.StatusCode != http.StatusOK {
			return nil, platformerrors.E(op, fmt.Sprintf("events sync failed with status %d: %s", resp.StatusCode, string(body)))
		}

		var eventResp googleEventsResponse
		if err := json.Unmarshal(body, &eventResp); err != nil {
			return nil, platformerrors.E(op, fmt.Errorf("decode events response: %w", err))
		}

		for _, item := range eventResp.Items {
			converted := mapGoogleEventToDiscovered(item)
			events = append(events, converted)
		}

		if eventResp.NextPageToken != "" {
			pageToken = eventResp.NextPageToken
			continue
		}

		return &domaincalendar.EventSyncResult{
			Events:         events,
			NextSyncCursor: eventResp.NextSyncToken,
		}, nil
	}
}

// CreateEvent creates an event directly on Google Calendar.
func (p *Provider) CreateEvent(ctx context.Context, accessToken, providerCalendarID string, event *domaincalendar.Event) (*domaincalendar.EventWriteResult, error) {
	const op platformerrors.Op = "platform/connector/google.CreateEvent"

	payload, err := mapEventToGooglePayload(event)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}

	endpoint := fmt.Sprintf(
		"%s/calendars/%s/events?conferenceDataVersion=1",
		p.cfg.CalendarURL,
		url.PathEscape(providerCalendarID),
	)

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

	respBody, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		return nil, platformerrors.E(op, err)
	}

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, platformerrors.E(op, connector.ErrInvalidGrant)
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, platformerrors.E(op, connector.ErrRateLimited)
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return nil, platformerrors.E(op, fmt.Sprintf("create event failed with status %d: %s", resp.StatusCode, string(respBody)))
	}

	var created googleEventItem
	if err := json.Unmarshal(respBody, &created); err != nil {
		return nil, platformerrors.E(op, fmt.Errorf("decode created event: %w", err))
	}

	confURL := extractConferenceURL(created.ConferenceData)

	return &domaincalendar.EventWriteResult{
		ProviderEventID: created.ID,
		ETag:            created.ETag,
		ConferenceURL:   confURL,
	}, nil
}

// UpdateEvent updates an event directly on Google Calendar.
func (p *Provider) UpdateEvent(ctx context.Context, accessToken, providerCalendarID string, event *domaincalendar.Event) (*domaincalendar.EventWriteResult, error) {
	const op platformerrors.Op = "platform/connector/google.UpdateEvent"

	if event.ProviderEventID == nil || *event.ProviderEventID == "" {
		return nil, platformerrors.E(op, errors.New("cannot update event without provider_event_id"))
	}

	payload, err := mapEventToGooglePayload(event)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, platformerrors.E(op, err)
	}

	endpoint := fmt.Sprintf(
		"%s/calendars/%s/events/%s?conferenceDataVersion=1",
		p.cfg.CalendarURL,
		url.PathEscape(providerCalendarID),
		url.PathEscape(*event.ProviderEventID),
	)

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

	respBody, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		return nil, platformerrors.E(op, err)
	}

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, platformerrors.E(op, connector.ErrInvalidGrant)
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, platformerrors.E(op, connector.ErrRateLimited)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, platformerrors.E(op, fmt.Sprintf("update event failed with status %d: %s", resp.StatusCode, string(respBody)))
	}

	var updated googleEventItem
	if err := json.Unmarshal(respBody, &updated); err != nil {
		return nil, platformerrors.E(op, fmt.Errorf("decode updated event: %w", err))
	}

	confURL := extractConferenceURL(updated.ConferenceData)

	return &domaincalendar.EventWriteResult{
		ProviderEventID: updated.ID,
		ETag:            updated.ETag,
		ConferenceURL:   confURL,
	}, nil
}

// DeleteEvent removes an event directly from Google Calendar.
func (p *Provider) DeleteEvent(ctx context.Context, accessToken, providerCalendarID, providerEventID string) error {
	const op platformerrors.Op = "platform/connector/google.DeleteEvent"

	endpoint := fmt.Sprintf(
		"%s/calendars/%s/events/%s",
		p.cfg.CalendarURL,
		url.PathEscape(providerCalendarID),
		url.PathEscape(providerEventID),
	)

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
	// 200, 204, or 404 (already deleted) are treated as successful deletion
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusNotFound {
		body, _ := io.ReadAll(resp.Body)
		return platformerrors.E(op, fmt.Sprintf("delete event failed with status %d: %s", resp.StatusCode, string(body)))
	}

	return nil
}

// RespondToEvent updates the caller's RSVP response status on Google Calendar.
func (p *Provider) RespondToEvent(ctx context.Context, accessToken, providerCalendarID, providerEventID, attendeeEmail, responseStatus string) error {
	const op platformerrors.Op = "platform/connector/google.RespondToEvent"

	// First fetch the event to locate and update the attendee entry
	getEndpoint := fmt.Sprintf(
		"%s/calendars/%s/events/%s",
		p.cfg.CalendarURL,
		url.PathEscape(providerCalendarID),
		url.PathEscape(providerEventID),
	)

	getReq, err := http.NewRequestWithContext(ctx, http.MethodGet, getEndpoint, nil)
	if err != nil {
		return platformerrors.E(op, err)
	}
	getReq.Header.Set("Authorization", "Bearer "+accessToken)

	getResp, err := p.httpClient.Do(getReq)
	if err != nil {
		return platformerrors.E(op, err)
	}
	getBody, err := io.ReadAll(getResp.Body)
	getResp.Body.Close()
	if err != nil {
		return platformerrors.E(op, err)
	}

	if getResp.StatusCode != http.StatusOK {
		return platformerrors.E(op, fmt.Sprintf("fetch event for rsvp failed with status %d: %s", getResp.StatusCode, string(getBody)))
	}

	var ev googleEventItem
	if err := json.Unmarshal(getBody, &ev); err != nil {
		return platformerrors.E(op, fmt.Errorf("decode event for rsvp: %w", err))
	}

	matched := false
	for i := range ev.Attendees {
		if strings.EqualFold(ev.Attendees[i].Email, attendeeEmail) {
			ev.Attendees[i].ResponseStatus = responseStatus
			matched = true
			break
		}
	}
	if !matched {
		ev.Attendees = append(ev.Attendees, googleAttendee{
			Email:          attendeeEmail,
			ResponseStatus: responseStatus,
		})
	}

	patchPayload := map[string]any{
		"attendees": ev.Attendees,
	}
	patchBytes, err := json.Marshal(patchPayload)
	if err != nil {
		return platformerrors.E(op, err)
	}

	patchReq, err := http.NewRequestWithContext(ctx, http.MethodPatch, getEndpoint, bytes.NewReader(patchBytes))
	if err != nil {
		return platformerrors.E(op, err)
	}
	patchReq.Header.Set("Authorization", "Bearer "+accessToken)
	patchReq.Header.Set("Content-Type", "application/json")

	patchResp, err := p.httpClient.Do(patchReq)
	if err != nil {
		return platformerrors.E(op, err)
	}
	defer patchResp.Body.Close()

	if patchResp.StatusCode != http.StatusOK {
		pBody, _ := io.ReadAll(patchResp.Body)
		return platformerrors.E(op, fmt.Sprintf("patch rsvp failed with status %d: %s", patchResp.StatusCode, string(pBody)))
	}

	return nil
}

// Helpers

func parseGoogleAccessRole(role string) domaincalendar.AccessRole {
	switch strings.ToLower(role) {
	case "owner":
		return domaincalendar.AccessRoleOwner
	case "writer":
		return domaincalendar.AccessRoleWriter
	case "reader":
		return domaincalendar.AccessRoleReader
	case "freebusyreader":
		return domaincalendar.AccessRoleFreeBusy
	default:
		return domaincalendar.AccessRoleReader
	}
}

func extractConferenceURL(conf *googleConferenceData) string {
	if conf == nil {
		return ""
	}
	for _, ep := range conf.EntryPoints {
		if ep.EntryPointType == "video" && ep.URI != "" {
			return ep.URI
		}
	}
	if len(conf.EntryPoints) > 0 {
		return conf.EntryPoints[0].URI
	}
	return ""
}

func mapGoogleEventToDiscovered(item googleEventItem) *domaincalendar.DiscoveredEvent {
	status := domaincalendar.EventStatusConfirmed
	switch strings.ToLower(item.Status) {
	case "cancelled":
		status = domaincalendar.EventStatusCancelled
	case "tentative":
		status = domaincalendar.EventStatusTentative
	}

	discovered := &domaincalendar.DiscoveredEvent{
		ProviderEventID: item.ID,
		ICalUID:         item.ICalUID,
		Status:          status,
		Title:           item.Summary,
		Description:     item.Description,
		Location:        item.Location,
		ETag:            item.ETag,
	}

	if item.ConferenceData != nil {
		discovered.ConferenceURL = extractConferenceURL(item.ConferenceData)
		if discovered.ConferenceURL != "" {
			discovered.ConferenceProvider = "google_meet"
		}
	}

	if item.Start != nil {
		if item.Start.Date != "" {
			discovered.IsAllDay = true
			discovered.StartDate = &item.Start.Date
		} else if item.Start.DateTime != "" {
			if t, err := time.Parse(time.RFC3339, item.Start.DateTime); err == nil {
				utc := t.UTC()
				discovered.StartTime = &utc
			}
			discovered.Timezone = item.Start.TimeZone
		}
	}

	if item.End != nil {
		if item.End.Date != "" {
			discovered.EndDate = &item.End.Date
		} else if item.End.DateTime != "" {
			if t, err := time.Parse(time.RFC3339, item.End.DateTime); err == nil {
				utc := t.UTC()
				discovered.EndTime = &utc
			}
		}
	}

	// Recurrence rules
	var exdates []string
	for _, r := range item.Recurrence {
		if strings.HasPrefix(r, "RRULE:") {
			rule := r
			discovered.RRULE = &rule
		} else if strings.HasPrefix(r, "EXDATE") {
			parts := strings.Split(r, ":")
			if len(parts) == 2 {
				dates := strings.Split(parts[1], ",")
				exdates = append(exdates, dates...)
			}
		}
	}
	discovered.EXDates = exdates

	// Recurring exception link
	if item.RecurringEventID != "" {
		mID := item.RecurringEventID
		discovered.RecurringMasterID = &mID
		if item.OriginalStartTime != nil {
			if item.OriginalStartTime.Date != "" {
				discovered.OriginalStartDate = &item.OriginalStartTime.Date
			} else if item.OriginalStartTime.DateTime != "" {
				if t, err := time.Parse(time.RFC3339, item.OriginalStartTime.DateTime); err == nil {
					utc := t.UTC()
					discovered.OriginalStartTime = &utc
				}
			}
		}
	}

	if item.Organizer != nil {
		discovered.Organizer = &domaincalendar.Organizer{
			Email:       item.Organizer.Email,
			DisplayName: item.Organizer.DisplayName,
			Self:        item.Organizer.Self,
		}
	}

	for _, att := range item.Attendees {
		respStatus := "needs_action"
		switch strings.ToLower(att.ResponseStatus) {
		case "accepted":
			respStatus = "accepted"
		case "declined":
			respStatus = "declined"
		case "tentative":
			respStatus = "tentative"
		}
		discovered.Attendees = append(discovered.Attendees, domaincalendar.Attendee{
			Email:          att.Email,
			DisplayName:    att.DisplayName,
			ResponseStatus: respStatus,
			Optional:       att.Optional,
			Organizer:      att.Organizer,
		})
	}

	if item.Reminders != nil && len(item.Reminders.Overrides) > 0 {
		for _, rem := range item.Reminders.Overrides {
			discovered.Reminders = append(discovered.Reminders, domaincalendar.Reminder{
				Method:  rem.Method,
				Minutes: rem.Minutes,
			})
		}
	}

	if item.Updated != "" {
		if t, err := time.Parse(time.RFC3339, item.Updated); err == nil {
			discovered.UpdatedAt = t.UTC()
		}
	}

	return discovered
}

func mapEventToGooglePayload(event *domaincalendar.Event) (map[string]any, error) {
	payload := map[string]any{
		"summary": event.Title,
	}

	if event.Description != nil && *event.Description != "" {
		payload["description"] = *event.Description
	}
	if event.Location != nil && *event.Location != "" {
		payload["location"] = *event.Location
	}

	if event.IsAllDay {
		if event.StartDate == nil || event.EndDate == nil {
			return nil, errors.New("all-day event requires start_date and end_date")
		}
		payload["start"] = map[string]string{
			"date": *event.StartDate,
		}
		payload["end"] = map[string]string{
			"date": *event.EndDate,
		}
	} else {
		if event.StartTime == nil || event.EndTime == nil {
			return nil, errors.New("timed event requires start_time and end_time")
		}
		tz := "UTC"
		if event.Timezone != nil && *event.Timezone != "" {
			tz = *event.Timezone
		}
		payload["start"] = map[string]string{
			"dateTime": event.StartTime.UTC().Format(time.RFC3339),
			"timeZone": tz,
		}
		payload["end"] = map[string]string{
			"dateTime": event.EndTime.UTC().Format(time.RFC3339),
			"timeZone": tz,
		}
	}

	if event.RRULE != nil && *event.RRULE != "" {
		payload["recurrence"] = []string{*event.RRULE}
	}

	if attendees, err := event.Attendees(); err == nil && len(attendees) > 0 {
		var gAttendees []map[string]any
		for _, a := range attendees {
			attMap := map[string]any{
				"email": a.Email,
			}
			if a.DisplayName != "" {
				attMap["displayName"] = a.DisplayName
			}
			if a.ResponseStatus != "" {
				attMap["responseStatus"] = a.ResponseStatus
			}
			if a.Optional {
				attMap["optional"] = true
			}
			gAttendees = append(gAttendees, attMap)
		}
		payload["attendees"] = gAttendees
	}

	if reminders, err := event.Reminders(); err == nil && len(reminders) > 0 {
		var gReminders []map[string]any
		for _, r := range reminders {
			gReminders = append(gReminders, map[string]any{
				"method":  r.Method,
				"minutes": r.Minutes,
			})
		}
		payload["reminders"] = map[string]any{
			"useDefault": false,
			"overrides":  gReminders,
		}
	}

	// Request conference generation if requested or existing
	if event.ConferenceURL != nil && strings.Contains(*event.ConferenceURL, "meet.google.com") {
		// Event already has a meet URL
	} else {
		payload["conferenceData"] = map[string]any{
			"createRequest": map[string]any{
				"requestId": "saturn_" + event.ID,
				"conferenceSolutionKey": map[string]string{
					"type": "hangoutsMeet",
				},
			},
		}
	}

	return payload, nil
}
