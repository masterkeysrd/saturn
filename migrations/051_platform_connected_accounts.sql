-- +goose Up
-- +goose StatementBegin
CREATE TABLE platform.connected_accounts (
    id                   TEXT COLLATE "C" PRIMARY KEY,
    space_id             TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    created_by_user_id   TEXT COLLATE "C" NOT NULL REFERENCES identity.user(id) ON DELETE CASCADE,
    provider             VARCHAR(50) NOT NULL,
    provider_account_id  TEXT NOT NULL,
    email                VARCHAR(255) NOT NULL,
    display_name         TEXT,
    avatar_url           TEXT,
    color                VARCHAR(50),
    access_token_enc     TEXT NOT NULL,
    refresh_token_enc    TEXT NOT NULL,
    token_expiry         TIMESTAMP WITH TIME ZONE NOT NULL,
    granted_scopes       TEXT[] NOT NULL DEFAULT '{}',
    enabled_capabilities TEXT[] NOT NULL DEFAULT '{}',
    status               VARCHAR(50) NOT NULL DEFAULT 'healthy',
    status_reason        TEXT,
    backoff_until        TIMESTAMP WITH TIME ZONE,
    last_sync_time       TIMESTAMP WITH TIME ZONE,
    version              BIGINT NOT NULL DEFAULT 1,
    create_time          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_connected_accounts_space_provider_account UNIQUE (space_id, provider, provider_account_id)
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_connected_accounts_space ON platform.connected_accounts (space_id);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_connected_accounts_provider_identity ON platform.connected_accounts (provider, provider_account_id);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_connected_accounts_status ON platform.connected_accounts (status);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE platform.oauth_states (
    state_hash           VARCHAR(64) PRIMARY KEY,
    space_id             TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    user_id              TEXT COLLATE "C" NOT NULL REFERENCES identity.user(id) ON DELETE CASCADE,
    provider             VARCHAR(50) NOT NULL,
    capabilities         TEXT[] NOT NULL DEFAULT '{}',
    connected_account_id TEXT COLLATE "C" REFERENCES platform.connected_accounts(id) ON DELETE CASCADE,
    code_verifier_enc    TEXT NOT NULL,
    return_url           TEXT NOT NULL,
    expires_at           TIMESTAMP WITH TIME ZONE NOT NULL,
    create_time          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_oauth_states_expires_at ON platform.oauth_states (expires_at);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_oauth_states_space_user ON platform.oauth_states (space_id, user_id);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE platform.account_contacts_cache (
    id                   TEXT COLLATE "C" PRIMARY KEY,
    space_id             TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    connected_account_id TEXT COLLATE "C" NOT NULL REFERENCES platform.connected_accounts(id) ON DELETE CASCADE,
    provider_contact_id  TEXT NOT NULL,
    email                VARCHAR(255),
    display_name         TEXT,
    avatar_url           TEXT,
    update_time          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_account_contacts_provider_id UNIQUE (connected_account_id, provider_contact_id)
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_account_contacts_account ON platform.account_contacts_cache (connected_account_id);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_account_contacts_email ON platform.account_contacts_cache (space_id, email);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS platform.account_contacts_cache;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS platform.oauth_states;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS platform.connected_accounts;
-- +goose StatementEnd
