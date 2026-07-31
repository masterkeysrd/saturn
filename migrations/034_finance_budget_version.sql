-- +goose Up
-- +goose StatementBegin
ALTER TABLE finance.budget ADD COLUMN version BIGINT NOT NULL DEFAULT 1;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE finance.budget DROP COLUMN IF EXISTS version;
-- +goose StatementEnd
