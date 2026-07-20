-- +goose Up
-- +goose StatementBegin
CREATE SCHEMA IF NOT EXISTS space;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP SCHEMA IF EXISTS space CASCADE;
-- +goose StatementEnd
