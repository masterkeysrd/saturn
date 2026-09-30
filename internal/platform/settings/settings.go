package settings

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// ScopeType represents the entity scope for a configuration entry.
type ScopeType string

const (
	// ScopeSpace represents workspace-scoped configuration.
	ScopeSpace ScopeType = "space"

	// ScopeUser represents user-scoped configuration.
	ScopeUser ScopeType = "user"

	// ScopeSystem represents system-wide configuration.
	ScopeSystem ScopeType = "system"
)

// Key defines a strongly-typed descriptor for a settings namespace within a scope.
type Key[T any] struct {
	scopeType ScopeType
	namespace string
}

// NewKey creates a typed settings Key descriptor.
func NewKey[T any](scopeType ScopeType, namespace string) Key[T] {
	return Key[T]{
		scopeType: scopeType,
		namespace: namespace,
	}
}

// ScopeType returns the scope type of the key.
func (k Key[T]) ScopeType() ScopeType { return k.scopeType }

// Namespace returns the namespace of the key.
func (k Key[T]) Namespace() string { return k.namespace }

// For binds the Key with a specific runtime scope identifier (e.g. spaceID or userID).
func (k Key[T]) For(scopeID string) Target[T] {
	return Target[T]{
		key:     k,
		scopeID: scopeID,
	}
}

// Target pairs a static Key descriptor with a runtime scope ID.
type Target[T any] struct {
	key     Key[T]
	scopeID string
}

// Key returns the underlying Key descriptor.
func (t Target[T]) Key() Key[T] { return t.key }

// ScopeType returns the target's scope type.
func (t Target[T]) ScopeType() ScopeType { return t.key.scopeType }

// ScopeID returns the target's scope identifier.
func (t Target[T]) ScopeID() string { return t.scopeID }

// Namespace returns the target's namespace.
func (t Target[T]) Namespace() string { return t.key.namespace }

// Entry initializes an Entry for this Target with the given initial value.
func (t Target[T]) Entry(val T) *Entry[T] {
	return &Entry[T]{
		Target:  t,
		Value:   val,
		Version: 0,
	}
}

// Entry wraps the strongly typed payload with concurrency metadata and scope target.
type Entry[T any] struct {
	Target     Target[T]
	Value      T
	Version    int64
	CreateTime time.Time
	UpdateTime time.Time
}

// RawRecord represents the persistent row format stored in the database.
type RawRecord struct {
	ScopeType  string    `db:"scope_type"`
	ScopeID    string    `db:"scope_id"`
	Namespace  string    `db:"namespace"`
	Payload    []byte    `db:"payload"`
	Version    int64     `db:"version"`
	CreateTime time.Time `db:"create_time"`
	UpdateTime time.Time `db:"update_time"`
}

// Store defines low-level persistent storage for settings records.
type Store interface {
	GetRaw(ctx context.Context, scopeType ScopeType, scopeID, namespace string) (*RawRecord, error)
	SaveRaw(ctx context.Context, rec *RawRecord) error
	SetRaw(ctx context.Context, rec *RawRecord) (*RawRecord, error)
	DeleteRaw(ctx context.Context, scopeType ScopeType, scopeID, namespace string) error
}

// Client provides typed ergonomics for interacting with a specific Key[T].
type Client[T any] struct {
	store Store
	key   Key[T]
}

// Bind returns a new typed Client for the given store and key.
func Bind[T any](store Store, key Key[T]) *Client[T] {
	return &Client[T]{
		store: store,
		key:   key,
	}
}

// Key returns the underlying Key[T].
func (c *Client[T]) Key() Key[T] {
	return c.key
}

// Get retrieves the settings for the given scopeID.
// If the record does not exist, it returns errors.NotExist.
func (c *Client[T]) Get(ctx context.Context, scopeID string) (*Entry[T], error) {
	return Get(ctx, c.store, c.key.For(scopeID))
}

// GetOrDefault retrieves settings for the given scopeID, returning fallback if not found.
// The returned Entry will have Version=0 indicating it has not yet been persisted.
func (c *Client[T]) GetOrDefault(ctx context.Context, scopeID string, fallback T) (*Entry[T], error) {
	entry, err := c.Get(ctx, scopeID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return &Entry[T]{
				Target:  c.key.For(scopeID),
				Value:   fallback,
				Version: 0,
			}, nil
		}
		return nil, err
	}
	return entry, nil
}

// Save persists updates to an existing Entry with optimistic concurrency checking.
// If entry.Version == 0, it performs an initial insertion.
func (c *Client[T]) Save(ctx context.Context, entry *Entry[T]) error {
	return Save(ctx, c.store, entry)
}

// Set performs a blind upsert, setting the value regardless of previous version.
func (c *Client[T]) Set(ctx context.Context, scopeID string, val T) (*Entry[T], error) {
	return Set(ctx, c.store, c.key.For(scopeID), val)
}

// Get retrieves and deserializes settings for the given Target.
func Get[T any](ctx context.Context, store Store, target Target[T]) (*Entry[T], error) {
	const op errors.Op = "platform/settings.Get"
	if store == nil {
		return nil, errors.E(op, errors.Internal, "store is nil")
	}

	rec, err := store.GetRaw(ctx, target.ScopeType(), target.ScopeID(), target.Namespace())
	if err != nil {
		return nil, errors.E(op, err)
	}

	var val T
	if len(rec.Payload) > 0 {
		if err := json.Unmarshal(rec.Payload, &val); err != nil {
			return nil, errors.E(op, errors.Internal, fmt.Errorf("failed to unmarshal settings payload: %w", err))
		}
	}

	return &Entry[T]{
		Target:     target,
		Value:      val,
		Version:    rec.Version,
		CreateTime: rec.CreateTime,
		UpdateTime: rec.UpdateTime,
	}, nil
}

// Save persists updates to an Entry with optimistic concurrency control.
func Save[T any](ctx context.Context, store Store, entry *Entry[T]) error {
	const op errors.Op = "platform/settings.Save"
	if store == nil {
		return errors.E(op, errors.Internal, "store is nil")
	}
	if entry == nil {
		return errors.E(op, errors.Invalid, "entry is nil")
	}

	payload, err := json.Marshal(entry.Value)
	if err != nil {
		return errors.E(op, errors.Internal, fmt.Errorf("failed to marshal settings payload: %w", err))
	}

	rec := &RawRecord{
		ScopeType: string(entry.Target.ScopeType()),
		ScopeID:   entry.Target.ScopeID(),
		Namespace: entry.Target.Namespace(),
		Payload:   payload,
		Version:   entry.Version,
	}

	if err := store.SaveRaw(ctx, rec); err != nil {
		return errors.E(op, err)
	}

	entry.Version = rec.Version
	entry.UpdateTime = rec.UpdateTime
	if entry.CreateTime.IsZero() {
		entry.CreateTime = rec.CreateTime
	}

	return nil
}

// Set writes or overwrites settings for a target, returning the resulting Entry.
func Set[T any](ctx context.Context, store Store, target Target[T], val T) (*Entry[T], error) {
	const op errors.Op = "platform/settings.Set"
	if store == nil {
		return nil, errors.E(op, errors.Internal, "store is nil")
	}

	payload, err := json.Marshal(val)
	if err != nil {
		return nil, errors.E(op, errors.Internal, fmt.Errorf("failed to marshal settings payload: %w", err))
	}

	rec := &RawRecord{
		ScopeType: string(target.ScopeType()),
		ScopeID:   target.ScopeID(),
		Namespace: target.Namespace(),
		Payload:   payload,
	}

	saved, err := store.SetRaw(ctx, rec)
	if err != nil {
		return nil, errors.E(op, err)
	}

	return &Entry[T]{
		Target:     target,
		Value:      val,
		Version:    saved.Version,
		CreateTime: saved.CreateTime,
		UpdateTime: saved.UpdateTime,
	}, nil
}
