-- +goose Up
-- +goose StatementBegin
ALTER TABLE budgets ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'USD';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE budgets DROP COLUMN currency;
-- +goose StatementEnd
