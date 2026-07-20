-- +goose Up
-- +goose StatementBegin
CREATE TABLE finance.budget (
    id           TEXT         COLLATE "C" NOT NULL,
    space_id     TEXT         COLLATE "C" NOT NULL,
    name         VARCHAR(255) NOT NULL,
    limit_amount BIGINT       NOT NULL,
    currency     VARCHAR(3)   NOT NULL,
    interval     VARCHAR(50)  NOT NULL,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    icon         VARCHAR(50)  NOT NULL DEFAULT 'piggy-bank',
    color        VARCHAR(50)  NOT NULL DEFAULT 'indigo',
    create_time  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_budget_space FOREIGN KEY (space_id) REFERENCES space.space(id) ON DELETE CASCADE
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_budget_space ON finance.budget (space_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS finance.budget;
-- +goose StatementEnd
