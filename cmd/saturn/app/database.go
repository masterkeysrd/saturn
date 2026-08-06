package app

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/lib/pq"
)

// OpenDB opens a connection to the configured database and pings it.
func OpenDB(cfg *Config) (*sql.DB, error) {
	dsn := cfg.DB.DSN()
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	maxOpen := cfg.DB.MaxOpenConns
	if maxOpen <= 0 {
		maxOpen = 25
	}
	maxIdle := cfg.DB.MaxIdleConns
	if maxIdle <= 0 {
		maxIdle = 10
	}
	connMaxLifetime := cfg.DB.ConnMaxLifetime
	if connMaxLifetime <= 0 {
		connMaxLifetime = 15 * time.Minute
	}
	connMaxIdleTime := cfg.DB.ConnMaxIdleTime
	if connMaxIdleTime <= 0 {
		connMaxIdleTime = 5 * time.Minute
	}

	db.SetMaxOpenConns(maxOpen)
	db.SetMaxIdleConns(maxIdle)
	db.SetConnMaxLifetime(connMaxLifetime)
	db.SetConnMaxIdleTime(connMaxIdleTime)

	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping db: %w", err)
	}

	return db, nil
}
