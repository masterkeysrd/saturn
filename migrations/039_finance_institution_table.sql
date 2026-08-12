-- +goose Up
-- +goose StatementBegin
CREATE TABLE finance.institution (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    domain TEXT NOT NULL DEFAULT '',
    logo_url TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT 'indigo',
    version BIGINT NOT NULL DEFAULT 1,
    create_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_finance_institution_space_name ON finance.institution(space_id, name);

ALTER TABLE finance.account ADD COLUMN institution_id TEXT REFERENCES finance.institution(id) ON DELETE SET NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE finance.account DROP COLUMN IF EXISTS institution_id;
DROP TABLE IF EXISTS finance.institution;
-- +goose StatementEnd
