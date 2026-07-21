-- +goose Up
-- +goose StatementBegin
CREATE TABLE finance.transfer (
    id                     TEXT         COLLATE "C" NOT NULL,
    space_id               TEXT         COLLATE "C" NOT NULL,
    source_account_id      TEXT         COLLATE "C" NOT NULL,
    destination_account_id TEXT         COLLATE "C" NOT NULL,
    source_amount          BIGINT       NOT NULL,
    destination_amount     BIGINT       NOT NULL,
    transfer_date          TIMESTAMP WITH TIME ZONE NOT NULL,
    notes                  TEXT         NOT NULL DEFAULT '',
    create_time            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (id),
    CONSTRAINT fk_transfer_space FOREIGN KEY (space_id) REFERENCES space.space(id) ON DELETE CASCADE,
    CONSTRAINT fk_transfer_source_account FOREIGN KEY (source_account_id) REFERENCES finance.account(id) ON DELETE RESTRICT,
    CONSTRAINT fk_transfer_destination_account FOREIGN KEY (destination_account_id) REFERENCES finance.account(id) ON DELETE RESTRICT
);

CREATE INDEX idx_transfer_space ON finance.transfer (space_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE finance.transfer;
-- +goose StatementEnd
