-- +goose Up
-- +goose StatementBegin

-- 1. Create platform AI tables
CREATE TABLE platform.ai_providers (
    id          TEXT COLLATE "C" PRIMARY KEY, -- prv_...
    space_id    TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    driver      VARCHAR(50) NOT NULL,         -- 'gemini', 'openai', 'anthropic', 'ollama', 'openrouter', 'openai_compatible'
    config      JSONB NOT NULL DEFAULT '{}',  -- ProviderConfig { base_url? }
    secret      TEXT,                         -- Nullable AES-256-GCM ciphertext of JSON { api_key?, headers? }
    status      JSONB NOT NULL DEFAULT '{}',  -- ProviderStatus { state: 'unverified'|'healthy'|'unhealthy', last_verified_at?, error?: { code?, message } }
    is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
    create_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_platform_ai_providers_space ON platform.ai_providers(space_id, create_time DESC);

CREATE TABLE platform.ai_models (
    id           TEXT COLLATE "C" PRIMARY KEY, -- mdl_...
    space_id     TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    provider_id  TEXT COLLATE "C" NOT NULL REFERENCES platform.ai_providers(id) ON DELETE CASCADE,
    model_id     VARCHAR(200) NOT NULL,        -- Upstream model ID (e.g. 'gemini-2.5-flash', 'gpt-4.1', 'llama3.2:latest')
    display_name VARCHAR(255) NOT NULL,
    source       VARCHAR(30) NOT NULL DEFAULT 'catalog', -- 'catalog', 'discovered', 'custom'
    profile      JSONB NOT NULL DEFAULT '{}',  -- ModelProfile { capabilities, limits, pricing }
    config       JSONB NOT NULL DEFAULT '{}',  -- GenerationConfig { temperature?, max_tokens?, top_p?, thinking?: { enabled, effort?, budget_tokens? } }
    is_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
    create_time  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_time  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_platform_ai_models_provider_model UNIQUE (space_id, provider_id, model_id)
);
CREATE INDEX idx_platform_ai_models_space ON platform.ai_models(space_id, is_enabled, display_name ASC);
CREATE INDEX idx_platform_ai_models_provider ON platform.ai_models(provider_id);

CREATE TABLE platform.ai_mcp_servers (
    id          TEXT COLLATE "C" PRIMARY KEY, -- mcp_...
    space_id    TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    system_key  VARCHAR(120),                 -- 'system.saturn.mcp' (NULL for external HTTP servers)
    is_system   BOOLEAN NOT NULL DEFAULT FALSE,
    slug        VARCHAR(100) NOT NULL,        -- 'saturn' or user slug [a-z0-9][a-z0-9-]*
    name        VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    transport   VARCHAR(20) NOT NULL DEFAULT 'http', -- 'http' (all user servers) | 'in_memory' (ONLY is_system = TRUE)
    config      JSONB NOT NULL DEFAULT '{}',  -- MCPServerConfig { url, auth_type: 'none'|'bearer'|'custom_headers', trust_read_hints: true, timeout_seconds: 30 }
    auth_secret TEXT,                         -- Nullable AES-256-GCM ciphertext of JSON { bearer_token?, headers? }
    discovery   JSONB NOT NULL DEFAULT '{}',  -- MCPDiscoveryState { health_status: 'unknown'|'healthy'|'unhealthy', server_info, tools: [], last_synced_at?, error?: { code?, message } }
    is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
    create_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_platform_ai_mcp_servers_slug UNIQUE (space_id, slug),
    CONSTRAINT uq_platform_ai_mcp_servers_system_key UNIQUE (space_id, system_key),
    CONSTRAINT chk_platform_ai_mcp_transport CHECK (transport = 'http' OR (transport = 'in_memory' AND is_system = TRUE))
);
CREATE INDEX idx_platform_ai_mcp_servers_space ON platform.ai_mcp_servers(space_id, is_system DESC, create_time DESC);

CREATE TABLE platform.ai_agents (
    id          TEXT COLLATE "C" PRIMARY KEY, -- agt_...
    space_id    TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    system_key  VARCHAR(120),                 -- 'system.saturn.assistant' (NULL for user agents)
    is_system   BOOLEAN NOT NULL DEFAULT FALSE,
    slug        VARCHAR(100) NOT NULL,        -- [a-z0-9][a-z0-9-]*
    name        VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tags        TEXT[] NOT NULL DEFAULT '{}',
    model_id    TEXT COLLATE "C" REFERENCES platform.ai_models(id) ON DELETE SET NULL, -- NULL = Workspace Default Model
    config      JSONB NOT NULL DEFAULT '{}',  -- AgentConfig { icon, system_instruction, generation: GenerationConfig, execution: { approval_policy, max_steps, timeout_seconds }, mcp_bindings: [{ mcp_server_id, allowed_tools }], output_schema? }
    is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
    version     BIGINT NOT NULL DEFAULT 1,
    create_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_platform_ai_agents_slug UNIQUE (space_id, slug),
    CONSTRAINT uq_platform_ai_agents_system_key UNIQUE (space_id, system_key)
);
CREATE INDEX idx_platform_ai_agents_space ON platform.ai_agents(space_id, is_system DESC, create_time DESC);

CREATE TABLE platform.ai_threads (
    id              TEXT COLLATE "C" PRIMARY KEY, -- thr_...
    space_id        TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    user_id         TEXT COLLATE "C" NOT NULL REFERENCES identity.user(id) ON DELETE CASCADE,
    agent_id        TEXT COLLATE "C" REFERENCES platform.ai_agents(id) ON DELETE SET NULL,
    model_id        TEXT COLLATE "C" REFERENCES platform.ai_models(id) ON DELETE SET NULL,
    title           VARCHAR(255) NOT NULL DEFAULT 'New Chat',
    status          VARCHAR(30) NOT NULL DEFAULT 'idle', -- 'idle', 'streaming', 'awaiting_approval'
    config          JSONB NOT NULL DEFAULT '{}',  -- ThreadConfig { approval_policy?, generation?: GenerationConfig }
    state           JSONB NOT NULL DEFAULT '{}',  -- ThreadState { active_run_id?, pending_approvals: [], memory: { summary, up_to_seq } }
    message_count   INT NOT NULL DEFAULT 0,
    is_pinned       BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    create_time     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_time     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_platform_ai_threads_user_recent
    ON platform.ai_threads(space_id, user_id, is_archived, is_pinned DESC, last_message_at DESC, id DESC);

CREATE TABLE platform.ai_runs (
    id          TEXT COLLATE "C" PRIMARY KEY, -- air_...
    space_id    TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    kind        VARCHAR(30) NOT NULL,         -- 'generate', 'agent_run', 'chat_turn'
    source      VARCHAR(30) NOT NULL,         -- 'api', 'chat', 'playground', 'workflow', 'mcp'
    thread_id   TEXT COLLATE "C" REFERENCES platform.ai_threads(id) ON DELETE SET NULL,
    agent_id    TEXT COLLATE "C" REFERENCES platform.ai_agents(id) ON DELETE SET NULL,
    provider_id TEXT COLLATE "C" REFERENCES platform.ai_providers(id) ON DELETE SET NULL,
    model_id    TEXT COLLATE "C" REFERENCES platform.ai_models(id) ON DELETE SET NULL,
    flow_run_id TEXT COLLATE "C" REFERENCES platform.flow_runs(id) ON DELETE SET NULL,
    status      VARCHAR(30) NOT NULL,         -- 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled', 'timed_out', 'max_steps_exceeded'
    input       JSONB NOT NULL DEFAULT '{}',  -- RunInput { prompt, system_instruction?, model_snapshot: { driver, model_name } }
    output      JSONB,                        -- Nullable RunOutput { text?, data? }
    error       JSONB,                        -- Nullable ErrorDetail { code?, message }
    metrics     JSONB NOT NULL DEFAULT '{}',  -- RunMetrics { tokens: { input, output, reasoning, cached, total }, estimated_cost_usd, latency_ms, step_count }
    start_time  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time    TIMESTAMPTZ,
    create_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_platform_ai_runs_space_time ON platform.ai_runs(space_id, create_time DESC, id DESC);
CREATE INDEX idx_platform_ai_runs_agent_time ON platform.ai_runs(space_id, agent_id, create_time DESC, id DESC) WHERE agent_id IS NOT NULL;
CREATE INDEX idx_platform_ai_runs_thread_time ON platform.ai_runs(thread_id, create_time DESC) WHERE thread_id IS NOT NULL;

CREATE TABLE platform.ai_messages (
    id          TEXT COLLATE "C" PRIMARY KEY, -- aim_...
    thread_id   TEXT COLLATE "C" NOT NULL REFERENCES platform.ai_threads(id) ON DELETE CASCADE,
    space_id    TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    run_id      TEXT COLLATE "C" REFERENCES platform.ai_runs(id) ON DELETE SET NULL,
    seq         INT NOT NULL,
    role        VARCHAR(20) NOT NULL,         -- 'user', 'assistant', 'tool'
    blocks      JSONB NOT NULL DEFAULT '[]',  -- Serialized ContentBlock[] (text, thinking, tool_call, tool_result, attachment)
    metadata    JSONB NOT NULL DEFAULT '{}',  -- MessageMetadata { model_name?, tokens?: TokenUsage }
    create_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_platform_ai_messages_thread_seq UNIQUE (thread_id, seq)
);
CREATE INDEX idx_platform_ai_messages_thread_seq ON platform.ai_messages(thread_id, seq ASC);

CREATE TABLE platform.ai_run_steps (
    id            TEXT COLLATE "C" PRIMARY KEY, -- ais_...
    run_id        TEXT COLLATE "C" NOT NULL REFERENCES platform.ai_runs(id) ON DELETE CASCADE,
    space_id      TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    seq           INT NOT NULL,
    kind          VARCHAR(20) NOT NULL,         -- 'llm', 'tool'
    mcp_server_id TEXT COLLATE "C" REFERENCES platform.ai_mcp_servers(id) ON DELETE SET NULL,
    name          VARCHAR(200) NOT NULL,        -- Model ID or MCP tool name
    status        VARCHAR(30) NOT NULL,         -- 'completed', 'failed', 'awaiting_approval', 'rejected'
    input         JSONB NOT NULL DEFAULT '{}',
    output        JSONB,
    error         JSONB,                        -- Nullable ErrorDetail { code?, message }
    metrics       JSONB NOT NULL DEFAULT '{}',  -- StepMetrics { tokens?: TokenUsage, duration_ms }
    create_time   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_platform_ai_run_steps_seq UNIQUE (run_id, seq)
);
CREATE INDEX idx_platform_ai_run_steps_run ON platform.ai_run_steps(run_id, seq ASC);

-- 2. Migrate platform.llm_providers -> platform.ai_providers
INSERT INTO platform.ai_providers (
    id, space_id, name, driver, config, secret, status, is_enabled, create_time, update_time
)
SELECT
    lp.id,
    lp.space_id,
    lp.name,
    CASE lp.compatibility_mode
        WHEN 'GEMINI_NATIVE' THEN 'gemini'
        WHEN 'ANTHROPIC_COMPATIBLE' THEN 'anthropic'
        WHEN 'OLLAMA_NATIVE' THEN 'ollama'
        WHEN 'OPENAI_COMPATIBLE' THEN
            CASE
                WHEN lp.api_url ILIKE '%openrouter.ai%' THEN 'openrouter'
                WHEN lp.api_url IS NULL OR BTRIM(lp.api_url) = '' OR lp.api_url ILIKE 'https://api.openai.com%' THEN 'openai'
                ELSE 'openai_compatible'
            END
        ELSE 'openai_compatible'
    END,
    CASE
        WHEN lp.api_url IS NOT NULL AND BTRIM(lp.api_url) <> '' THEN jsonb_build_object('base_url', BTRIM(lp.api_url))
        ELSE '{}'::jsonb
    END,
    lp.api_key,
    jsonb_build_object('state', 'unverified'),
    TRUE,
    lp.create_time,
    lp.update_time
FROM platform.llm_providers lp
ON CONFLICT (id) DO NOTHING;

-- 3. Synthesize platform.ai_models rows for distinct (space_id, llm_provider_id, model_name) referenced by platform.agents
INSERT INTO platform.ai_models (
    id, space_id, provider_id, model_id, display_name, source, profile, config, is_enabled, create_time, update_time
)
SELECT
    'mdl_0' || substr(md5(a.space_id || ':' || a.llm_provider_id || ':' || a.model_name), 1, 26),
    a.space_id,
    a.llm_provider_id,
    a.model_name,
    a.model_name,
    'custom',
    '{}'::jsonb,
    '{}'::jsonb,
    TRUE,
    MIN(a.create_time),
    MAX(a.update_time)
FROM platform.agents a
WHERE a.llm_provider_id IS NOT NULL
  AND BTRIM(a.model_name) <> ''
GROUP BY a.space_id, a.llm_provider_id, a.model_name
ON CONFLICT (space_id, provider_id, model_id) DO NOTHING;

-- 4. Migrate platform.agents -> platform.ai_agents with collision-safe kebab-case slug
WITH normalized_agents AS (
    SELECT
        a.*,
        COALESCE(
            NULLIF(BTRIM(REGEXP_REPLACE(LOWER(a.name), '[^a-z0-9]+', '-', 'g'), '-'), ''),
            'agent'
        ) AS raw_slug
    FROM platform.agents a
),
ranked_agents AS (
    SELECT
        na.*,
        LEFT(na.raw_slug, 90) AS base_slug,
        ROW_NUMBER() OVER (
            PARTITION BY na.space_id, LEFT(na.raw_slug, 90)
            ORDER BY na.create_time ASC, na.id ASC
        ) AS slug_rn
    FROM normalized_agents na
)
INSERT INTO platform.ai_agents (
    id, space_id, system_key, is_system, slug, name, description, tags, model_id, config, is_enabled, version, create_time, update_time
)
SELECT
    ra.id,
    ra.space_id,
    NULL,
    FALSE,
    CASE
        WHEN ra.slug_rn = 1 AND ra.base_slug <> 'saturn-assistant' THEN ra.base_slug
        ELSE ra.base_slug || '-' || substr(md5(ra.id), 1, 6)
    END,
    ra.name,
    COALESCE(ra.description, ''),
    COALESCE(ra.tags, '{}'),
    m.id,
    jsonb_strip_nulls(jsonb_build_object(
        'icon', 'bot',
        'system_instruction', ra.system_instruction,
        'generation', jsonb_build_object('temperature', ra.temperature)
    )),
    ra.is_enabled,
    1,
    ra.create_time,
    ra.update_time
FROM ranked_agents ra
LEFT JOIN platform.ai_models m
    ON m.space_id = ra.space_id
   AND m.provider_id = ra.llm_provider_id
   AND m.model_id = ra.model_name
ON CONFLICT (id) DO NOTHING;

-- 5. Migrate platform.agent_runs -> platform.ai_runs and re-point platform.step_runs.agent_run_id -> ai_run_id
INSERT INTO platform.ai_runs (
    id, space_id, kind, source, thread_id, agent_id, provider_id, model_id, flow_run_id,
    status, input, output, error, metrics, start_time, end_time, create_time
)
SELECT
    r.id,
    r.space_id,
    CASE WHEN r.agent_id IS NULL THEN 'generate' ELSE 'agent_run' END,
    CASE WHEN EXISTS (SELECT 1 FROM platform.step_runs sr WHERE sr.agent_run_id = r.id) THEN 'workflow' ELSE 'api' END,
    NULL,
    r.agent_id,
    a.llm_provider_id,
    m.id,
    (SELECT sr.flow_run_id FROM platform.step_runs sr WHERE sr.agent_run_id = r.id LIMIT 1),
    CASE UPPER(r.status)
        WHEN 'SUCCESS' THEN 'completed'
        WHEN 'FAILED' THEN 'failed'
        ELSE 'failed'
    END,
    jsonb_strip_nulls(jsonb_build_object(
        'prompt', r.input_raw,
        'model_snapshot', CASE
            WHEN a.model_name IS NOT NULL AND BTRIM(a.model_name) <> '' THEN
                jsonb_build_object(
                    'driver', COALESCE(p.driver, ''),
                    'model_name', a.model_name
                )
            ELSE NULL
        END
    )),
    CASE
        WHEN r.output_raw IS NOT NULL THEN jsonb_build_object('text', r.output_raw)
        ELSE NULL
    END,
    CASE
        WHEN r.error_message IS NOT NULL AND BTRIM(r.error_message) <> '' THEN jsonb_build_object('message', r.error_message)
        ELSE NULL
    END,
    jsonb_build_object(
        'tokens', jsonb_build_object(
            'input', 0,
            'output', 0,
            'reasoning', 0,
            'cached', 0,
            'total', COALESCE(r.tokens_used, 0)
        ),
        'estimated_cost_usd', 0,
        'latency_ms', 0,
        'step_count', 1
    ),
    r.create_time,
    r.create_time,
    r.create_time
FROM platform.agent_runs r
LEFT JOIN platform.agents a ON a.id = r.agent_id
LEFT JOIN platform.ai_providers p ON p.id = a.llm_provider_id
LEFT JOIN platform.ai_models m
    ON m.space_id = a.space_id
   AND m.provider_id = a.llm_provider_id
   AND m.model_id = a.model_name
ON CONFLICT (id) DO NOTHING;

ALTER TABLE platform.step_runs DROP CONSTRAINT IF EXISTS step_runs_agent_run_id_fkey;
ALTER TABLE platform.step_runs RENAME COLUMN agent_run_id TO ai_run_id;
ALTER TABLE platform.step_runs
    ADD CONSTRAINT step_runs_ai_run_id_fkey
    FOREIGN KEY (ai_run_id) REFERENCES platform.ai_runs(id) ON DELETE SET NULL;

-- 6. Migrate identity.api_keys.scopes (agents:read -> ai:read, agents:write -> ai:write, ai:execute)
UPDATE identity.api_keys
SET scopes = (
    SELECT COALESCE(ARRAY_AGG(DISTINCT mapped_scope ORDER BY mapped_scope), '{}')
    FROM (
        SELECT UNNEST(
            CASE s
                WHEN 'agents:read' THEN ARRAY['ai:read']
                WHEN 'agents:write' THEN ARRAY['ai:write', 'ai:execute']
                ELSE ARRAY[s]
            END
        ) AS mapped_scope
        FROM UNNEST(scopes) AS s
    ) sub
),
    update_time = NOW()
WHERE scopes && ARRAY['agents:read', 'agents:write'];

-- 7. Drop legacy agent & llm_provider tables
DROP INDEX IF EXISTS platform.idx_agent_runs_parent;
DROP INDEX IF EXISTS platform.idx_agents_space;
DROP INDEX IF EXISTS platform.idx_llm_providers_space;
DROP TABLE IF EXISTS platform.agent_runs;
DROP TABLE IF EXISTS platform.agents;
DROP TABLE IF EXISTS platform.llm_providers;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- 1. Recreate legacy llm_providers, agents, and agent_runs tables (post-056 schema state)
CREATE TABLE platform.llm_providers (
    id                 TEXT COLLATE "C" PRIMARY KEY,
    space_id           TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    name               VARCHAR(255) NOT NULL,
    compatibility_mode VARCHAR(50) NOT NULL,
    api_url            TEXT,
    api_key            TEXT,
    create_time        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_llm_providers_space ON platform.llm_providers(space_id);

CREATE TABLE platform.agents (
    id                 TEXT COLLATE "C" PRIMARY KEY,
    space_id           TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    llm_provider_id    TEXT COLLATE "C" REFERENCES platform.llm_providers(id) ON DELETE SET NULL,
    name               VARCHAR(255) NOT NULL,
    description        TEXT,
    purpose            VARCHAR(100) NOT NULL,
    tags               TEXT[] NOT NULL DEFAULT '{}',
    model_name         VARCHAR(100) NOT NULL,
    system_instruction TEXT,
    temperature        DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    is_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    create_time        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agents_space ON platform.agents(space_id);

CREATE TABLE platform.agent_runs (
    id            TEXT COLLATE "C" PRIMARY KEY,
    agent_id      TEXT COLLATE "C" REFERENCES platform.agents(id) ON DELETE CASCADE,
    space_id      TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    status        VARCHAR(50) NOT NULL,
    input_raw     TEXT NOT NULL,
    output_raw    TEXT,
    error_message TEXT,
    tokens_used   INT NOT NULL DEFAULT 0,
    create_time   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agent_runs_parent ON platform.agent_runs(agent_id);

-- 2. Restore migrated rows into legacy tables
INSERT INTO platform.llm_providers (
    id, space_id, name, compatibility_mode, api_url, api_key, create_time, update_time
)
SELECT
    p.id,
    p.space_id,
    p.name,
    CASE p.driver
        WHEN 'gemini' THEN 'GEMINI_NATIVE'
        WHEN 'anthropic' THEN 'ANTHROPIC_COMPATIBLE'
        WHEN 'ollama' THEN 'OLLAMA_NATIVE'
        ELSE 'OPENAI_COMPATIBLE'
    END,
    p.config->>'base_url',
    p.secret,
    p.create_time,
    p.update_time
FROM platform.ai_providers p
ON CONFLICT (id) DO NOTHING;

INSERT INTO platform.agents (
    id, space_id, llm_provider_id, name, description, purpose, tags, model_name, system_instruction, temperature, is_enabled, create_time, update_time
)
SELECT
    a.id,
    a.space_id,
    m.provider_id,
    a.name,
    NULLIF(a.description, ''),
    UPPER(REPLACE(a.slug, '-', '_')),
    COALESCE(a.tags, '{}'),
    COALESCE(m.model_id, ''),
    a.config->>'system_instruction',
    COALESCE((a.config->'generation'->>'temperature')::DOUBLE PRECISION, 0.0),
    a.is_enabled,
    a.create_time,
    a.update_time
FROM platform.ai_agents a
LEFT JOIN platform.ai_models m ON m.id = a.model_id
WHERE a.is_system = FALSE
ON CONFLICT (id) DO NOTHING;

INSERT INTO platform.agent_runs (
    id, agent_id, space_id, status, input_raw, output_raw, error_message, tokens_used, create_time
)
SELECT
    r.id,
    CASE WHEN EXISTS (SELECT 1 FROM platform.agents a WHERE a.id = r.agent_id) THEN r.agent_id ELSE NULL END,
    r.space_id,
    CASE r.status
        WHEN 'completed' THEN 'SUCCESS'
        ELSE 'FAILED'
    END,
    COALESCE(r.input->>'prompt', ''),
    r.output->>'text',
    r.error->>'message',
    COALESCE((r.metrics->'tokens'->>'total')::INT, 0),
    r.create_time
FROM platform.ai_runs r
WHERE r.kind IN ('generate', 'agent_run')
ON CONFLICT (id) DO NOTHING;

-- 3. Restore platform.step_runs.agent_run_id
ALTER TABLE platform.step_runs DROP CONSTRAINT IF EXISTS step_runs_ai_run_id_fkey;
ALTER TABLE platform.step_runs RENAME COLUMN ai_run_id TO agent_run_id;
ALTER TABLE platform.step_runs
    ADD CONSTRAINT step_runs_agent_run_id_fkey
    FOREIGN KEY (agent_run_id) REFERENCES platform.agent_runs(id) ON DELETE SET NULL;

-- 4. Reverse identity.api_keys.scopes
UPDATE identity.api_keys
SET scopes = (
    SELECT COALESCE(ARRAY_AGG(DISTINCT mapped_scope ORDER BY mapped_scope), '{}')
    FROM (
        SELECT
            CASE s
                WHEN 'ai:read' THEN 'agents:read'
                WHEN 'ai:write' THEN 'agents:write'
                WHEN 'ai:execute' THEN 'agents:write'
                ELSE s
            END AS mapped_scope
        FROM UNNEST(scopes) AS s
    ) sub
),
    update_time = NOW()
WHERE scopes && ARRAY['ai:read', 'ai:write', 'ai:execute'];

-- 5. Drop platform AI tables and indexes
DROP INDEX IF EXISTS platform.idx_platform_ai_run_steps_run;
DROP TABLE IF EXISTS platform.ai_run_steps;

DROP INDEX IF EXISTS platform.idx_platform_ai_messages_thread_seq;
DROP TABLE IF EXISTS platform.ai_messages;

DROP INDEX IF EXISTS platform.idx_platform_ai_runs_thread_time;
DROP INDEX IF EXISTS platform.idx_platform_ai_runs_agent_time;
DROP INDEX IF EXISTS platform.idx_platform_ai_runs_space_time;
DROP TABLE IF EXISTS platform.ai_runs;

DROP INDEX IF EXISTS platform.idx_platform_ai_threads_user_recent;
DROP TABLE IF EXISTS platform.ai_threads;

DROP INDEX IF EXISTS platform.idx_platform_ai_agents_space;
DROP TABLE IF EXISTS platform.ai_agents;

DROP INDEX IF EXISTS platform.idx_platform_ai_mcp_servers_space;
DROP TABLE IF EXISTS platform.ai_mcp_servers;

DROP INDEX IF EXISTS platform.idx_platform_ai_models_provider;
DROP INDEX IF EXISTS platform.idx_platform_ai_models_space;
DROP TABLE IF EXISTS platform.ai_models;

DROP INDEX IF EXISTS platform.idx_platform_ai_providers_space;
DROP TABLE IF EXISTS platform.ai_providers;

-- +goose StatementEnd
