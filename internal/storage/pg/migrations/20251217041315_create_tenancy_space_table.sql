-- +goose Up
-- +goose StatementBegin
CREATE TABLE tenancy.spaces (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES identity.users (id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  alias VARCHAR(10),
  description TEXT,
  create_by UUID REFERENCES identity.users (id) ON DELETE SET NULL,
  create_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  update_by UUID REFERENCES identity.users (id) ON DELETE SET NULL,
  update_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delete_by UUID REFERENCES identity.users (id) ON DELETE SET NULL,
  delete_time TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_spaces_owner_id ON tenancy.spaces (owner_id);

CREATE INDEX IF NOT EXISTS idx_spaces_owner_active ON tenancy.spaces (owner_id)
WHERE
  delete_time IS NULL;

CREATE INDEX IF NOT EXISTS idx_spaces_create_time ON tenancy.spaces (create_time DESC);

-- +goose StatementEnd
-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_spaces_owner_id;

DROP INDEX IF EXISTS idx_spaces_owner_active;

DROP INDEX IF EXISTS idx_spaces_create_time;

DROP TABLE IF EXISTS tenancy.spaces;

-- +goose StatementEnd
