-- +goose Up
-- +goose StatementBegin
CREATE TABLE identity.user_credentials (
    user_id      TEXT         NOT NULL REFERENCES identity.user(id) ON DELETE CASCADE,
    auth_type    VARCHAR(50)  NOT NULL,
    secret_data  TEXT         NOT NULL,
    PRIMARY KEY (user_id, auth_type)
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS identity.user_credentials;
-- +goose StatementEnd
