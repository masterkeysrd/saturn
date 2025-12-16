package identity

import (
	"context"
	"time"
)

// BindingStore defines the interface for managing bindings
// between users and authentication providers.
type BindingStore interface {
	// Get retrieves a binding by its BindingID.
	Get(context.Context, BindingID) (*Binding, error)

	// GetBy retrieves a binding by a criateria.
	GetBy(context.Context, GetBindingCriteria) (*Binding, error)

	// List retrieves all bindings for a given UserID.
	List(context.Context, UserID) ([]*Binding, error)

	// Store saves a new binding to the store.
	Store(context.Context, *Binding) error

	// Delete removes a binding from the store by its BindingID.
	Delete(context.Context, BindingID) error
}

type GetBindingCriteria interface {
	isGetBindingCriteria()
}

// BindingID represents the unique identifier for a binding
// between a user and an authentication provider.
type BindingID struct {
	UserID   UserID
	Provider ProviderType
}

// SubjectID represents the unique identifier for a subject in
// an authentication provider.
type SubjectID string

func (sid SubjectID) String() string {
	return string(sid)
}

// Binding represents the association between a user and an
// authentication provider's subject.
type Binding struct {
	BindingID
	SubjectID SubjectID

	CreateTime time.Time
	UpdateTime time.Time
}

func (b *Binding) Initialize() error {
	now := time.Now().UTC()
	b.CreateTime = now
	b.UpdateTime = now
	return nil
}
