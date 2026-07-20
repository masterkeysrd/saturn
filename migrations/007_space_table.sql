-- +goose Up
-- +goose StatementBegin
CREATE TABLE space.space (
    id          TEXT         COLLATE "C" PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id    TEXT         NOT NULL,
    version     BIGINT       NOT NULL DEFAULT 1,
    create_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_space_owner FOREIGN KEY (owner_id) REFERENCES identity.user(id) ON DELETE RESTRICT
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_space_owner ON space.space (owner_id);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE UNIQUE INDEX idx_space_name_owner ON space.space (name, owner_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS space.space;
-- +goose StatementEnd
