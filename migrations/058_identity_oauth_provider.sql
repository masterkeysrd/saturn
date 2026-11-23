-- +goose Up
-- +goose StatementBegin

CREATE TABLE identity.oauth_clients (
    id                         TEXT COLLATE "C" PRIMARY KEY,
    space_id                   TEXT COLLATE "C" REFERENCES space.space(id) ON DELETE CASCADE,
    name                       VARCHAR(255) NOT NULL,
    description                TEXT NOT NULL DEFAULT '',
    secret_prefix              VARCHAR(24) NOT NULL DEFAULT '',
    secret_hash                VARCHAR(64),
    redirect_uris              TEXT[] NOT NULL,
    allowed_scopes             TEXT[] NOT NULL,
    token_endpoint_auth_method VARCHAR(32) NOT NULL,
    refresh_token_policy       VARCHAR(20) NOT NULL DEFAULT 'rotate',
    registration_source        VARCHAR(20) NOT NULL,
    metadata_etag              TEXT NOT NULL DEFAULT '',
    metadata_fetched_at        TIMESTAMPTZ,
    create_time                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_time                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_identity_oauth_clients_space ON identity.oauth_clients(space_id, create_time DESC);

CREATE TABLE identity.oauth_grants (
    id                           TEXT COLLATE "C" PRIMARY KEY,
    client_id                    TEXT COLLATE "C" NOT NULL REFERENCES identity.oauth_clients(id) ON DELETE CASCADE,
    user_id                      TEXT COLLATE "C" NOT NULL REFERENCES identity.user(id) ON DELETE CASCADE,
    space_id                     TEXT COLLATE "C" NOT NULL,
    scopes                       TEXT[] NOT NULL,
    refresh_token_hash           VARCHAR(64) UNIQUE,
    previous_refresh_token_hash  VARCHAR(64),
    previous_refresh_grace_until TIMESTAMPTZ,
    refresh_expires_at           TIMESTAMPTZ,
    last_used_at                 TIMESTAMPTZ,
    revoked_at                   TIMESTAMPTZ,
    create_time                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_time                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_oauth_grant_member
        FOREIGN KEY (space_id, user_id)
        REFERENCES space.member(space_id, user_id)
        ON DELETE CASCADE
);

CREATE INDEX idx_identity_oauth_grants_user ON identity.oauth_grants(user_id, create_time DESC);
CREATE INDEX idx_identity_oauth_grants_space ON identity.oauth_grants(space_id, create_time DESC);
CREATE INDEX idx_identity_oauth_grants_client ON identity.oauth_grants(client_id);
CREATE INDEX idx_identity_oauth_grants_prev_rt ON identity.oauth_grants(previous_refresh_token_hash)
    WHERE previous_refresh_token_hash IS NOT NULL;

CREATE TABLE identity.oauth_auth_codes (
    id                    TEXT COLLATE "C" PRIMARY KEY,
    code_hash             VARCHAR(64) UNIQUE,
    handoff_hash          VARCHAR(64) NOT NULL UNIQUE,
    approved              BOOLEAN NOT NULL,
    client_id             TEXT COLLATE "C" NOT NULL REFERENCES identity.oauth_clients(id) ON DELETE CASCADE,
    user_id               TEXT COLLATE "C" NOT NULL REFERENCES identity.user(id) ON DELETE CASCADE,
    space_id              TEXT COLLATE "C" NOT NULL DEFAULT '',
    redirect_uri          TEXT NOT NULL DEFAULT '',
    state                 TEXT NOT NULL DEFAULT '',
    resource              TEXT NOT NULL DEFAULT '',
    scopes                TEXT[] NOT NULL DEFAULT '{}',
    code_challenge        VARCHAR(128) NOT NULL,
    code_challenge_method VARCHAR(16) NOT NULL,
    expires_at            TIMESTAMPTZ NOT NULL,
    consumed_at           TIMESTAMPTZ,
    handoff_consumed_at   TIMESTAMPTZ,
    create_time           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE identity.oauth_access_tokens (
    id          TEXT COLLATE "C" PRIMARY KEY,
    grant_id    TEXT COLLATE "C" NOT NULL REFERENCES identity.oauth_grants(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    create_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_identity_oauth_access_tokens_grant ON identity.oauth_access_tokens(grant_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS identity.idx_identity_oauth_access_tokens_grant;
DROP TABLE IF EXISTS identity.oauth_access_tokens;
DROP TABLE IF EXISTS identity.oauth_auth_codes;
DROP INDEX IF EXISTS identity.idx_identity_oauth_grants_prev_rt;
DROP INDEX IF EXISTS identity.idx_identity_oauth_grants_client;
DROP INDEX IF EXISTS identity.idx_identity_oauth_grants_space;
DROP INDEX IF EXISTS identity.idx_identity_oauth_grants_user;
DROP TABLE IF EXISTS identity.oauth_grants;
DROP INDEX IF EXISTS identity.idx_identity_oauth_clients_space;
DROP TABLE IF EXISTS identity.oauth_clients;
-- +goose StatementEnd
