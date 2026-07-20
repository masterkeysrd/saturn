-- +goose Up
-- +goose StatementBegin
CREATE TABLE finance.settings (
    space_id      TEXT         COLLATE "C" NOT NULL,
    base_currency VARCHAR(3)  NOT NULL,
    create_time   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (space_id),
    CONSTRAINT fk_settings_space FOREIGN KEY (space_id) REFERENCES space.space(id) ON DELETE CASCADE
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS finance.settings;
-- +goose StatementEnd
