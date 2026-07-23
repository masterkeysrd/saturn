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

CREATE TABLE platform.llm_providers (
    id                 TEXT COLLATE "C" PRIMARY KEY,
    space_id           TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    name               VARCHAR(255) NOT NULL,
    compatibility_mode VARCHAR(50) NOT NULL, -- 'GEMINI_NATIVE', 'OPENAI_COMPATIBLE', 'ANTHROPIC_COMPATIBLE'
    api_url            TEXT,
    api_key            TEXT,
    create_time        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE platform.agents (
    id                 TEXT COLLATE "C" PRIMARY KEY,
    space_id           TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    llm_provider_id    TEXT COLLATE "C" REFERENCES platform.llm_providers(id) ON DELETE SET NULL,
    name               VARCHAR(255) NOT NULL,
    description        TEXT,
    purpose            VARCHAR(100) NOT NULL, -- e.g. 'INBOX_PARSER'
    tags               TEXT[] NOT NULL DEFAULT '{}',
    model_name         VARCHAR(100) NOT NULL,
    system_instruction TEXT,
    temperature        DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    is_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    create_time        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_agents_space_purpose UNIQUE (space_id, purpose)
);

CREATE TABLE platform.agent_runs (
    id            TEXT COLLATE "C" PRIMARY KEY,
    agent_id      TEXT COLLATE "C" NOT NULL REFERENCES platform.agents(id) ON DELETE CASCADE,
    space_id      TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    status        VARCHAR(50) NOT NULL, -- 'SUCCESS', 'FAILED'
    input_raw     TEXT NOT NULL,
    output_raw    TEXT,
    error_message TEXT,
    tokens_used   INT NOT NULL DEFAULT 0,
    create_time   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_integration_token_parent ON platform.integration_token(integration_id);
CREATE INDEX idx_integration_space ON platform.integration(space_id);
CREATE INDEX idx_llm_providers_space ON platform.llm_providers(space_id);
CREATE INDEX idx_agents_space ON platform.agents(space_id);
CREATE INDEX idx_agent_runs_parent ON platform.agent_runs(agent_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS platform.idx_agent_runs_parent;
DROP INDEX IF EXISTS platform.idx_agents_space;
DROP INDEX IF EXISTS platform.idx_llm_providers_space;
DROP INDEX IF EXISTS platform.idx_integration_space;
DROP INDEX IF EXISTS platform.idx_integration_token_parent;
DROP TABLE IF EXISTS platform.agent_runs;
DROP TABLE IF EXISTS platform.agents;
DROP TABLE IF EXISTS platform.llm_providers;
DROP TABLE IF EXISTS platform.integration_token;
DROP TABLE IF EXISTS platform.integration;
-- +goose StatementEnd
