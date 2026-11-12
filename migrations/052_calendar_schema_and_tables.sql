-- +goose Up
-- +goose StatementBegin
CREATE SCHEMA IF NOT EXISTS calendar;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE calendar.calendars (
    id                   TEXT COLLATE "C" PRIMARY KEY,
    space_id             TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    connected_account_id TEXT COLLATE "C" REFERENCES platform.connected_accounts(id) ON DELETE CASCADE,
    source               VARCHAR(50) NOT NULL DEFAULT 'native',
    provider_calendar_id TEXT,
    name                 TEXT NOT NULL,
    description          TEXT,
    color                VARCHAR(50),
    timezone             VARCHAR(100) NOT NULL DEFAULT 'UTC',
    access_role          VARCHAR(50) NOT NULL DEFAULT 'owner',
    is_primary           BOOLEAN NOT NULL DEFAULT FALSE,
    is_enabled           BOOLEAN NOT NULL DEFAULT TRUE,
    is_default_native    BOOLEAN NOT NULL DEFAULT FALSE,
    sync_cursor          TEXT,
    last_synced_at       TIMESTAMP WITH TIME ZONE,
    etag                 TEXT,
    version              BIGINT NOT NULL DEFAULT 1,
    create_time          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_calendars_space ON calendar.calendars (space_id);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_calendars_connected_account ON calendar.calendars (connected_account_id) WHERE connected_account_id IS NOT NULL;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE UNIQUE INDEX uq_calendar_external ON calendar.calendars (space_id, connected_account_id, provider_calendar_id) WHERE connected_account_id IS NOT NULL;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE UNIQUE INDEX uq_calendar_default_native ON calendar.calendars (space_id) WHERE is_default_native;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE calendar.events (
    id                     TEXT COLLATE "C" PRIMARY KEY,
    space_id               TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    calendar_id            TEXT COLLATE "C" NOT NULL REFERENCES calendar.calendars(id) ON DELETE CASCADE,
    provider_event_id      TEXT,
    ical_uid               TEXT,
    status                 VARCHAR(50) NOT NULL DEFAULT 'confirmed',
    visibility             VARCHAR(50) NOT NULL DEFAULT 'default',
    transparency           VARCHAR(50) NOT NULL DEFAULT 'opaque',
    title                  TEXT NOT NULL DEFAULT '',
    description            TEXT,
    location               TEXT,
    conference_url         TEXT,
    conference_provider    VARCHAR(50),
    is_all_day             BOOLEAN NOT NULL DEFAULT FALSE,
    start_time             TIMESTAMP WITH TIME ZONE,
    end_time               TIMESTAMP WITH TIME ZONE,
    timezone               VARCHAR(100),
    start_date             DATE,
    end_date               DATE,
    rrule                  TEXT,
    exdates                TEXT[] NOT NULL DEFAULT '{}',
    exdates_all_day        TEXT[] NOT NULL DEFAULT '{}',
    recurring_master_id    TEXT COLLATE "C" REFERENCES calendar.events(id) ON DELETE CASCADE,
    original_start_time    TIMESTAMP WITH TIME ZONE,
    original_start_date    DATE,
    organizer_json         JSONB,
    attendees_json         JSONB,
    reminders_json         JSONB,
    source_mail_message_id TEXT,
    etag                   TEXT,
    version                BIGINT NOT NULL DEFAULT 1,
    create_time            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_events_time_or_date CHECK (
        (is_all_day = true AND start_date IS NOT NULL AND end_date IS NOT NULL AND start_time IS NULL AND end_time IS NULL AND end_date > start_date) OR
        (is_all_day = false AND start_time IS NOT NULL AND end_time IS NOT NULL AND start_date IS NULL AND end_date IS NULL AND timezone IS NOT NULL AND end_time > start_time)
    )
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_events_space_calendar ON calendar.events (space_id, calendar_id);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE UNIQUE INDEX uq_events_calendar_provider_event ON calendar.events (calendar_id, provider_event_id) WHERE provider_event_id IS NOT NULL;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_events_timed_range ON calendar.events (calendar_id, start_time, end_time) WHERE NOT is_all_day;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_events_allday_range ON calendar.events (calendar_id, start_date, end_date) WHERE is_all_day;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_events_recurring_master ON calendar.events (recurring_master_id) WHERE recurring_master_id IS NOT NULL;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_events_rrule ON calendar.events (calendar_id) WHERE rrule IS NOT NULL;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_events_ical_uid ON calendar.events (calendar_id, ical_uid) WHERE ical_uid IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS calendar.events;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS calendar.calendars;
-- +goose StatementEnd

-- +goose StatementBegin
DROP SCHEMA IF EXISTS calendar CASCADE;
-- +goose StatementEnd
