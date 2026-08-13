-- +goose Up
-- +goose StatementBegin
ALTER TABLE finance.recurring_expense ADD COLUMN version BIGINT NOT NULL DEFAULT 1;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE finance.recurring_expense DROP COLUMN IF EXISTS version;
-- +goose StatementEnd
