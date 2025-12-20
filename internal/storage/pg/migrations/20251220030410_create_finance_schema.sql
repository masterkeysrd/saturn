-- +goose Up
-- +goose StatementBegin
CREATE SCHEMA IF NOT EXISTS finance;

-- +goose StatementEnd
-- +goose Down
-- +goose StatementBegin
DROP SCHEMA IF EXISTS finance CASCADE;

-- +goose StatementEnd
