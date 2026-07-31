-- +goose Up
-- +goose StatementBegin
ALTER TABLE finance.inbox_item ADD COLUMN borrowing_id TEXT COLLATE "C" REFERENCES finance.borrowing(id) ON DELETE SET NULL;
ALTER TABLE finance.inbox_item ADD COLUMN borrowing_link_type VARCHAR(50);
CREATE INDEX idx_inbox_item_borrowing ON finance.inbox_item(borrowing_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS finance.idx_inbox_item_borrowing;
ALTER TABLE finance.inbox_item DROP COLUMN IF EXISTS borrowing_link_type;
ALTER TABLE finance.inbox_item DROP COLUMN IF EXISTS borrowing_id;
-- +goose StatementEnd
