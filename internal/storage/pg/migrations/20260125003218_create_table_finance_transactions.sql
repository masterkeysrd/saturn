-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS finance.transactions (
  id UUID NOT NULL,
  space_id UUID NOT NULL,
  type VARCHAR(12) NOT NULL,
  budget_id UUID,
  budget_period_id UUID,
  title VARCHAR(50) NOT NULL,
  description VARCHAR(250),
  date DATE NOT NULL,
  effective_date DATE NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  amount_currency VARCHAR(3) NOT NULL, -- ISO 4217 code
  base_amount_cents BIGINT NOT NULL CHECK (base_amount_cents >= 0),
  base_amount_currency VARCHAR(3) NOT NULL, -- ISO code for base currency
  exchange_rate DECIMAL(20, 10) NOT NULL CHECK (exchange_rate > 0),
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', title), 'A') || setweight(
      to_tsvector('english', coalesce(description, '')),
      'B'
    )
  ) STORED,
  create_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  create_by UUID NOT NULL,
  update_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  update_by UUID NOT NULL,
  PRIMARY KEY (space_id, id),
  FOREIGN KEY (space_id, budget_id) REFERENCES finance.budgets (space_id, id) ON DELETE CASCADE,
  FOREIGN KEY (space_id, budget_period_id) REFERENCES finance.budget_periods (space_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transactions_space_id_budget_id ON finance.transactions (space_id, budget_id);

CREATE INDEX IF NOT EXISTS idx_transactions_space_id_budget_period_id ON finance.transactions (space_id, budget_period_id);

CREATE INDEX IF NOT EXISTS idx_transactions_space_id_date ON finance.transactions (space_id, date);

CREATE INDEX IF NOT EXISTS idx_transactions_space_id_create_time ON finance.transactions (space_id, create_time DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_space_id_type ON finance.transactions (space_id, type);

CREATE INDEX IF NOT EXISTS idx_transactions_search_vector ON finance.transactions USING GIN (search_vector);

-- +goose StatementEnd
-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_transactions_search_vector;

DROP INDEX IF EXISTS idx_transactions_space_id_type;

DROP INDEX IF EXISTS idx_transactions_space_id_create_time;

DROP INDEX IF EXISTS idx_transactions_space_id_date;

DROP INDEX IF EXISTS idx_transactions_space_id_budget_period_id;

DROP INDEX IF EXISTS idx_transactions_space_id_budget_id;

DROP TABLE IF EXISTS finance.transactions;

-- +goose StatementEnd
