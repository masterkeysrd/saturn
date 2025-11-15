-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS transactions (
    id                      UUID PRIMARY KEY,
    type                    VARCHAR(12) NOT NULL,
    budget_id               UUID REFERENCES budgets(id) ON DELETE CASCADE,
    name                    VARCHAR(50) NOT NULL,
    description             VARCHAR(250),
    date                    DATE NOT NULL,
    amount_cents            BIGINT NOT NULL CHECK (amount_cents >= 0),
    amount_currency         VARCHAR(3) NOT NULL, -- ISO 4217 code
    base_amount_cents       BIGINT NOT NULL CHECK (base_amount_cents >= 0),
    base_amount_currency    VARCHAR(3) NOT NULL, -- ISO code for base currency
    exchange_rate           DOUBLE PRECISION NOT NULL CHECK (exchange_rate > 0),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_budget_id ON transactions(budget_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_transactions_date;
DROP INDEX IF EXISTS idx_transactions_type;
DROP INDEX IF EXISTS idx_transactions_budget_id;
DROP TABLE IF EXISTS transactions;
-- +goose StatementEnd
