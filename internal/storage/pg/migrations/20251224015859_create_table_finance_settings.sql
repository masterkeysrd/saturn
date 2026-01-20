-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS finance.settings (
  space_id UUID PRIMARY KEY,
  status VARCHAR(16) NOT NULL DEFAULT 'INCOMPLETE',
  base_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  create_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  create_by UUID NOT NULL,
  update_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  update_by UUID NOT NULL
);

-- +goose StatementEnd
-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS finance.settings;

-- +goose StatementEnd
