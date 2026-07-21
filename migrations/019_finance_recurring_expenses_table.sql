-- +goose Up
-- +goose StatementBegin
CREATE TABLE finance.recurring_expense (
    id                   TEXT         COLLATE "C" NOT NULL,
    space_id             TEXT         COLLATE "C" NOT NULL,
    budget_id            TEXT         COLLATE "C" NOT NULL,
    name                 VARCHAR(255) NOT NULL,
    amount               BIGINT       NOT NULL,
    currency             VARCHAR(3)   NOT NULL,
    interval             VARCHAR(50)  NOT NULL,
    next_due_date        DATE         NOT NULL,
    is_variable          BOOLEAN      NOT NULL DEFAULT FALSE,
    status               VARCHAR(50)  NOT NULL DEFAULT 'active',
    grace_period_days    INT          NOT NULL DEFAULT 0,
    create_time          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_recurring_space FOREIGN KEY (space_id) REFERENCES space.space(id) ON DELETE CASCADE,
    CONSTRAINT fk_recurring_budget FOREIGN KEY (budget_id) REFERENCES finance.budget(id) ON DELETE SET NULL
);

CREATE INDEX idx_recurring_space ON finance.recurring_expense (space_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS finance.recurring_expense;
-- +goose StatementEnd
