-- +goose Up
-- +goose StatementBegin
CREATE TABLE identity.user (
    id          TEXT         COLLATE "C" PRIMARY KEY,
    email       VARCHAR(255) NOT NULL UNIQUE,
    username    VARCHAR(100) NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL,
    avatar_url  TEXT,
    status      VARCHAR(50)  NOT NULL DEFAULT 'active',
    version     BIGINT       NOT NULL DEFAULT 1,
    create_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_user_email ON identity.user (email);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE UNIQUE INDEX idx_user_username ON identity.user (username);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS identity.user_credentials;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS identity.user;
-- +goose StatementEnd
