-- +goose Up
-- +goose StatementBegin
CREATE TABLE finance.statement (
    id VARCHAR(255) PRIMARY KEY, -- Prefix 'stmt_'
    space_id VARCHAR(255) NOT NULL,
    account_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS', -- 'IN_PROGRESS', 'COMPLETED'
    
    statement_date DATE NOT NULL,
    statement_starting_balance BIGINT NOT NULL, -- Cents
    statement_ending_balance BIGINT NOT NULL, -- Cents
    
    filename VARCHAR(255) NOT NULL,
    column_mapping JSONB NOT NULL, -- Maps header indices { "date": 0, "desc": 1, "amount": 2 }
    raw_content TEXT NOT NULL, -- Original statement file text for audits/re-parsing
    
    create_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 1,
    
    FOREIGN KEY (account_id) REFERENCES finance.account(id) ON DELETE CASCADE
);

CREATE TABLE finance.statement_line (
    id VARCHAR(255) PRIMARY KEY, -- Prefix 'stln_'
    statement_id VARCHAR(255) NOT NULL,
    row_index INT NOT NULL,
    
    date_str VARCHAR(255) NOT NULL,
    description VARCHAR(255) NOT NULL,
    amount BIGINT NOT NULL, -- Parsed cents in account currency
    reference VARCHAR(255) NULL, -- Optional bank reference code, check number, or FitID
    
    -- Extensible JSONB column representing the draft action choice. Default is '{}' (Pending review).
    action JSONB NOT NULL DEFAULT '{}', 
    
    -- Matching state
    status VARCHAR(50) NOT NULL DEFAULT 'UNMATCHED', -- 'UNMATCHED', 'MATCHED', 'IMPORTED', 'SKIPPED'
    matched_transaction_id VARCHAR(255) NULL, -- Linked transaction ID once statement is COMPLETED
    version BIGINT NOT NULL DEFAULT 1,
    
    FOREIGN KEY (statement_id) REFERENCES finance.statement(id) ON DELETE CASCADE,
    FOREIGN KEY (matched_transaction_id) REFERENCES finance.transaction(id) ON DELETE SET NULL
);

-- Performance indexes
CREATE INDEX idx_finance_statement_space ON finance.statement (space_id);
CREATE INDEX idx_finance_statement_account ON finance.statement (account_id);
CREATE INDEX idx_finance_statement_line_statement ON finance.statement_line (statement_id);
CREATE INDEX idx_finance_statement_line_matched ON finance.statement_line (matched_transaction_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS finance.idx_finance_statement_line_matched;
DROP INDEX IF EXISTS finance.idx_finance_statement_line_statement;
DROP INDEX IF EXISTS finance.idx_finance_statement_account;
DROP INDEX IF EXISTS finance.idx_finance_statement_space;

DROP TABLE IF EXISTS finance.statement_line;
DROP TABLE IF EXISTS finance.statement;
-- +goose StatementEnd
