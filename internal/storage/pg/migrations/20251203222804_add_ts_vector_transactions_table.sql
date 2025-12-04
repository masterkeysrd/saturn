-- +goose Up
-- +goose StatementBegin
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS searchable_text TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', name), 'A') || 
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
) STORED;

CREATE INDEX IF NOT EXISTS idx_transactions_fts ON transactions USING GIN (searchable_text);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_transactions_fts;
ALTER TABLE transactions DROP COLUMN IF EXISTS searchable_text;
-- +goose StatementEnd
