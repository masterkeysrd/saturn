-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS finance.budgets (
  id UUID PRIMARY KEY,
  space_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color VARCHAR(7) NOT NULL DEFAULT '#2196f3',
  icon_name VARCHAR(32) NOT NULL DEFAULT 'wallet',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  amount_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  amount_cents BIGINT NOT NULL,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', name), 'A') || setweight(
      to_tsvector('english', coalesce(description, '')),
      'B'
    )
  ) STORED,
  create_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  create_by UUID NOT NULL,
  update_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  update_by UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_budgets_space_id ON finance.budgets (space_id);

CREATE INDEX IF NOT EXISTS idx_budgets_space_id_create_time ON finance.budgets (space_id, create_time DESC);

CREATE INDEX IF NOT EXISTS idx_budgets_search_vector ON finance.budgets USING GIN (search_vector);

-- +goose StatementEnd
-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_budgets_search_vector;

DROP INDEX IF EXISTS idx_budgets_space_id_create_time;

DROP INDEX IF EXISTS idx_budgets_space_id;

DROP TABLE IF EXISTS finance.budgets;

-- +goose StatementEnd
