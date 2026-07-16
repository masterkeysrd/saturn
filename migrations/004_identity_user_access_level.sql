-- +goose Up
-- +goose StatementBegin
ALTER TABLE identity.user ADD COLUMN access_level VARCHAR(20) NOT NULL DEFAULT 'user';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE identity.user DROP COLUMN IF EXISTS access_level;
-- +goose StatementEnd
