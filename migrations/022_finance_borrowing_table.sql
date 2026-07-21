-- +goose Up
-- +goose StatementBegin
CREATE TABLE finance.borrowing (
    id               TEXT         COLLATE "C" NOT NULL,
    space_id         TEXT         COLLATE "C" NOT NULL,
    direction        VARCHAR(20)  NOT NULL,                  -- 'LENT' or 'BORROWED'
    counterparty     TEXT         NOT NULL,                  -- Counterparty name
    contact_info     TEXT         NOT NULL DEFAULT '',       -- Optional contact details
    total_amount     BIGINT       NOT NULL,                  -- Amount in cents
    remaining_amount BIGINT       NOT NULL,                  -- Remaining amount in cents
    currency         VARCHAR(3)   NOT NULL,                  -- ISO Currency code (e.g. 'USD')
    status           VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE' or 'PAID_OFF'
    established_at   TIMESTAMP WITH TIME ZONE NOT NULL,      -- Borrowing start date
    due_at           TIMESTAMP WITH TIME ZONE,               -- Optional due date
    notes            TEXT         NOT NULL DEFAULT '',
    create_time      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (id),
    CONSTRAINT fk_borrowing_space FOREIGN KEY (space_id) REFERENCES space.space(id) ON DELETE CASCADE
);

CREATE INDEX idx_borrowing_space ON finance.borrowing (space_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS finance.borrowing;
-- +goose StatementEnd
