-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS identity.users (
    id UUID PRIMARY KEY,
    username VARCHAR(30) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON identity.users(role);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON identity.users(created_at DESC)
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_users_created_at;
DROP INDEX IF EXISTS idx_users_role;
DROP TABLE IF EXISTS identity.users;
-- +goose StatementEnd
