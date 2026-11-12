package calendar

import (
	"context"
	"fmt"
	"slices"
	"time"

	domaincalendar "github.com/masterkeysrd/saturn/internal/domain/calendar"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func (c *coordinator) SyncConnectedAccountCalendars(ctx context.Context, req *SyncConnectedAccountCalendarsRequest) error {
	const op errors.Op = "application/calendar.SyncConnectedAccountCalendars"

	if req == nil || req.ConnectedAccountID == "" {
		return errors.E(op, errors.Invalid, "connected_account_id is required")
	}

	spaceID := req.SpaceID
	if spaceID == "" {
		if sID, ok := auth.SpaceIDFromContext(ctx); ok {
			spaceID = sID
		}
	}

	// 1. Verify connected account exists and has calendar capability enabled
	acc, err := c.accountStore.GetAccount(ctx, spaceID, req.ConnectedAccountID)
	if err != nil {
		return errors.E(op, err)
	}
	if !slices.Contains(acc.EnabledCapabilities, string(connector.CapabilityCalendar)) {
		return nil // calendar sync disabled for this account
	}

	// 2. Fetch fresh access token
	token, err := c.tokenManager.TokenSource(ctx, spaceID, req.ConnectedAccountID)
	if err != nil {
		return errors.E(op, err)
	}

	providerName := acc.Provider
	prov, ok := c.externalProviders[providerName]
	if !ok {
		return errors.E(op, errors.NotExist, "unsupported calendar provider: %s", providerName)
	}

	// 3. Sync discovered calendars from external provider
	discoveredCals, err := prov.ListCalendars(ctx, token)
	if err != nil {
		return errors.E(op, fmt.Errorf("list external calendars: %w", err))
	}

	for _, disc := range discoveredCals {
		existing, err := c.calendarStore.GetByConnectedAccountAndProviderID(ctx, spaceID, req.ConnectedAccountID, disc.ProviderCalendarID)
		if err == nil && existing != nil {
			// Update calendar metadata, strictly preserving local IsEnabled toggle!
			existing.Name = disc.Name
			if disc.Description != "" {
				existing.Description = &disc.Description
			}
			if disc.Color != "" {
				existing.Color = &disc.Color
			}
			existing.Timezone = disc.Timezone
			existing.AccessRole = disc.AccessRole
			existing.IsPrimary = disc.IsPrimary
			_ = c.calendarStore.Update(ctx, existing)
		} else {
			// Create newly discovered calendar
			color := disc.Color
			desc := disc.Description
			accountID := req.ConnectedAccountID
			providerCalID := disc.ProviderCalendarID
			newCal := &domaincalendar.Calendar{
				SpaceID:            spaceID,
				ConnectedAccountID: &accountID,
				ProviderCalendarID: &providerCalID,
				Name:               disc.Name,
				Description:        &desc,
				Color:              &color,
				Timezone:           disc.Timezone,
				Source:             domaincalendar.SourceExternal,
				AccessRole:         disc.AccessRole,
				IsPrimary:          disc.IsPrimary,
				IsEnabled:          true, // default to enabled on discovery
			}
			_ = c.domainService.CreateCalendar(ctx, newCal)
		}
	}

	// 4. For all enabled calendars belonging to this connected account, sync events
	cals, err := c.calendarStore.ListBySpace(ctx, spaceID, &domaincalendar.ListCalendarsFilter{
		ConnectedAccountID: &req.ConnectedAccountID,
		EnabledOnly:        true,
	})
	if err != nil {
		return errors.E(op, err)
	}

	for _, cal := range cals {
		if cal.ProviderCalendarID == nil {
			continue
		}

		cursor := ""
		if cal.SyncCursor != nil {
			cursor = *cal.SyncCursor
		}

		syncRes, err := prov.SyncEvents(ctx, token, *cal.ProviderCalendarID, cursor)
		if err != nil {
			continue
		}

		// Handle 410 Gone full resync
		if syncRes.FullResyncRequired {
			_ = c.eventStore.DeleteByCalendarID(ctx, spaceID, cal.ID)
			syncRes, err = prov.SyncEvents(ctx, token, *cal.ProviderCalendarID, "")
			if err != nil {
				continue
			}
		}

		for _, discEv := range syncRes.Events {
			if discEv.Status == domaincalendar.EventStatusCancelled {
				existing, err := c.eventStore.GetByProviderEventID(ctx, cal.ID, discEv.ProviderEventID)
				if err == nil && existing != nil {
					_ = c.eventStore.Delete(ctx, spaceID, existing.ID)
				}
				continue
			}

			existing, err := c.eventStore.GetByProviderEventID(ctx, cal.ID, discEv.ProviderEventID)
			if err == nil && existing != nil {
				// Update existing
				existing.Title = discEv.Title
				if discEv.Description != "" {
					existing.Description = &discEv.Description
				}
				if discEv.Location != "" {
					existing.Location = &discEv.Location
				}
				if discEv.ConferenceURL != "" {
					existing.ConferenceURL = &discEv.ConferenceURL
					existing.ConferenceProvider = &discEv.ConferenceProvider
				}
				existing.IsAllDay = discEv.IsAllDay
				existing.StartTime = discEv.StartTime
				existing.EndTime = discEv.EndTime
				if discEv.Timezone != "" {
					existing.Timezone = &discEv.Timezone
				}
				existing.StartDate = discEv.StartDate
				existing.EndDate = discEv.EndDate
				existing.RRULE = discEv.RRULE
				existing.EXDates = discEv.EXDates
				existing.Status = discEv.Status
				existing.ETag = &discEv.ETag
				_ = existing.SetAttendees(discEv.Attendees)
				_ = existing.SetReminders(discEv.Reminders)
				_ = existing.SetOrganizer(discEv.Organizer)
				_ = c.eventStore.Update(ctx, existing)
			} else {
				// Insert new
				providerEvID := discEv.ProviderEventID
				etag := discEv.ETag
				desc := discEv.Description
				loc := discEv.Location
				tz := discEv.Timezone
				var confURL, confProv *string
				if discEv.ConferenceURL != "" {
					confURL = &discEv.ConferenceURL
					confProv = &discEv.ConferenceProvider
				}

				newEv := &domaincalendar.Event{
					SpaceID:            spaceID,
					CalendarID:         cal.ID,
					ProviderEventID:    &providerEvID,
					ETag:               &etag,
					Title:              discEv.Title,
					Description:        &desc,
					Location:           &loc,
					ConferenceURL:      confURL,
					ConferenceProvider: confProv,
					IsAllDay:           discEv.IsAllDay,
					StartTime:          discEv.StartTime,
					EndTime:            discEv.EndTime,
					StartDate:          discEv.StartDate,
					EndDate:            discEv.EndDate,
					RRULE:              discEv.RRULE,
					EXDates:            discEv.EXDates,
					RecurringMasterID:  discEv.RecurringMasterID,
					OriginalStartTime:  discEv.OriginalStartTime,
					OriginalStartDate:  discEv.OriginalStartDate,
					Status:             discEv.Status,
				}
				if tz != "" {
					newEv.Timezone = &tz
				}
				_ = newEv.SetAttendees(discEv.Attendees)
				_ = newEv.SetReminders(discEv.Reminders)
				_ = newEv.SetOrganizer(discEv.Organizer)
				_ = c.domainService.CreateEvent(ctx, newEv)
			}
		}

		if syncRes.NextSyncCursor != "" {
			cal.SyncCursor = &syncRes.NextSyncCursor
		}
		now := time.Now().UTC()
		cal.LastSyncedAt = &now
		_ = c.calendarStore.Update(ctx, cal)
	}

	return nil
}
