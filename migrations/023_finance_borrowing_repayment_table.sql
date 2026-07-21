-- +goose Up
-- +goose StatementBegin
CREATE TABLE finance.borrowing_repayment (
    id               TEXT         COLLATE "C" NOT NULL,
    borrowing_id     TEXT         COLLATE "C" NOT NULL,
    space_id         TEXT         COLLATE "C" NOT NULL,
    amount           BIGINT       NOT NULL,                  -- Payment amount in cents
    payment_date     TIMESTAMP WITH TIME ZONE NOT NULL,      -- Repayment date
    notes            TEXT         NOT NULL DEFAULT '',
    create_time      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (id),
    CONSTRAINT fk_repayment_borrowing FOREIGN KEY (borrowing_id) REFERENCES finance.borrowing(id) ON DELETE CASCADE,
    CONSTRAINT fk_repayment_space FOREIGN KEY (space_id) REFERENCES space.space(id) ON DELETE CASCADE
);

CREATE INDEX idx_borrowing_repayment_parent ON finance.borrowing_repayment (borrowing_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS finance.borrowing_repayment;
-- +goose StatementEnd
