-- +goose Up
-- +goose StatementBegin
CREATE SCHEMA IF NOT EXISTS platform;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP SCHEMA IF EXISTS platform;
-- +goose StatementEnd
