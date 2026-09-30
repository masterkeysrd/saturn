-- +goose Up
-- +goose StatementBegin
CREATE TABLE platform.settings (
    scope_type  VARCHAR(32) NOT NULL,
    scope_id    TEXT NOT NULL,
    namespace   VARCHAR(64) NOT NULL,
    payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    version     BIGINT NOT NULL DEFAULT 1,
    create_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (scope_type, scope_id, namespace)
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_platform_settings_scope ON platform.settings (scope_type, scope_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS platform.settings;
-- +goose StatementEnd
