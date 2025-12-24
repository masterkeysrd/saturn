-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS finance.exchange_rates (
  space_id UUID NOT NULL,
  currency_code VARCHAR(3) NOT NULL,
  rate DECIMAL(20, 10) NOT NULL,
  is_base BOOLEAN NOT NULL DEFAULT FALSE,
  create_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  create_by UUID NOT NULL,
  update_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  update_by UUID NOT NULL,
  PRIMARY KEY (space_id, currency_code)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_space_id ON finance.exchange_rates (space_id);

-- Prevent multiple base currencies per space
CREATE INDEX IF NOT EXISTS idx_exchange_rates_one_is_base ON finance.exchange_rates (space_id)
WHERE
  is_base = TRUE;

-- +goose StatementEnd
-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_exchange_rates_one_is_base;

DROP INDEX IF EXISTS idx_exchange_rates_space_id;

DROP TABLE IF EXISTS finance.exchange_rates;

-- +goose StatementEnd
