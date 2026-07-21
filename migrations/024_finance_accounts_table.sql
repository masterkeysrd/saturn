-- +goose Up
-- +goose StatementBegin
CREATE TABLE finance.account (
    id              TEXT         COLLATE "C" NOT NULL,
    space_id        TEXT         COLLATE "C" NOT NULL,
    name            VARCHAR(255) NOT NULL,
    type            VARCHAR(30)  NOT NULL,
    currency        VARCHAR(3)   NOT NULL,
    initial_balance BIGINT       NOT NULL DEFAULT 0,
    current_balance BIGINT       NOT NULL DEFAULT 0,
    credit_limit    BIGINT       NOT NULL DEFAULT 0,
    is_default      BOOLEAN      NOT NULL DEFAULT false,
    is_active       BOOLEAN      NOT NULL DEFAULT true,
    color           VARCHAR(7)   NOT NULL DEFAULT '#6366f1',
    notes           TEXT         NOT NULL DEFAULT '',
    last_four       VARCHAR(4)   NOT NULL DEFAULT '',
    create_time     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (id),
    CONSTRAINT fk_account_space FOREIGN KEY (space_id) REFERENCES space.space(id) ON DELETE CASCADE
);

CREATE INDEX idx_account_space ON finance.account (space_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE finance.account;
-- +goose StatementEnd
