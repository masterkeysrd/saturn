-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS identity.users (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  avatar_url VARCHAR(255),
  username VARCHAR(30) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  create_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  update_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delete_time TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_role ON identity.users (role);

CREATE INDEX IF NOT EXISTS idx_users_create_time ON identity.users (create_time DESC);

-- +goose StatementEnd
-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_users_create_time;

DROP INDEX IF EXISTS idx_users_role;

DROP TABLE IF EXISTS identity.users;

-- +goose StatementEnd
