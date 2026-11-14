-- +goose Up
-- +goose StatementBegin

CREATE TABLE identity.api_keys (
    id           TEXT COLLATE "C" PRIMARY KEY,
    user_id      TEXT COLLATE "C" NOT NULL REFERENCES identity.user(id) ON DELETE CASCADE,
    name         VARCHAR(255) NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    key_prefix   VARCHAR(20) NOT NULL,
    key_hash     VARCHAR(64) NOT NULL UNIQUE,
    scopes       TEXT[] NOT NULL,
    expires_at   TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    create_time  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_time  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_identity_api_keys_user ON identity.api_keys(user_id, create_time DESC);

CREATE TABLE space.api_key_grants (
    api_key_id  TEXT COLLATE "C" NOT NULL REFERENCES identity.api_keys(id) ON DELETE CASCADE,
    space_id    TEXT COLLATE "C" NOT NULL,
    user_id     TEXT COLLATE "C" NOT NULL,
    create_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (api_key_id, space_id),
    CONSTRAINT fk_api_key_grant_member
        FOREIGN KEY (space_id, user_id)
        REFERENCES space.member(space_id, user_id)
        ON DELETE CASCADE
);

CREATE INDEX idx_space_api_key_grants_space ON space.api_key_grants(space_id, create_time DESC);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS space.idx_space_api_key_grants_space;
DROP TABLE IF EXISTS space.api_key_grants;
DROP INDEX IF EXISTS identity.idx_identity_api_keys_user;
DROP TABLE IF EXISTS identity.api_keys;
-- +goose StatementEnd
