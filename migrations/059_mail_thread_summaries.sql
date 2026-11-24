-- +goose Up
-- +goose StatementBegin
CREATE TABLE mail.thread_summaries (
    thread_id        TEXT COLLATE "C" NOT NULL REFERENCES mail.threads(id) ON DELETE CASCADE,
    space_id         TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    language         VARCHAR(16) NOT NULL DEFAULT 'en',
    tldr             TEXT NOT NULL DEFAULT '',
    key_points       JSONB NOT NULL DEFAULT '[]',
    action_items     JSONB NOT NULL DEFAULT '[]',
    last_message_id  TEXT COLLATE "C" NOT NULL DEFAULT '',
    last_message_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    message_count    INTEGER NOT NULL DEFAULT 0,
    flow_run_id      TEXT COLLATE "C",
    create_time      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (thread_id, language)
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_thread_summaries_space ON mail.thread_summaries (space_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS mail.idx_thread_summaries_space;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS mail.thread_summaries;
-- +goose StatementEnd
