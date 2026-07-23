-- +goose Up
-- +goose StatementBegin
CREATE TABLE finance.pending_transaction (
    id                   TEXT COLLATE "C" PRIMARY KEY,
    space_id             TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    integration_id       TEXT COLLATE "C" NOT NULL REFERENCES platform.integration(id) ON DELETE CASCADE,
    raw_vendor           VARCHAR(255) NOT NULL,
    suggested_vendor     VARCHAR(255) NOT NULL,
    amount               BIGINT NOT NULL,
    currency             VARCHAR(3) NOT NULL,
    suggested_account_id TEXT COLLATE "C" REFERENCES finance.account(id) ON DELETE SET NULL,
    suggested_budget_id  TEXT COLLATE "C" REFERENCES finance.budget(id) ON DELETE SET NULL,
    suggested_payment_id TEXT COLLATE "C" REFERENCES finance.scheduled_payment(id) ON DELETE SET NULL,
    metadata             JSONB NOT NULL DEFAULT '{}',  -- Integration specific metadata (e.g. sender, subject)
    create_time          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pending_txn_space ON finance.pending_transaction(space_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS finance.idx_pending_txn_space;
DROP TABLE IF EXISTS finance.pending_transaction;
-- +goose StatementEnd
