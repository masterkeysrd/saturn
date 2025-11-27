-- +goose Up
-- +goose StatementBegin

-- 1. Add the column (Nullable initially)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS budget_period_id UUID;

-- 2. Backfill: The Temporal Join
-- We join transactions to periods based on Budget ID + Date Range
UPDATE transactions t
SET budget_period_id = bp.id
FROM budget_periods bp
WHERE t.budget_id = bp.budget_id
  AND t.date >= bp.start_date
  AND t.date <= bp.end_date;

-- 3. Add "Type Integrity" Check
-- Enforce rule:
-- IF type is 'expense' -> MUST have both budget_id and budget_period_id.
-- IF type is NOT 'expense' (e.g. income) -> MUST have NULL budget_id and NULL budget_period_id.
ALTER TABLE transactions
ADD CONSTRAINT transactions_type_expense_integrity_check
CHECK (
    (type = 'expense' AND budget_id IS NOT NULL AND budget_period_id IS NOT NULL)
    OR
    (type <> 'expense' AND budget_id IS NULL AND budget_period_id IS NULL)
);

-- 4. Add Foreign Key
-- Note: Constraint name collision will cause failure if the constraint already exists.
ALTER TABLE transactions
ADD CONSTRAINT transactions_budget_period_id_fkey
FOREIGN KEY (budget_period_id)
REFERENCES budget_periods(id)
ON DELETE CASCADE;

-- 5. Add Index (Crucial for performance)
-- Use IF NOT EXISTS to ensure idempotency.
CREATE INDEX IF NOT EXISTS idx_transactions_period_id ON transactions(budget_period_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Drop Constraint (Use IF EXISTS for safe rollback)
ALTER TABLE transactions
DROP CONSTRAINT IF EXISTS transactions_type_expense_integrity_check;

-- Drop Foreign Key (Need to drop FK before dropping the column)
ALTER TABLE transactions
DROP CONSTRAINT IF EXISTS transactions_budget_period_id_fkey;

-- Drop Index (Use IF EXISTS for safe rollback)
DROP INDEX IF EXISTS idx_transactions_period_id;

-- Drop Column (Use IF EXISTS for safe rollback)
ALTER TABLE transactions 
DROP COLUMN IF EXISTS budget_period_id;

-- +goose StatementEnd
