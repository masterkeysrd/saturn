-- +goose Up
-- +goose StatementBegin
CREATE TABLE identity.mfa_factors (
    id              TEXT PRIMARY KEY,              -- mfa_<ksuid>
    user_id         TEXT NOT NULL REFERENCES identity.user(id) ON DELETE CASCADE,
    type            TEXT NOT NULL,                 -- 'totp', 'webauthn', 'mobile_push', 'email_otp'
    name            TEXT NOT NULL,                 -- e.g. "Work YubiKey 5C", "Personal Google Authenticator"
    config          JSONB NOT NULL,                -- Polymorphic credentials configuration
    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at    TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ
);

CREATE INDEX idx_mfa_factors_user ON identity.mfa_factors(user_id)
WHERE revoked_at IS NULL;

CREATE TABLE identity.mfa_recovery (
    user_id         TEXT PRIMARY KEY REFERENCES identity.user(id) ON DELETE CASCADE,
    backup_codes    TEXT[] NOT NULL DEFAULT '{}',   -- Salted & hashed recovery codes
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS identity.mfa_recovery;
DROP INDEX IF EXISTS identity.idx_mfa_factors_user;
DROP TABLE IF EXISTS identity.mfa_factors;
-- +goose StatementEnd
