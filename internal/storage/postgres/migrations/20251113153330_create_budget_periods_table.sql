-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS budget_periods (
    id                  UUID PRIMARY KEY,
    budget_id           UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    amount_cents        BIGINT NOT NULL CHECK (amount_cents >= 0),
    amount_currency     VARCHAR(3) NOT NULL, -- ISO 4217 code
    base_amount_cents   BIGINT NOT NULL CHECK (base_amount_cents >= 0),
    base_amount_currency VARCHAR(3) NOT NULL, -- ISO code for base currency
    exchange_rate       DOUBLE PRECISION NOT NULL CHECK (exchange_rate > 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_periods_budget_id ON budget_periods(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_periods_dates ON budget_periods(start_date, end_date);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_budget_periods_dates;
DROP INDEX IF EXISTS idx_budget_periods_budget_id;
DROP TABLE IF EXISTS budget_periods;
-- +goose StatementEnd
