-- +goose Up
-- +goose StatementBegin
ALTER TABLE budgets
ADD COLUMN IF NOT EXISTS color VARCHAR(7) NOT NULL DEFAULT '#2196f3';

ALTER TABLE budgets
ADD COLUMN IF NOT EXISTS icon_name VARCHAR(32) NOT NULL DEFAULT 'wallet';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE budgets
DROP COLUMN IF EXISTS color;

ALTER TABLE budgets
DROP COLUMN IF EXISTS icon_name;
-- +goose StatementEnd
