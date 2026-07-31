-- +goose Up
-- +goose StatementBegin
-- 1. Ensure metadata JSONB column exists on finance.transaction
ALTER TABLE finance.transaction ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

-- 2. Create partial expression indexes for metadata links on finance.transaction
CREATE INDEX IF NOT EXISTS idx_finance_transaction_borrowing_id 
ON finance.transaction ((metadata->>'borrowing_id')) 
WHERE metadata->>'borrowing_id' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_finance_transaction_scheduled_payment_id 
ON finance.transaction ((metadata->>'scheduled_payment_id')) 
WHERE metadata->>'scheduled_payment_id' IS NOT NULL;

-- 3. Migrate existing records from finance.borrowing_repayment into finance.transaction (if any exist)
INSERT INTO finance.transaction (
    id, space_id, type, budget_id, period_id, account_id, transfer_id,
    amount, currency, amount_in_base, description, transaction_date, effective_date,
    source_type, source_id, metadata, create_time, update_time
)
SELECT
    r.id,
    b.space_id,
    CASE 
        WHEN b.direction = 'LENT' THEN 'INCOME' 
        ELSE 'EXPENSE' 
    END,
    NULL,
    NULL,
    r.account_id,
    NULL,
    r.amount,
    b.currency,
    r.amount,
    COALESCE(NULLIF(r.notes, ''), 'Borrowing Repayment'),
    r.payment_date,
    r.payment_date,
    'borrowing_repayment',
    r.borrowing_id,
    jsonb_build_object(
        'borrowing_id', r.borrowing_id,
        'borrowing_role', 'REPAYMENT',
        'notes', COALESCE(r.notes, '')
    ),
    r.create_time,
    r.update_time
FROM finance.borrowing_repayment r
JOIN finance.borrowing b ON r.borrowing_id = b.id
ON CONFLICT (id) DO NOTHING;

-- 4. Drop legacy child table finance.borrowing_repayment
DROP TABLE IF EXISTS finance.borrowing_repayment;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS finance.borrowing_repayment (
    id           TEXT PRIMARY KEY COLLATE "C",
    borrowing_id TEXT NOT NULL REFERENCES finance.borrowing(id) ON DELETE CASCADE,
    amount       BIGINT NOT NULL CHECK (amount > 0),
    payment_date TIMESTAMPTZ NOT NULL,
    notes        TEXT NOT NULL DEFAULT '',
    account_id   TEXT REFERENCES finance.account(id) ON DELETE SET NULL,
    create_time  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP INDEX IF EXISTS idx_finance_transaction_scheduled_payment_id;
DROP INDEX IF EXISTS idx_finance_transaction_borrowing_id;
ALTER TABLE finance.transaction DROP COLUMN IF EXISTS metadata;
-- +goose StatementEnd
