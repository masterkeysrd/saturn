-- +goose Up
-- +goose StatementBegin
CREATE TABLE finance.exchange_rate (
    space_id      TEXT         COLLATE "C" NOT NULL,
    from_currency VARCHAR(3)   NOT NULL,
    to_currency   VARCHAR(3)   NOT NULL,
    rate          NUMERIC(15, 6) NOT NULL,
    rate_date     DATE         NOT NULL,
    create_time   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (space_id, from_currency, to_currency, rate_date),
    CONSTRAINT fk_rate_space FOREIGN KEY (space_id) REFERENCES space.space(id) ON DELETE CASCADE
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS finance.exchange_rate;
-- +goose StatementEnd
