-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS budgets (
    id              UUID PRIMARY KEY,
    name            TEXT NOT NULL,
    amount          BIGINT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_budgets_created_at ON budgets(created_at DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_budgets_created_at;
DROP TABLE IF EXISTS budgets;
-- +goose StatementEnd
