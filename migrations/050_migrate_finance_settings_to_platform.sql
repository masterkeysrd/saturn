-- +goose Up
-- +goose StatementBegin
INSERT INTO platform.settings (
    scope_type,
    scope_id,
    namespace,
    payload,
    version,
    create_time,
    update_time
)
SELECT
    'space',
    space_id,
    'finance',
    jsonb_build_object('base_currency', base_currency),
    1,
    create_time,
    update_time
FROM finance.settings
ON CONFLICT (scope_type, scope_id, namespace) DO NOTHING;

DROP TABLE IF EXISTS finance.settings CASCADE;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
CREATE TABLE finance.settings (
    space_id      TEXT         COLLATE "C" NOT NULL,
    base_currency VARCHAR(3)  NOT NULL,
    create_time   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (space_id),
    CONSTRAINT fk_settings_space FOREIGN KEY (space_id) REFERENCES space.space(id) ON DELETE CASCADE
);

INSERT INTO finance.settings (space_id, base_currency, create_time, update_time)
SELECT
    scope_id,
    payload->>'base_currency',
    create_time,
    update_time
FROM platform.settings
WHERE scope_type = 'space' AND namespace = 'finance';
-- +goose StatementEnd
