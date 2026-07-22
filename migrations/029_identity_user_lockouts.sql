-- +goose Up
-- Add failed attempts and lockout columns to users table
ALTER TABLE identity.user 
  ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN locked_until TIMESTAMPTZ DEFAULT NULL;

-- Create security events audit log table
CREATE TABLE identity.security_events (
    id TEXT PRIMARY KEY, -- KSUID
    user_id TEXT REFERENCES identity.user(id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- 'login_success', 'login_failed', 'account_locked', 'account_unlocked'
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_security_events_email ON identity.security_events(email);
CREATE INDEX idx_security_events_created_at ON identity.security_events(created_at);

-- +goose Down
DROP TABLE identity.security_events;
ALTER TABLE identity.user 
  DROP COLUMN failed_login_attempts,
  DROP COLUMN locked_until;
