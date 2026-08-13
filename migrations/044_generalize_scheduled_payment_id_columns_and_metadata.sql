-- +goose Up
-- +goose StatementBegin
-- 1. Rename inbox_item.scheduled_payment_id to scheduled_transaction_id
ALTER TABLE finance.inbox_item RENAME COLUMN scheduled_payment_id TO scheduled_transaction_id;
ALTER INDEX IF EXISTS finance.idx_inbox_item_payment RENAME TO idx_inbox_item_scheduled_transaction;

-- 2. Migrate transaction metadata: rename scheduled_payment_id to scheduled_transaction_id
UPDATE finance.transaction
SET metadata = (metadata - 'scheduled_payment_id') || jsonb_build_object('scheduled_transaction_id', metadata->'scheduled_payment_id')
WHERE metadata ? 'scheduled_payment_id';

-- 3. Migrate transaction metadata: rename recurring_expense_id to recurring_transaction_id
UPDATE finance.transaction
SET metadata = (metadata - 'recurring_expense_id') || jsonb_build_object('recurring_transaction_id', metadata->'recurring_expense_id')
WHERE metadata ? 'recurring_expense_id';

-- 4. Re-create partial expression index on finance.transaction for scheduled_transaction_id
DROP INDEX IF EXISTS finance.idx_finance_transaction_scheduled_payment_id;
CREATE INDEX idx_finance_transaction_scheduled_transaction_id 
ON finance.transaction ((metadata->>'scheduled_transaction_id')) 
WHERE metadata->>'scheduled_transaction_id' IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- 1. Restore partial index
DROP INDEX IF EXISTS finance.idx_finance_transaction_scheduled_transaction_id;
CREATE INDEX idx_finance_transaction_scheduled_payment_id 
ON finance.transaction ((metadata->>'scheduled_payment_id')) 
WHERE metadata->>'scheduled_payment_id' IS NOT NULL;

-- 2. Revert transaction metadata changes
UPDATE finance.transaction
SET metadata = (metadata - 'recurring_transaction_id') || jsonb_build_object('recurring_expense_id', metadata->'recurring_transaction_id')
WHERE metadata ? 'recurring_transaction_id';

UPDATE finance.transaction
SET metadata = (metadata - 'scheduled_transaction_id') || jsonb_build_object('scheduled_payment_id', metadata->'scheduled_transaction_id')
WHERE metadata ? 'scheduled_transaction_id';

-- 3. Rename column and index back
ALTER INDEX IF EXISTS finance.idx_inbox_item_scheduled_transaction RENAME TO idx_inbox_item_payment;
ALTER TABLE finance.inbox_item RENAME COLUMN scheduled_transaction_id TO scheduled_payment_id;
-- +goose StatementEnd
