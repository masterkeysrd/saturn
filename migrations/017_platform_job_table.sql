-- +goose Up
-- +goose StatementBegin
CREATE TABLE platform.job (
    id                 TEXT         COLLATE "C" NOT NULL,
    schedule_id        TEXT         COLLATE "C",
    job_type           VARCHAR(100) NOT NULL,
    payload            JSONB        NOT NULL DEFAULT '{}',
    run_at             TIMESTAMP WITH TIME ZONE NOT NULL,
    status             VARCHAR(50)  NOT NULL DEFAULT 'pending',
    attempts           INT          NOT NULL DEFAULT 0,
    max_attempts       INT          NOT NULL DEFAULT 5,
    last_error         TEXT,
    create_time        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    CONSTRAINT fk_job_schedule FOREIGN KEY (schedule_id) REFERENCES platform.schedule(id) ON DELETE CASCADE
);

CREATE INDEX idx_platform_job_poll ON platform.job (run_at, status) WHERE status = 'pending';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS platform.job;
-- +goose StatementEnd
