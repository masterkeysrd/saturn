-- +goose Up
-- +goose StatementBegin
ALTER TABLE finance.transaction
    ADD COLUMN account_id TEXT COLLATE "C" REFERENCES finance.account(id) ON DELETE SET NULL,
    ADD COLUMN transfer_id TEXT COLLATE "C" REFERENCES finance.transfer(id) ON DELETE CASCADE;

CREATE INDEX idx_transaction_account ON finance.transaction (account_id);
CREATE INDEX idx_transaction_transfer ON finance.transaction (transfer_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS finance.idx_transaction_transfer;
DROP INDEX IF EXISTS finance.idx_transaction_account;
ALTER TABLE finance.transaction DROP COLUMN transfer_id;
ALTER TABLE finance.transaction DROP COLUMN account_id;
-- +goose StatementEnd
