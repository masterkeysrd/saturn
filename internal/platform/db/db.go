package db

import (
	"context"
	"database/sql"
	"fmt"
	"sync"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/log"
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

// Transactor defines an interface for managing database transactions.
type Transactor interface {
	// Begin starts a new transaction or joins an existing one from context.
	Begin(ctx context.Context) (context.Context, *TxController, error)
	// WithTx executes fn within a transaction.
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error
}

type txContextKey struct{}

// WithTxContext injects a TxController into the context.
func WithTxContext(ctx context.Context, ctrl *TxController) context.Context {
	return context.WithValue(ctx, txContextKey{}, ctrl)
}

// TxControllerFromContext extracts the active TxController from context, or nil if none exists.
func TxControllerFromContext(ctx context.Context) *TxController {
	if ctx == nil {
		return nil
	}
	ctrl, _ := ctx.Value(txContextKey{}).(*TxController)
	return ctrl
}

// TxFromContext extracts the active *Tx from context, or nil if none exists or if it has completed.
func TxFromContext(ctx context.Context) *Tx {
	ctrl := TxControllerFromContext(ctx)
	if ctrl == nil || ctrl.IsDone() {
		return nil
	}
	return ctrl.tx
}

// Begin starts a transaction using the provided Transactor.
// It returns a new context with the transaction injected, the TxController, and any error.
func Begin(ctx context.Context, txr Transactor) (context.Context, *TxController, error) {
	if txr == nil {
		return ctx, nil, errors.E(errors.Internal, "transactor is nil")
	}
	return txr.Begin(ctx)
}

// WithTx executes fn within a transaction using the provided Transactor.
func WithTx(ctx context.Context, txr Transactor, fn func(ctx context.Context) error) error {
	if txr == nil {
		return errors.E(errors.Internal, "transactor is nil")
	}
	return txr.WithTx(ctx, fn)
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
// If the context carries an active transaction, the query automatically routes to it.
func (c *Client) Get(ctx context.Context, dest any, query string, args ...any) error {
	if tx := TxFromContext(ctx); tx != nil {
		return tx.Get(ctx, dest, query, args...)
	}
	err := c.db.GetContext(ctx, dest, query, args...)
	return c.translateError(err)
}

// Select queries multiple rows into dest slice.
// If the context carries an active transaction, the query automatically routes to it.
func (c *Client) Select(ctx context.Context, dest any, query string, args ...any) error {
	if tx := TxFromContext(ctx); tx != nil {
		return tx.Select(ctx, dest, query, args...)
	}
	err := c.db.SelectContext(ctx, dest, query, args...)
	return c.translateError(err)
}

// Exec executes a query without returning any rows.
// If the context carries an active transaction, the query automatically routes to it.
func (c *Client) Exec(ctx context.Context, query string, args ...any) (sql.Result, error) {
	if tx := TxFromContext(ctx); tx != nil {
		return tx.Exec(ctx, query, args...)
	}
	res, err := c.db.ExecContext(ctx, query, args...)
	return res, c.translateError(err)
}

// ExecOne executes a query and verifies that exactly one row was affected.
// If 0 rows were affected, it returns KindNotExist.
// If the context carries an active transaction, the query automatically routes to it.
func (c *Client) ExecOne(ctx context.Context, query string, args ...any) error {
	if tx := TxFromContext(ctx); tx != nil {
		return tx.ExecOne(ctx, query, args...)
	}
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

// Begin starts a new transaction or creates a nested transaction if an active transaction
// is already present on ctx.
func (c *Client) Begin(ctx context.Context) (context.Context, *TxController, error) {
	if parent := TxControllerFromContext(ctx); parent != nil && !parent.IsDone() {
		child := &TxController{
			tx:     parent.tx,
			parent: parent,
		}
		return WithTxContext(ctx, child), child, nil
	}

	if c.db == nil {
		return ctx, nil, errors.E(errors.Internal, "database not initialized")
	}

	rawTx, err := c.db.BeginTxx(ctx, nil)
	if err != nil {
		return ctx, nil, c.translateError(err)
	}

	wrappedTx := &Tx{
		tx:         rawTx,
		translator: c.translator,
	}
	ctrl := &TxController{
		tx: wrappedTx,
	}
	return WithTxContext(ctx, ctrl), ctrl, nil
}

// WithTx executes the provided callback within a transaction.
// If fn returns an error, the transaction is rolled back; otherwise it is committed.
func (c *Client) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	txCtx, tx, err := c.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := fn(txCtx); err != nil {
		return err
	}

	return tx.Commit()
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

// Begin creates a nested transaction on top of this Tx.
func (t *Tx) Begin(ctx context.Context) (context.Context, *TxController, error) {
	parent := TxControllerFromContext(ctx)
	child := &TxController{
		tx:     t,
		parent: parent,
	}
	return WithTxContext(ctx, child), child, nil
}

// WithTx executes the provided callback within a nested transaction on top of this Tx.
func (t *Tx) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	txCtx, child, err := t.Begin(ctx)
	if err != nil {
		return err
	}
	defer child.Rollback()

	if err := fn(txCtx); err != nil {
		return err
	}

	return child.Commit()
}

func (t *Tx) translateError(err error) error {
	return translateError(err, t.translator)
}

// TxController controls the lifecycle of a database transaction.
// It supports nested transactions and makes defer tx.Rollback() a zero-cost safe no-op after Commit().
type TxController struct {
	tx      *Tx
	parent  *TxController
	done    bool
	aborted bool
	mu      sync.Mutex
}

// Tx returns the underlying *Tx managed by this controller.
func (c *TxController) Tx() *Tx {
	return c.tx
}

// IsDone reports whether the transaction has been committed or rolled back.
func (c *TxController) IsDone() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.done
}

// IsAborted reports whether this transaction or a child transaction was aborted.
func (c *TxController) IsAborted() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.aborted
}

func (c *TxController) markAborted() {
	c.mu.Lock()
	c.aborted = true
	parent := c.parent
	c.mu.Unlock()
	if parent != nil {
		parent.markAborted()
	}
}

// Commit commits the transaction.
// For nested transactions, it marks the nested scope complete and yields to the parent.
func (c *TxController) Commit() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.done {
		return errors.E(errors.Internal, "transaction already completed")
	}

	if c.aborted {
		c.done = true
		if c.parent == nil && c.tx != nil && c.tx.tx != nil {
			_ = c.tx.tx.Rollback()
		}
		return errors.E(errors.Internal, "transaction aborted due to failed nested transaction")
	}

	c.done = true

	// Nested transaction: commit is a no-op waiting for parent root commit
	if c.parent != nil {
		return nil
	}

	if c.tx == nil || c.tx.tx == nil {
		return nil
	}

	if err := c.tx.tx.Commit(); err != nil {
		return c.tx.translateError(err)
	}

	return nil
}

// Rollback rolls back the transaction.
// Calling Rollback on an already completed transaction (e.g. via defer tx.Rollback() after Commit())
// is a safe no-op that returns nil.
func (c *TxController) Rollback() error {
	c.mu.Lock()
	if c.done {
		c.mu.Unlock()
		return nil
	}

	c.done = true
	c.aborted = true
	parent := c.parent
	c.mu.Unlock()

	if parent != nil {
		parent.markAborted()
		return nil
	}

	if c.tx == nil || c.tx.tx == nil {
		return nil
	}

	if err := c.tx.tx.Rollback(); err != nil {
		if !errors.Is(err, sql.ErrTxDone) {
			log.Error(context.Background(), "failed to rollback transaction", log.Err(err))
			return c.tx.translateError(err)
		}
	}

	return nil
}

// Begin creates a nested transaction on top of this TxController.
func (c *TxController) Begin(ctx context.Context) (context.Context, *TxController, error) {
	child := &TxController{
		tx:     c.tx,
		parent: c,
	}
	return WithTxContext(ctx, child), child, nil
}

// WithTx executes the provided callback within a nested transaction on top of this TxController.
func (c *TxController) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	txCtx, child, err := c.Begin(ctx)
	if err != nil {
		return err
	}
	defer child.Rollback()

	if err := fn(txCtx); err != nil {
		return err
	}

	return child.Commit()
}

// Get queries a single row into dest using the active transaction.
func (c *TxController) Get(ctx context.Context, dest any, query string, args ...any) error {
	return c.tx.Get(ctx, dest, query, args...)
}

// Select queries multiple rows into dest slice using the active transaction.
func (c *TxController) Select(ctx context.Context, dest any, query string, args ...any) error {
	return c.tx.Select(ctx, dest, query, args...)
}

// Exec executes a query using the active transaction.
func (c *TxController) Exec(ctx context.Context, query string, args ...any) (sql.Result, error) {
	return c.tx.Exec(ctx, query, args...)
}

// ExecOne executes a query and verifies 1 row affected using the active transaction.
func (c *TxController) ExecOne(ctx context.Context, query string, args ...any) error {
	return c.tx.ExecOne(ctx, query, args...)
}

// Rebind transforms query bindvars into the driver's native parameter format.
func (c *TxController) Rebind(query string) string {
	return c.tx.Rebind(query)
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

// Compile-time interface assertions
var (
	_ DB         = (*Client)(nil)
	_ Transactor = (*Client)(nil)
	_ DB         = (*Tx)(nil)
	_ Transactor = (*Tx)(nil)
	_ DB         = (*TxController)(nil)
	_ Transactor = (*TxController)(nil)
)
