-- +goose Up
-- +goose StatementBegin
CREATE TABLE finance.scheduled_payment (
    id                   TEXT         COLLATE "C" NOT NULL,
    space_id             TEXT         COLLATE "C" NOT NULL,
    budget_id            TEXT         COLLATE "C" NOT NULL,
    source_type          VARCHAR(50)  NOT NULL,
    source_id            TEXT         NOT NULL,
    amount               BIGINT       NOT NULL,
    currency             VARCHAR(3)   NOT NULL,
    due_date             DATE         NOT NULL,
    status               VARCHAR(50)  NOT NULL DEFAULT 'pending',
    metadata             JSONB,
    create_time          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_scheduled_space FOREIGN KEY (space_id) REFERENCES space.space(id) ON DELETE CASCADE,
    CONSTRAINT fk_scheduled_budget FOREIGN KEY (budget_id) REFERENCES finance.budget(id) ON DELETE SET NULL
);

CREATE INDEX idx_scheduled_source ON finance.scheduled_payment (source_type, source_id);
CREATE INDEX idx_scheduled_due ON finance.scheduled_payment (due_date);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS finance.scheduled_payment;
-- +goose StatementEnd
