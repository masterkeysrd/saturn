-- +goose Up
-- +goose StatementBegin
CREATE TABLE identity.devices (
    id              TEXT PRIMARY KEY COLLATE "C", -- dev_<ksuid>
    user_id         TEXT NOT NULL REFERENCES identity.user(id) ON DELETE CASCADE,
    public_key      BYTEA NOT NULL,
    key_algorithm   TEXT NOT NULL DEFAULT 'ES256',
    device_name     TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '60 days'),
    revoked_at      TIMESTAMPTZ
);

CREATE INDEX idx_devices_user_id ON identity.devices(user_id) WHERE revoked_at IS NULL;

-- Link existing sessions table to devices
ALTER TABLE identity.sessions
ADD COLUMN device_id TEXT REFERENCES identity.devices(id) ON DELETE SET NULL;

CREATE INDEX idx_sessions_device_id ON identity.sessions(device_id);

-- Ephemeral cryptographic challenges for device enrollment and biometric login
CREATE TABLE identity.auth_challenges (
    challenge   TEXT PRIMARY KEY,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_challenges_expiry ON identity.auth_challenges(expires_at);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS identity.auth_challenges;
DROP INDEX IF EXISTS identity.idx_sessions_device_id;
ALTER TABLE identity.sessions DROP COLUMN IF EXISTS device_id;
DROP INDEX IF EXISTS identity.idx_devices_user_id;
DROP TABLE IF EXISTS identity.devices;
-- +goose StatementEnd
