-- +goose Up
-- +goose StatementBegin
ALTER TABLE finance.budget ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
UPDATE finance.budget SET status = CASE WHEN is_active = true THEN 'active' ELSE 'paused' END;
ALTER TABLE finance.budget DROP COLUMN IF EXISTS is_active;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE finance.budget ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
UPDATE finance.budget SET is_active = (status = 'active');
ALTER TABLE finance.budget DROP COLUMN IF EXISTS status;
-- +goose StatementEnd
