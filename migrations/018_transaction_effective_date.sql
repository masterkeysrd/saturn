-- +goose Up
-- +goose StatementBegin
ALTER TABLE finance.transaction ADD COLUMN effective_date DATE;
UPDATE finance.transaction SET effective_date = transaction_date;
ALTER TABLE finance.transaction ALTER COLUMN effective_date SET NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE finance.transaction DROP COLUMN IF EXISTS effective_date;
-- +goose StatementEnd
