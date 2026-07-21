-- +goose Up
-- +goose StatementBegin
ALTER TABLE finance.budget
    ADD COLUMN default_account_id TEXT COLLATE "C" REFERENCES finance.account(id) ON DELETE SET NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE finance.budget DROP COLUMN default_account_id;
-- +goose StatementEnd
