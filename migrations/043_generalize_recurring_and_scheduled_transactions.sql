-- +goose Up
-- +goose StatementBegin
-- 1. Rename recurring_expense to recurring_transaction
ALTER TABLE finance.recurring_expense RENAME TO recurring_transaction;

-- 2. Rename scheduled_payment to scheduled_transaction
ALTER TABLE finance.scheduled_payment RENAME TO scheduled_transaction;

-- 3. Make budget_id nullable in both tables
ALTER TABLE finance.recurring_transaction ALTER COLUMN budget_id DROP NOT NULL;
ALTER TABLE finance.scheduled_transaction ALTER COLUMN budget_id DROP NOT NULL;

-- 4. Add type and account_id columns
ALTER TABLE finance.recurring_transaction ADD COLUMN type VARCHAR(30) NOT NULL DEFAULT 'EXPENSE';
ALTER TABLE finance.recurring_transaction ADD COLUMN account_id TEXT COLLATE "C" REFERENCES finance.account(id) ON DELETE SET NULL;

ALTER TABLE finance.scheduled_transaction ADD COLUMN type VARCHAR(30) NOT NULL DEFAULT 'EXPENSE';
ALTER TABLE finance.scheduled_transaction ADD COLUMN account_id TEXT COLLATE "C" REFERENCES finance.account(id) ON DELETE SET NULL;

-- 5. Add indexes
CREATE INDEX idx_recurring_txn_account ON finance.recurring_transaction (account_id);
CREATE INDEX idx_scheduled_txn_account ON finance.scheduled_transaction (account_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- 1. Drop indexes
DROP INDEX IF EXISTS finance.idx_scheduled_txn_account;
DROP INDEX IF EXISTS finance.idx_recurring_txn_account;

-- 2. Drop columns
ALTER TABLE finance.scheduled_transaction DROP COLUMN IF EXISTS account_id;
ALTER TABLE finance.scheduled_transaction DROP COLUMN IF EXISTS type;

ALTER TABLE finance.recurring_transaction DROP COLUMN IF EXISTS account_id;
ALTER TABLE finance.recurring_transaction DROP COLUMN IF EXISTS type;

-- 3. Restore budget_id NOT NULL constraint
ALTER TABLE finance.scheduled_transaction ALTER COLUMN budget_id SET NOT NULL;
ALTER TABLE finance.recurring_transaction ALTER COLUMN budget_id SET NOT NULL;

-- 4. Rename tables back
ALTER TABLE finance.scheduled_transaction RENAME TO scheduled_payment;
ALTER TABLE finance.recurring_transaction RENAME TO recurring_expense;
-- +goose StatementEnd
