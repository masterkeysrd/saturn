-- +goose Up
-- +goose StatementBegin
CREATE TABLE finance.transaction_events (
    id          TEXT COLLATE "C" PRIMARY KEY,
    space_id    TEXT COLLATE "C" NOT NULL REFERENCES space.space(id) ON DELETE CASCADE,
    txn_id      TEXT COLLATE "C" NOT NULL REFERENCES finance.transaction(id) ON DELETE CASCADE,
    event_type  VARCHAR(50) NOT NULL,
    metadata    JSONB NOT NULL DEFAULT '{}',
    create_time  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_txn_events_lookup ON finance.transaction_events(txn_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS finance.idx_txn_events_lookup;
DROP TABLE IF EXISTS finance.transaction_events;
-- +goose StatementEnd
