-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS finance.budget_periods (
  id UUID,
  space_id UUID NOT NULL,
  budget_id UUID NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  amount_currency VARCHAR(3) NOT NULL, -- ISO 4217 code
  base_amount_cents BIGINT NOT NULL CHECK (base_amount_cents >= 0),
  base_amount_currency VARCHAR(3) NOT NULL, -- ISO code for base currency
  exchange_rate DECIMAL(20, 10) NOT NULL CHECK (exchange_rate > 0),
  create_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  create_by UUID NOT NULL,
  update_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  update_by UUID NOT NULL,
  PRIMARY KEY (space_id, id),
  FOREIGN KEY (space_id, budget_id) REFERENCES finance.budgets (space_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_budget_periods_space_id_budget_id ON finance.budget_periods (space_id, budget_id);

CREATE INDEX IF NOT EXISTS idx_budget_periods_space_id_dates ON finance.budget_periods (space_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_budget_periods_space_id_create_time ON finance.budget_periods (space_id, create_time DESC);

-- +goose StatementEnd
-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_budget_periods_space_id_create_time;

DROP INDEX IF EXISTS idx_budget_periods_space_id_dates;

DROP INDEX IF EXISTS idx_budget_periods_space_id_budget_id;

DROP TABLE IF EXISTS finance.budget_periods;

-- +goose StatementEnd
