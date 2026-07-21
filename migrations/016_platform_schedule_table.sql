-- +goose Up
-- +goose StatementBegin
CREATE TABLE platform.schedule (
    id              TEXT         COLLATE "C" NOT NULL,
    job_type        VARCHAR(100) NOT NULL,
    payload         JSONB        NOT NULL DEFAULT '{}',
    cron_expression VARCHAR(50)  NOT NULL,
    next_run_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    status          VARCHAR(50)  NOT NULL DEFAULT 'active',
    create_time     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id)
);

CREATE INDEX idx_schedule_next_run ON platform.schedule (next_run_at, status) WHERE status = 'active';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS platform.schedule;
-- +goose StatementEnd
