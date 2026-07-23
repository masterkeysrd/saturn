-- +goose Up
-- +goose StatementBegin
CREATE TABLE platform.integration (
    id           TEXT COLLATE "C" PRIMARY KEY,
    space_id     TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    kind         VARCHAR(50) NOT NULL,        -- 'transaction_ingestion', 'balance_sync', 'outbound_alert'
    provider     VARCHAR(50) NOT NULL,        -- 'email', 'stripe', 'plaid', 'slack'
    config       JSONB NOT NULL DEFAULT '{}',  -- E.g. allowed lists, signing secrets
    is_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
    create_time  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_space_kind_provider UNIQUE (space_id, kind, provider)
);

CREATE TABLE platform.integration_token (
    id             TEXT COLLATE "C" PRIMARY KEY,
    integration_id TEXT COLLATE "C" NOT NULL REFERENCES platform.integration(id) ON DELETE CASCADE,
    name           VARCHAR(255) NOT NULL,
    token_hash     VARCHAR(64) NOT NULL UNIQUE,
    create_time    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_used_time TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_integration_token_parent ON platform.integration_token(integration_id);
CREATE INDEX idx_integration_space ON platform.integration(space_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS platform.idx_integration_space;
DROP INDEX IF EXISTS platform.idx_integration_token_parent;
DROP TABLE IF EXISTS platform.integration_token;
DROP TABLE IF EXISTS platform.integration;
-- +goose StatementEnd
