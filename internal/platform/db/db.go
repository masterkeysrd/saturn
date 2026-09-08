package db

import (
	"context"
	"database/sql"
	"fmt"
	"sync"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// DB represents Saturn's unified, context-first database executor.
// Both *Client and *Tx implement DB.
type DB interface {
	// Get queries a single row into dest. Returns KindNotExist if no rows match.
	Get(ctx context.Context, dest any, query string, args ...any) error

	// Select queries multiple rows into dest slice.
	Select(ctx context.Context, dest any, query string, args ...any) error

	// Exec executes a query without returning any rows.
	Exec(ctx context.Context, query string, args ...any) (sql.Result, error)

	// ExecOne executes a query and verifies that exactly one row was affected.
	// Returns KindNotExist if 0 rows were affected.
	ExecOne(ctx context.Context, query string, args ...any) error

	// Rebind transforms query bindvars into the driver's native parameter format.
	Rebind(query string) string
}

// Transactor defines an interface for running work inside a transaction.
type Transactor interface {
	WithTx(ctx context.Context, fn func(tx DB) error) error
}

// ErrorTranslator translates a driver-specific error into a platform error.
// It returns the translated error, or nil if the error was not recognized by the translator.
type ErrorTranslator func(err error) error

var (
	translatorsMu sync.RWMutex
	translators   = make(map[string]ErrorTranslator)
)

// RegisterTranslator registers an ErrorTranslator for a specific SQL driver name (e.g. "postgres").
func RegisterTranslator(driverName string, t ErrorTranslator) {
	translatorsMu.Lock()
	defer translatorsMu.Unlock()
	translators[driverName] = t
}

// LookupTranslator returns the registered ErrorTranslator for the given driver name, or nil.
func LookupTranslator(driverName string) ErrorTranslator {
	translatorsMu.RLock()
	defer translatorsMu.RUnlock()
	return translators[driverName]
}

// Option configures a Client.
type Option func(*Client)

// WithTranslator configures a custom ErrorTranslator for the Client.
func WithTranslator(t ErrorTranslator) Option {
	return func(c *Client) {
		c.translator = t
	}
}

// Client wraps *sqlx.DB to transparently intercept errors and translate them into platform errors.
type Client struct {
	db         *sqlx.DB
	translator ErrorTranslator
}

// New creates a new Client wrapping the provided *sqlx.DB.
// If an ErrorTranslator is registered for db.DriverName(), it will be automatically used.
func New(database *sqlx.DB, opts ...Option) *Client {
	c := &Client{db: database}
	if database != nil {
		c.translator = LookupTranslator(database.DriverName())
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

// Raw returns the underlying *sqlx.DB handle for low-level or un-intercepted operations.
func (c *Client) Raw() *sqlx.DB {
	return c.db
}

// Translator returns the active ErrorTranslator for this Client.
func (c *Client) Translator() ErrorTranslator {
	return c.translator
}

// Get queries a single row into dest, mapping sql.ErrNoRows to KindNotExist.
func (c *Client) Get(ctx context.Context, dest any, query string, args ...any) error {
	err := c.db.GetContext(ctx, dest, query, args...)
	return c.translateError(err)
}

// Select queries multiple rows into dest slice.
func (c *Client) Select(ctx context.Context, dest any, query string, args ...any) error {
	err := c.db.SelectContext(ctx, dest, query, args...)
	return c.translateError(err)
}

// Exec executes a query without returning any rows.
func (c *Client) Exec(ctx context.Context, query string, args ...any) (sql.Result, error) {
	res, err := c.db.ExecContext(ctx, query, args...)
	return res, c.translateError(err)
}

// ExecOne executes a query and verifies that exactly one row was affected.
// If 0 rows were affected, it returns KindNotExist.
func (c *Client) ExecOne(ctx context.Context, query string, args ...any) error {
	res, err := c.db.ExecContext(ctx, query, args...)
	if err != nil {
		return c.translateError(err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return errors.E(errors.Internal, err)
	}
	if rows == 0 {
		return errors.E(errors.NotExist, "record not found")
	}
	if rows > 1 {
		return errors.E(errors.Internal, fmt.Sprintf("expected 1 row affected, got %d", rows))
	}
	return nil
}

// Rebind transforms query bindvars into the driver's native parameter format.
func (c *Client) Rebind(query string) string {
	return c.db.Rebind(query)
}

// WithTx executes the provided callback within an isolated transaction.
// If fn returns an error, the transaction is rolled back; otherwise it is committed.
func (c *Client) WithTx(ctx context.Context, fn func(tx DB) error) error {
	tx, err := c.db.BeginTxx(ctx, nil)
	if err != nil {
		return c.translateError(err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	wrappedTx := &Tx{
		tx:         tx,
		translator: c.translator,
	}
	if err := fn(wrappedTx); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return c.translateError(err)
	}
	return nil
}

func (c *Client) translateError(err error) error {
	return translateError(err, c.translator)
}

// Tx wraps *sqlx.Tx to provide the same transparent error translation within transactions.
type Tx struct {
	tx         *sqlx.Tx
	translator ErrorTranslator
}

// Raw returns the underlying *sqlx.Tx.
func (t *Tx) Raw() *sqlx.Tx {
	return t.tx
}

// Get queries a single row into dest, mapping sql.ErrNoRows to KindNotExist.
func (t *Tx) Get(ctx context.Context, dest any, query string, args ...any) error {
	err := t.tx.GetContext(ctx, dest, query, args...)
	return t.translateError(err)
}

// Select queries multiple rows into dest slice.
func (t *Tx) Select(ctx context.Context, dest any, query string, args ...any) error {
	err := t.tx.SelectContext(ctx, dest, query, args...)
	return t.translateError(err)
}

// Exec executes a query without returning any rows.
func (t *Tx) Exec(ctx context.Context, query string, args ...any) (sql.Result, error) {
	res, err := t.tx.ExecContext(ctx, query, args...)
	return res, t.translateError(err)
}

// ExecOne executes a query and verifies that exactly one row was affected.
func (t *Tx) ExecOne(ctx context.Context, query string, args ...any) error {
	res, err := t.tx.ExecContext(ctx, query, args...)
	if err != nil {
		return t.translateError(err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return errors.E(errors.Internal, err)
	}
	if rows == 0 {
		return errors.E(errors.NotExist, "record not found")
	}
	if rows > 1 {
		return errors.E(errors.Internal, fmt.Sprintf("expected 1 row affected, got %d", rows))
	}
	return nil
}

// Rebind transforms query bindvars into the driver's native parameter format.
func (t *Tx) Rebind(query string) string {
	return t.tx.Rebind(query)
}

func (t *Tx) translateError(err error) error {
	return translateError(err, t.translator)
}

// translateError transparently converts database driver errors into platform errors.
func translateError(err error, translator ErrorTranslator) error {
	if err == nil {
		return nil
	}
	if _, ok := err.(*errors.Error); ok {
		return err
	}
	if errors.Is(err, sql.ErrNoRows) {
		return errors.E(errors.NotExist, "record not found")
	}
	if errors.Is(err, context.Canceled) {
		return errors.E(errors.Unavailable, "context canceled")
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return errors.E(errors.Unavailable, "context deadline exceeded")
	}

	if translator != nil {
		if translated := translator(err); translated != nil {
			return translated
		}
	}

	return errors.E(errors.Internal, err)
}

// Compile-time interface assertion
var (
	_ DB         = (*Client)(nil)
	_ Transactor = (*Client)(nil)
	_ DB         = (*Tx)(nil)
)
