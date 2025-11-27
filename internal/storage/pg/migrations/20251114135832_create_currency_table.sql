-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS currencies (
    code        VARCHAR(3) PRIMARY KEY,
    name        VARCHAR(50) NOT NULL,
    rate        DOUBLE PRECISION NOT NULL CHECK (rate > 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_currencies_created_at ON currencies(created_at DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_currencies_created_at;
DROP TABLE IF EXISTS currencies;
-- +goose StatementEnd
