-- +goose Up
-- +goose StatementBegin
CREATE TABLE tenancy.memberships (
  user_id UUID NOT NULL REFERENCES identity.users (id) ON DELETE RESTRICT,
  space_id UUID NOT NULL REFERENCES tenancy.spaces (id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
  join_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  create_by UUID REFERENCES identity.users (id) ON DELETE SET NULL,
  create_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  update_by UUID REFERENCES identity.users (id) ON DELETE SET NULL,
  update_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, space_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_one_owner_per_space ON tenancy.memberships (space_id)
WHERE
  role = 'OWNER';

CREATE INDEX idx_memberships_space_members ON tenancy.memberships (space_id, join_time DESC);

CREATE INDEX idx_memberships_user_spaces ON tenancy.memberships (user_id);

-- +goose StatementEnd
-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_memberships_one_owner_per_space;

DROP INDEX IF EXISTS idx_memberships_space_members;

DROP INDEX IF EXISTS idx_memberships_user_spaces;

DROP TABLE IF EXISTS tenancy.memberships;

-- +goose StatementEnd
