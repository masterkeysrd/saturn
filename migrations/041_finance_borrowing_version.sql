-- +goose Up
-- +goose StatementBegin
ALTER TABLE finance.borrowing ADD COLUMN version BIGINT NOT NULL DEFAULT 1;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE finance.borrowing DROP COLUMN IF EXISTS version;
-- +goose StatementEnd
