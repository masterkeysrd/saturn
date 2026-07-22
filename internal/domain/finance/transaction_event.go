package finance

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

// TransactionEventID is a custom string type representing a transaction event's unique identifier.
type TransactionEventID string

const transactionEventPrefix = "txe_"

// NewTransactionEventID creates a new TransactionEventID using the default ID generator.
func NewTransactionEventID() (TransactionEventID, error) {
	raw, err := id.Generate(transactionEventPrefix)
	if err != nil {
		return "", err
	}
	return TransactionEventID(raw), nil
}

// ParseTransactionEventID parses a string into a TransactionEventID and validates it.
func ParseTransactionEventID(s string) (TransactionEventID, error) {
	if err := id.Validate(s, transactionEventPrefix); err != nil {
		return "", fmt.Errorf("invalid transaction event ID: %w", err)
	}
	return TransactionEventID(s), nil
}

// MustTransactionEventID panics if the string is not a valid TransactionEventID.
func MustTransactionEventID(s string) TransactionEventID {
	eID, err := ParseTransactionEventID(s)
	if err != nil {
		panic(err)
	}
	return eID
}

// String returns the string representation.
func (teid TransactionEventID) String() string {
	return string(teid)
}

// Validate checks if the TransactionEventID is valid.
func (teid TransactionEventID) Validate() error {
	return id.Validate(string(teid), transactionEventPrefix)
}

// TransactionEvent represents a historical lifecycle event for a transaction.
type TransactionEvent struct {
	ID            TransactionEventID
	SpaceID       SpaceID
	TransactionID TransactionID
	EventType     string
	Metadata      map[string]interface{}
	CreateTime    time.Time
}

// Validate checks the basic properties of a transaction event.
func (e *TransactionEvent) Validate() error {
	if err := e.ID.Validate(); err != nil {
		return fmt.Errorf("validate event ID: %w", err)
	}
	if err := e.SpaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	if err := e.TransactionID.Validate(); err != nil {
		return fmt.Errorf("validate transaction ID: %w", err)
	}
	if e.EventType == "" {
		return errors.New("event type is required")
	}
	if e.CreateTime.IsZero() {
		return errors.New("create_time timestamp is required")
	}
	return nil
}

// MetadataJSON returns the metadata mapped to a JSON byte slice.
func (e *TransactionEvent) MetadataJSON() ([]byte, error) {
	if e.Metadata == nil {
		return []byte("{}"), nil
	}
	return json.Marshal(e.Metadata)
}

// ParseMetadataJSON sets the metadata map from a JSON byte slice.
func (e *TransactionEvent) ParseMetadataJSON(data []byte) error {
	if len(data) == 0 {
		e.Metadata = make(map[string]interface{})
		return nil
	}
	return json.Unmarshal(data, &e.Metadata)
}
