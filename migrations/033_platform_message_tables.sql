-- +goose Up
-- +goose StatementBegin
CREATE TABLE platform.messages (
    id                 TEXT         COLLATE "C" NOT NULL,
    topic              VARCHAR(100) NOT NULL,
    headers            JSONB        NOT NULL DEFAULT '{}',
    payload            BYTEA        NOT NULL,
    create_time        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id)
);

CREATE INDEX idx_platform_messages_topic ON platform.messages (topic, create_time DESC);

CREATE TABLE platform.message_deliveries (
    id                 TEXT         COLLATE "C" NOT NULL,
    message_id         TEXT         COLLATE "C" NOT NULL,
    subscriber_id      VARCHAR(100) NOT NULL,
    status             VARCHAR(50)  NOT NULL DEFAULT 'pending',
    attempts           INT          NOT NULL DEFAULT 0,
    max_attempts       INT          NOT NULL DEFAULT 5,
    last_error         TEXT,
    schedule_time      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    create_time        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_delivery_message FOREIGN KEY (message_id) REFERENCES platform.messages(id) ON DELETE CASCADE,
    CONSTRAINT uq_message_subscriber UNIQUE (message_id, subscriber_id)
);

CREATE INDEX idx_platform_message_deliveries_poll ON platform.message_deliveries (schedule_time, status) WHERE status IN ('pending', 'failed');
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS platform.message_deliveries;
DROP TABLE IF EXISTS platform.messages;
-- +goose StatementEnd
