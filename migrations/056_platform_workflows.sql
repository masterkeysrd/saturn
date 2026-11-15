-- +goose Up
-- +goose StatementBegin

-- 1. Create platform workflow tables
CREATE TABLE platform.flows (
    id              TEXT COLLATE "C" PRIMARY KEY, -- flw_...
    space_id        TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    system_key      VARCHAR(120),                 -- e.g. 'system.finance.inbox_ingestion' (NULL for user flows)
    is_system       BOOLEAN NOT NULL DEFAULT FALSE,
    is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    config          JSONB NOT NULL DEFAULT '{}',  -- FlowConfig { default_model?, timeout_seconds?, max_retries? }
    input_schema    JSONB,                        -- Nullable JSON Schema for input.*
    steps           JSONB NOT NULL DEFAULT '[]',  -- StepNode[] tree
    version         BIGINT NOT NULL DEFAULT 1,
    create_time     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_time     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_platform_flows_space_system_key UNIQUE (space_id, system_key)
);

CREATE INDEX idx_platform_flows_space ON platform.flows(space_id, create_time DESC, id DESC);

CREATE TABLE platform.flow_triggers (
    id          TEXT COLLATE "C" PRIMARY KEY, -- trg_...
    flow_id     TEXT COLLATE "C" NOT NULL REFERENCES platform.flows(id) ON DELETE CASCADE,
    space_id    TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    type        VARCHAR(30) NOT NULL,         -- 'event', 'webhook', 'schedule', 'manual'
    config      JSONB NOT NULL DEFAULT '{}',  -- TriggerConfig { topic?, cron?, schedule_id?, filter?, input_mapping? }
    is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
    create_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_platform_flow_triggers_event_lookup
    ON platform.flow_triggers (space_id, (config->>'topic'))
    WHERE is_enabled = TRUE AND type = 'event';
CREATE INDEX idx_platform_flow_triggers_flow ON platform.flow_triggers(flow_id);

CREATE TABLE platform.flow_runs (
    id              TEXT COLLATE "C" PRIMARY KEY, -- wfr_...
    space_id        TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    flow_id         TEXT COLLATE "C" NOT NULL REFERENCES platform.flows(id) ON DELETE CASCADE,
    flow_version    BIGINT NOT NULL,              -- Snapshot of flows.version that executed
    trigger_id      TEXT COLLATE "C" REFERENCES platform.flow_triggers(id) ON DELETE SET NULL,
    idempotency_key TEXT COLLATE "C",             -- Ties retries back to the same FlowRun for StepRun replay
    status          VARCHAR(30) NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'waiting', 'completed', 'filtered', 'stopped', 'failed', 'cancelled'
    attempts        INT NOT NULL DEFAULT 1,
    trigger_data    JSONB NOT NULL DEFAULT '{}',  -- Raw trigger envelope (avoids SQL reserved word TRIGGER)
    input           JSONB NOT NULL DEFAULT '{}',
    output          JSONB,
    error           JSONB,                        -- Nullable { step_id?, code?, message }
    metadata        JSONB NOT NULL DEFAULT '{}',  -- { tokens_used, duration_ms, correlation_id, trigger_type, ... }
    resume_time     TIMESTAMPTZ,                  -- Reserved for v2 waiting steps
    start_time      TIMESTAMPTZ,
    end_time        TIMESTAMPTZ,
    create_time     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_time     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_platform_flow_runs_idempotency
    ON platform.flow_runs(space_id, flow_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_platform_flow_runs_space_time ON platform.flow_runs(space_id, create_time DESC, id DESC);
CREATE INDEX idx_platform_flow_runs_space_status ON platform.flow_runs(space_id, status, create_time DESC, id DESC);
CREATE INDEX idx_platform_flow_runs_flow_time ON platform.flow_runs(flow_id, create_time DESC, id DESC);
CREATE INDEX idx_platform_flow_runs_waiting_poll ON platform.flow_runs(resume_time) WHERE status = 'waiting';

CREATE TABLE platform.step_runs (
    id            TEXT COLLATE "C" PRIMARY KEY, -- wsr_...
    flow_run_id   TEXT COLLATE "C" NOT NULL REFERENCES platform.flow_runs(id) ON DELETE CASCADE,
    space_id      TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    step_id       VARCHAR(120) NOT NULL,
    step_type     VARCHAR(80) NOT NULL,
    execution_key VARCHAR(255) NOT NULL,        -- Unique per step invocation (e.g. 'extract_tx' or 'each_pay[0].upsert')
    status        VARCHAR(30) NOT NULL,         -- 'running', 'completed', 'filtered', 'stopped', 'failed', 'failed_continued'
    output        JSONB,
    error         JSONB,                        -- Nullable { code?, message }
    metadata      JSONB NOT NULL DEFAULT '{}',  -- { duration_ms, tokens_used, sources: { alias: { loader, hit/count, duration_ms } } }
    agent_run_id  TEXT COLLATE "C" REFERENCES platform.agent_runs(id) ON DELETE SET NULL,
    start_time    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time      TIMESTAMPTZ,
    create_time   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_time   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_platform_step_runs_exec UNIQUE (flow_run_id, execution_key)
);

CREATE INDEX idx_platform_step_runs_run ON platform.step_runs(flow_run_id, create_time ASC);

-- 2. Decouple finance.inbox_item from legacy platform.integration & add idempotency
DELETE FROM finance.inbox_item WHERE doc_type = 'system_verification';
ALTER TABLE finance.inbox_item DROP COLUMN integration_id;
ALTER TABLE finance.inbox_item
    ADD COLUMN flow_run_id     TEXT COLLATE "C" REFERENCES platform.flow_runs(id) ON DELETE SET NULL,
    ADD COLUMN idempotency_key TEXT COLLATE "C";

CREATE UNIQUE INDEX uq_finance_inbox_item_idempotency
    ON finance.inbox_item(space_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- 3. Add deterministic upsert uniqueness on calendar.events(space_id, calendar_id, ical_uid)
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_events_ical_uid
    ON calendar.events(space_id, calendar_id, ical_uid)
    WHERE ical_uid IS NOT NULL;

-- 4. Relax platform.agents purpose uniqueness & allow agent_runs without named agent_id
ALTER TABLE platform.agents DROP CONSTRAINT IF EXISTS uq_agents_space_purpose;
ALTER TABLE platform.agent_runs ALTER COLUMN agent_id DROP NOT NULL;

-- 5. Drop legacy platform.integration tables completely
DROP TABLE IF EXISTS platform.integration_token CASCADE;
DROP TABLE IF EXISTS platform.integration CASCADE;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- 5. Recreate legacy platform.integration tables
CREATE TABLE platform.integration (
    id           TEXT COLLATE "C" PRIMARY KEY,
    space_id     TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    kind         VARCHAR(50) NOT NULL,
    provider     VARCHAR(50) NOT NULL,
    config       JSONB NOT NULL DEFAULT '{}',
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

-- 4. Restore platform.agents uniqueness & platform.agent_runs NOT NULL constraint
ALTER TABLE platform.agent_runs ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE platform.agents ADD CONSTRAINT uq_agents_space_purpose UNIQUE (space_id, purpose);

-- 3. Drop calendar.events ical_uid unique index
DROP INDEX IF EXISTS calendar.uq_calendar_events_ical_uid;

-- 2. Restore finance.inbox_item.integration_id and drop workflow columns
DROP INDEX IF EXISTS finance.uq_finance_inbox_item_idempotency;
ALTER TABLE finance.inbox_item
    DROP COLUMN IF EXISTS idempotency_key,
    DROP COLUMN IF EXISTS flow_run_id,
    ADD COLUMN integration_id TEXT COLLATE "C" REFERENCES platform.integration(id) ON DELETE CASCADE;

-- 1. Drop platform workflow tables
DROP INDEX IF EXISTS platform.idx_platform_step_runs_run;
DROP TABLE IF EXISTS platform.step_runs;

DROP INDEX IF EXISTS platform.idx_platform_flow_runs_waiting_poll;
DROP INDEX IF EXISTS platform.idx_platform_flow_runs_flow_time;
DROP INDEX IF EXISTS platform.idx_platform_flow_runs_space_status;
DROP INDEX IF EXISTS platform.idx_platform_flow_runs_space_time;
DROP INDEX IF EXISTS platform.uq_platform_flow_runs_idempotency;
DROP TABLE IF EXISTS platform.flow_runs;

DROP INDEX IF EXISTS platform.idx_platform_flow_triggers_flow;
DROP INDEX IF EXISTS platform.idx_platform_flow_triggers_event_lookup;
DROP TABLE IF EXISTS platform.flow_triggers;

DROP INDEX IF EXISTS platform.idx_platform_flows_space;
DROP TABLE IF EXISTS platform.flows;

-- +goose StatementEnd
