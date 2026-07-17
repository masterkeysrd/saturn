-- +goose Up
-- +goose StatementBegin
ALTER TABLE identity.user
ADD COLUMN auth_version BIGINT NOT NULL DEFAULT 1;

CREATE TABLE identity.sessions (
    id                  TEXT PRIMARY KEY COLLATE "C",
    user_id             TEXT NOT NULL REFERENCES identity.user(id) ON DELETE CASCADE,
    refresh_token_hash  BYTEA NOT NULL UNIQUE,
    token_family_id     TEXT NOT NULL COLLATE "C",
    parent_session_id   TEXT REFERENCES identity.sessions(id) ON DELETE SET NULL,
    expires_at          TIMESTAMPTZ NOT NULL,
    absolute_expires_at TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ,
    replaced_at         TIMESTAMPTZ,
    create_time         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at        TIMESTAMPTZ,
    user_agent          TEXT,
    ip_address          INET,
    CHECK (expires_at <= absolute_expires_at)
);

CREATE INDEX idx_sessions_user_id ON identity.sessions (user_id);
CREATE INDEX idx_sessions_family_active ON identity.sessions (token_family_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_expiry ON identity.sessions (expires_at);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS identity.sessions;
ALTER TABLE identity.user DROP COLUMN IF EXISTS auth_version;
-- +goose StatementEnd
