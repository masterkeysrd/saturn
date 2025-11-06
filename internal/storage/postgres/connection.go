package postgres

import (
	"errors"
	"fmt"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/pkg/env"
)

const DefaultPort = 5432

// NewDefaultConnection loads configuration from environment variables and connects to Postgres.
func NewDefaultConnection() (*sqlx.DB, error) {
	port, _ := env.GetInt("POSTGRES_PORT")

	config := &Config{
		Host:     env.GetString("POSTGRES_HOST"),
		Port:     port,
		User:     env.GetString("POSTGRES_USER"),
		Password: env.GetString("POSTGRES_PASSWORD"),
		Database: env.GetString("POSTGRES_DB"),
		SSLMode:  env.GetString("POSTGRES_SSLMODE"),
	}

	return NewConnection(config)
}

// NewConnection connects to Postgres.
func NewConnection(config *Config) (*sqlx.DB, error) {
	if config.Port == 0 {
		config.Port = DefaultPort
	}

	if err := config.Validate(); err != nil {
		return nil, fmt.Errorf("invalid configuration: %w", err)
	}

	db, err := sqlx.Open("pgx", config.DSN())
	if err != nil {
		return nil, fmt.Errorf("cannot open connection to posgress: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("cannot ping database: %w", err)
	}

	return db, nil
}

type Config struct {
	Host     string
	Port     int
	User     string
	Password string
	Database string
	SSLMode  string
}

func (c *Config) Validate() error {
	if c == nil {
		return errors.New("config cannot be nil")
	}

	if c.Host == "" {
		return errors.New("host cannot be empty")
	}

	if c.Port <= 0 {
		return errors.New("port must be set")
	}

	if c.Password == "" {
		return errors.New("password cannot be empty")
	}

	if c.Database == "" {
		return errors.New("database cannot be empty")
	}

	return nil
}

func (c *Config) DSN() string {
	return fmt.Sprintf(
		"postgres://%s:%s@%s:%d/%s?sslmode=%s",
		c.User,
		c.Password,
		c.Host,
		c.Port,
		c.Database,
		c.SSLMode,
	)
}
