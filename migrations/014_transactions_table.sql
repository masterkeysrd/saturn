-- +goose Up
-- +goose StatementBegin
CREATE TABLE finance.transaction (
    id             TEXT         COLLATE "C" NOT NULL,
    space_id       TEXT         COLLATE "C" NOT NULL,
    type           VARCHAR(30)  NOT NULL,
    budget_id      TEXT         COLLATE "C",
    period_id      TEXT         COLLATE "C",
    amount         BIGINT       NOT NULL,
    currency       VARCHAR(3)   NOT NULL,
    amount_in_base BIGINT       NOT NULL,
    description    TEXT         NOT NULL DEFAULT '',
    transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,
    create_time    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_transaction_space FOREIGN KEY (space_id) REFERENCES space.space(id) ON DELETE CASCADE,
    CONSTRAINT fk_transaction_budget FOREIGN KEY (budget_id) REFERENCES finance.budget(id) ON DELETE SET NULL,
    CONSTRAINT fk_transaction_period FOREIGN KEY (period_id) REFERENCES finance.budget_period(id) ON DELETE CASCADE
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_transaction_space ON finance.transaction (space_id);
CREATE INDEX idx_transaction_period ON finance.transaction (period_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS finance.transaction;
-- +goose StatementEnd
