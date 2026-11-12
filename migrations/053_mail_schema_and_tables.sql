-- +goose Up
-- +goose StatementBegin
CREATE SCHEMA IF NOT EXISTS mail;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE mail.sync_states (
    connected_account_id TEXT COLLATE "C" PRIMARY KEY REFERENCES platform.connected_accounts(id) ON DELETE CASCADE,
    space_id             TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    sync_cursor          TEXT,
    window_days          INTEGER NOT NULL DEFAULT 90,
    oldest_synced_time   TIMESTAMP WITH TIME ZONE,
    last_synced_at       TIMESTAMP WITH TIME ZONE,
    watch_expiration     TIMESTAMP WITH TIME ZONE
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_sync_states_space ON mail.sync_states (space_id);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE mail.mailboxes (
    id                   TEXT COLLATE "C" PRIMARY KEY,
    space_id             TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    connected_account_id TEXT COLLATE "C" NOT NULL REFERENCES platform.connected_accounts(id) ON DELETE CASCADE,
    provider_mailbox_id  TEXT,
    name                 TEXT NOT NULL,
    system_role          VARCHAR(50) NOT NULL DEFAULT 'custom',
    color                VARCHAR(50),
    unread_count         INTEGER NOT NULL DEFAULT 0,
    total_count          INTEGER NOT NULL DEFAULT 0,
    create_time          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_mailboxes_space ON mail.mailboxes (space_id);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_mailboxes_connected_account ON mail.mailboxes (connected_account_id);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE UNIQUE INDEX uq_mailboxes_provider ON mail.mailboxes (connected_account_id, provider_mailbox_id) WHERE provider_mailbox_id IS NOT NULL;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_mailboxes_system_role ON mail.mailboxes (connected_account_id, system_role);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE mail.threads (
    id                   TEXT COLLATE "C" PRIMARY KEY,
    space_id             TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    connected_account_id TEXT COLLATE "C" NOT NULL REFERENCES platform.connected_accounts(id) ON DELETE CASCADE,
    provider_thread_id   TEXT,
    subject              TEXT NOT NULL DEFAULT '',
    snippet              TEXT NOT NULL DEFAULT '',
    participants_json    JSONB NOT NULL DEFAULT '[]',
    message_count        INTEGER NOT NULL DEFAULT 0,
    has_attachments      BOOLEAN NOT NULL DEFAULT FALSE,
    is_unread            BOOLEAN NOT NULL DEFAULT FALSE,
    is_starred           BOOLEAN NOT NULL DEFAULT FALSE,
    in_inbox             BOOLEAN NOT NULL DEFAULT FALSE,
    in_sent              BOOLEAN NOT NULL DEFAULT FALSE,
    in_drafts            BOOLEAN NOT NULL DEFAULT FALSE,
    in_trash             BOOLEAN NOT NULL DEFAULT FALSE,
    in_spam              BOOLEAN NOT NULL DEFAULT FALSE,
    mailbox_ids          TEXT[] NOT NULL DEFAULT '{}',
    last_message_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    search_tsv           TSVECTOR,
    create_time          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_threads_space_last_message ON mail.threads (space_id, last_message_at DESC);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_threads_account_last_message ON mail.threads (connected_account_id, last_message_at DESC);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_threads_space_inbox ON mail.threads (space_id, in_inbox, last_message_at DESC);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE UNIQUE INDEX uq_threads_provider ON mail.threads (connected_account_id, provider_thread_id) WHERE provider_thread_id IS NOT NULL;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_threads_mailbox_ids ON mail.threads USING gin(mailbox_ids);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_threads_search_tsv ON mail.threads USING gin(search_tsv);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE mail.messages (
    id                    TEXT COLLATE "C" PRIMARY KEY,
    space_id              TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    connected_account_id  TEXT COLLATE "C" NOT NULL REFERENCES platform.connected_accounts(id) ON DELETE CASCADE,
    thread_id             TEXT COLLATE "C" NOT NULL REFERENCES mail.threads(id) ON DELETE CASCADE,
    provider_message_id   TEXT,
    rfc_message_id        TEXT,
    in_reply_to           TEXT,
    references_hdr        TEXT,
    subject               TEXT NOT NULL DEFAULT '',
    snippet               TEXT NOT NULL DEFAULT '',
    from_json             JSONB NOT NULL DEFAULT '{}',
    to_json               JSONB NOT NULL DEFAULT '[]',
    cc_json               JSONB NOT NULL DEFAULT '[]',
    bcc_json              JSONB NOT NULL DEFAULT '[]',
    reply_to_json         JSONB NOT NULL DEFAULT '[]',
    sent_at               TIMESTAMP WITH TIME ZONE,
    received_at           TIMESTAMP WITH TIME ZONE NOT NULL,
    is_unread             BOOLEAN NOT NULL DEFAULT FALSE,
    is_starred            BOOLEAN NOT NULL DEFAULT FALSE,
    is_draft              BOOLEAN NOT NULL DEFAULT FALSE,
    attachments_meta_json JSONB NOT NULL DEFAULT '[]',
    has_remote_images     BOOLEAN NOT NULL DEFAULT FALSE,
    body_cached           BOOLEAN NOT NULL DEFAULT FALSE,
    create_time           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_messages_space_received ON mail.messages (space_id, received_at DESC);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_messages_thread_received ON mail.messages (thread_id, received_at ASC);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_messages_account ON mail.messages (connected_account_id);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE UNIQUE INDEX uq_messages_provider ON mail.messages (connected_account_id, provider_message_id) WHERE provider_message_id IS NOT NULL;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_messages_rfc_id ON mail.messages (rfc_message_id) WHERE rfc_message_id IS NOT NULL;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE mail.message_bodies (
    message_id     TEXT COLLATE "C" PRIMARY KEY REFERENCES mail.messages(id) ON DELETE CASCADE,
    space_id       TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    sanitized_html TEXT NOT NULL DEFAULT '',
    plain_text     TEXT NOT NULL DEFAULT '',
    fetched_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMP WITH TIME ZONE NOT NULL
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_message_bodies_expires ON mail.message_bodies (expires_at);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_message_bodies_space ON mail.message_bodies (space_id);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE mail.drafts (
    id                    TEXT COLLATE "C" PRIMARY KEY,
    space_id              TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    connected_account_id  TEXT COLLATE "C" NOT NULL REFERENCES platform.connected_accounts(id) ON DELETE CASCADE,
    provider_draft_id     TEXT,
    provider_message_id   TEXT,
    thread_id             TEXT COLLATE "C" REFERENCES mail.threads(id) ON DELETE SET NULL,
    reply_to_message_id   TEXT COLLATE "C" REFERENCES mail.messages(id) ON DELETE SET NULL,
    mode                  VARCHAR(50) NOT NULL DEFAULT 'new',
    from_address          TEXT NOT NULL DEFAULT '',
    to_json               JSONB NOT NULL DEFAULT '[]',
    cc_json               JSONB NOT NULL DEFAULT '[]',
    bcc_json              JSONB NOT NULL DEFAULT '[]',
    subject               TEXT NOT NULL DEFAULT '',
    body_html             TEXT NOT NULL DEFAULT '',
    body_text             TEXT NOT NULL DEFAULT '',
    attachments_meta_json JSONB NOT NULL DEFAULT '[]',
    version               BIGINT NOT NULL DEFAULT 1,
    create_time           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_drafts_space_updated ON mail.drafts (space_id, update_time DESC);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_drafts_account_updated ON mail.drafts (connected_account_id, update_time DESC);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE UNIQUE INDEX uq_drafts_provider ON mail.drafts (connected_account_id, provider_draft_id) WHERE provider_draft_id IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS mail.drafts;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS mail.message_bodies;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS mail.messages;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS mail.threads;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS mail.mailboxes;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS mail.sync_states;
-- +goose StatementEnd

-- +goose StatementBegin
DROP SCHEMA IF EXISTS mail CASCADE;
-- +goose StatementEnd
