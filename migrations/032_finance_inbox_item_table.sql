-- +goose Up
-- +goose StatementBegin
CREATE TABLE finance.inbox_item (
    id                   TEXT         COLLATE "C" PRIMARY KEY,
    space_id             TEXT         COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    integration_id       TEXT         COLLATE "C" NOT NULL REFERENCES platform.integration(id) ON DELETE CASCADE,
    status               VARCHAR(30)  NOT NULL DEFAULT 'pending',
    doc_type             VARCHAR(50)  NOT NULL DEFAULT 'unknown',
    
    amount               BIGINT,
    currency             VARCHAR(3),
    vendor_name          VARCHAR(255),
    transaction_date     TIMESTAMP WITH TIME ZONE,
    
    account_id           TEXT         COLLATE "C" REFERENCES finance.account(id) ON DELETE SET NULL,
    budget_id            TEXT         COLLATE "C" REFERENCES finance.budget(id) ON DELETE SET NULL,
    
    scheduled_payment_id TEXT         COLLATE "C" REFERENCES finance.scheduled_payment(id) ON DELETE SET NULL,
    transaction_id       TEXT         COLLATE "C" REFERENCES finance.transaction(id) ON DELETE SET NULL,
    
    raw_payload          TEXT         NOT NULL DEFAULT '',
    metadata             JSONB        NOT NULL DEFAULT '{}',
    create_time          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inbox_item_space ON finance.inbox_item(space_id);
CREATE INDEX idx_inbox_item_txn ON finance.inbox_item(transaction_id);
CREATE INDEX idx_inbox_item_payment ON finance.inbox_item(scheduled_payment_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS finance.idx_inbox_item_payment;
DROP INDEX IF EXISTS finance.idx_inbox_item_txn;
DROP INDEX IF EXISTS finance.idx_inbox_item_space;
DROP TABLE IF EXISTS finance.inbox_item;
-- +goose StatementEnd
