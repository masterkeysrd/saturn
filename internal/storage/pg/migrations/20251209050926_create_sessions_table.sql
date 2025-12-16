-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS identity.sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  token_hash TEXT NOT NULL,
  user_agent TEXT,
  client_ip TEXT,
  expire_time TIMESTAMPTZ NOT NULL,
  create_time TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  update_time TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON identity.sessions (user_id);

-- +goose StatementEnd
-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_sessions_user_id;

DROP TABLE IF EXISTS identity.sessions;

-- +goose StatementEnd
