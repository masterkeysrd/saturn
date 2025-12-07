-- +goose Up
-- +goose StatementBegin
CREATE SCHEMA IF NOT EXISTS identity;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP SCHEMA IF EXISTS identity CASCADE;
-- +goose StatementEnd
