-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS identity.bindings (
  user_id UUID NOT NULL,
  provider VARCHAR(255) NOT NULL,
  subject_id VARCHAR(255) NOT NULL,
  create_time TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  update_time TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  PRIMARY KEY (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_identity_bindings_provider_subject ON identity.bindings (provider, subject_id);

CREATE INDEX IF NOT EXISTS idx_identity_bindings_user_id_create_time ON identity.bindings (user_id, create_time);

-- +goose StatementEnd
-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_identity_bindings_provider_subject;

DROP INDEX IF EXISTS idx_identity_bindings_user_id_create_time;

-- +goose StatementEnd
