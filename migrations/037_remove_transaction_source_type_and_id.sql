-- +goose Up
-- +goose StatementBegin
DROP INDEX IF EXISTS finance.idx_transaction_source;

ALTER TABLE finance.transaction
DROP COLUMN IF EXISTS source_type,
DROP COLUMN IF EXISTS source_id,
DROP COLUMN IF EXISTS transfer_id;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE finance.transaction
ADD COLUMN source_type VARCHAR(50) DEFAULT NULL,
ADD COLUMN source_id TEXT DEFAULT NULL,
ADD COLUMN transfer_id VARCHAR(64) DEFAULT NULL;

CREATE INDEX idx_transaction_source ON finance.transaction (source_type, source_id);
-- +goose StatementEnd
