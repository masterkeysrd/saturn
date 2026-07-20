-- +goose Up
-- +goose StatementBegin
CREATE TABLE space.member (
    space_id    TEXT         COLLATE "C" NOT NULL,
    user_id     TEXT         COLLATE "C" NOT NULL,
    role        VARCHAR(50)  NOT NULL DEFAULT 'member',
    create_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (space_id, user_id),
    CONSTRAINT fk_member_space FOREIGN KEY (space_id) REFERENCES space.space(id) ON DELETE CASCADE,
    CONSTRAINT fk_member_user FOREIGN KEY (user_id) REFERENCES identity.user(id) ON DELETE CASCADE
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_member_user ON space.member (user_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS space.member;
-- +goose StatementEnd
