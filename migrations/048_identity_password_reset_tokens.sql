-- +goose Up
-- +goose StatementBegin
CREATE TABLE identity.password_reset_tokens (
    id          TEXT PRIMARY KEY COLLATE "C", -- rst_<ksuid>
    user_id     TEXT NOT NULL REFERENCES identity.user(id) ON DELETE CASCADE,
    token_hash  BYTEA NOT NULL UNIQUE,         -- SHA-256(raw_token)
    expires_at  TIMESTAMPTZ NOT NULL,          -- Default: NOW() + INTERVAL '15 minutes'
    used_at     TIMESTAMPTZ,                   -- Set on successful password reset
    created_by  TEXT NOT NULL REFERENCES identity.user(id), -- Admin who generated the link
    create_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup for unconsumed tokens
CREATE INDEX idx_reset_token_lookup ON identity.password_reset_tokens(token_hash)
WHERE used_at IS NULL;

-- Index for listing reset history by user
CREATE INDEX idx_reset_token_user_id ON identity.password_reset_tokens(user_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS identity.password_reset_tokens;
-- +goose StatementEnd
