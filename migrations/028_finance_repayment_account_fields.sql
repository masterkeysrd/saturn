-- +goose Up
-- +goose StatementBegin
ALTER TABLE finance.borrowing_repayment
    ADD COLUMN account_id TEXT COLLATE "C" REFERENCES finance.account(id) ON DELETE SET NULL;

CREATE INDEX idx_repayment_account ON finance.borrowing_repayment (account_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS finance.idx_repayment_account;
ALTER TABLE finance.borrowing_repayment DROP COLUMN account_id;
-- +goose StatementEnd
