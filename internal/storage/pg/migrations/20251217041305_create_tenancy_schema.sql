-- +goose Up
-- +goose StatementBegin
CREATE SCHEMA IF NOT EXISTS tenancy;

-- +goose StatementEnd
-- +goose Down
-- +goose StatementBegin
DROP SCHEMA IF EXISTS tenancy CASCADE;

-- +goose StatementEnd
