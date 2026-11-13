-- +goose Up
-- +goose StatementBegin
ALTER TABLE mail.sync_states
    ADD COLUMN exhausted_buckets TEXT[] NOT NULL DEFAULT '{}';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE mail.sync_states
    DROP COLUMN IF EXISTS exhausted_buckets;
-- +goose StatementEnd
