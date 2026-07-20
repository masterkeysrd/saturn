-- +goose Up
-- +goose StatementBegin
CREATE TABLE finance.budget_period (
    id                     TEXT         COLLATE "C" NOT NULL,
    budget_id              TEXT         COLLATE "C" NOT NULL,
    space_id               TEXT         COLLATE "C" NOT NULL,
    start_date             TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date               TIMESTAMP WITH TIME ZONE NOT NULL,
    limit_amount           BIGINT       NOT NULL,
    currency               VARCHAR(3)   NOT NULL,
    base_currency          VARCHAR(3)   NOT NULL,
    exchange_rate_to_base  NUMERIC(15, 6) NOT NULL,
    create_time            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_period_budget FOREIGN KEY (budget_id) REFERENCES finance.budget(id) ON DELETE CASCADE,
    CONSTRAINT fk_period_space FOREIGN KEY (space_id) REFERENCES space.space(id) ON DELETE CASCADE,
    UNIQUE (budget_id, start_date, end_date)
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_period_space ON finance.budget_period (space_id);
CREATE INDEX idx_period_budget ON finance.budget_period (budget_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS finance.budget_period;
-- +goose StatementEnd
