package finance

import (
	"errors"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

type BorrowingDirection string

const (
	BorrowingDirectionBorrowed BorrowingDirection = "BORROWED"
	BorrowingDirectionLent     BorrowingDirection = "LENT"
)

type BorrowingStatus string

const (
	BorrowingStatusActive  BorrowingStatus = "ACTIVE"
	BorrowingStatusPaidOff BorrowingStatus = "PAID_OFF"
)

// BorrowingID is a custom string type representing a borrowing's unique identifier.
type BorrowingID string

// NewBorrowingID creates a new BorrowingID using the default ID generator.
func NewBorrowingID() (BorrowingID, error) {
	raw, err := id.Generate(borrowingPrefix)
	if err != nil {
		return "", err
	}
	return BorrowingID(raw), nil
}

// ParseBorrowingID parses a string into a BorrowingID and validates it.
func ParseBorrowingID(s string) (BorrowingID, error) {
	if err := id.Validate(s, borrowingPrefix); err != nil {
		return "", fmt.Errorf("invalid borrowing ID: %w", err)
	}
	return BorrowingID(s), nil
}

// MustBorrowingID panics if the string is not a valid BorrowingID.
func MustBorrowingID(s string) BorrowingID {
	bID, err := ParseBorrowingID(s)
	if err != nil {
		panic(err)
	}
	return bID
}

// String returns the string representation.
func (bid BorrowingID) String() string {
	return string(bid)
}

// Validate checks if the BorrowingID is valid.
func (bid BorrowingID) Validate() error {
	return id.Validate(string(bid), borrowingPrefix)
}

const borrowingPrefix = "bor_"

// BorrowingRepaymentID is a custom string type representing a repayment's unique identifier.
type BorrowingRepaymentID string

// NewBorrowingRepaymentID creates a new BorrowingRepaymentID using the default ID generator.
func NewBorrowingRepaymentID() (BorrowingRepaymentID, error) {
	raw, err := id.Generate(repaymentPrefix)
	if err != nil {
		return "", err
	}
	return BorrowingRepaymentID(raw), nil
}

// ParseBorrowingRepaymentID parses a string into a BorrowingRepaymentID and validates it.
func ParseBorrowingRepaymentID(s string) (BorrowingRepaymentID, error) {
	if err := id.Validate(s, repaymentPrefix); err != nil {
		return "", fmt.Errorf("invalid borrowing repayment ID: %w", err)
	}
	return BorrowingRepaymentID(s), nil
}

// MustBorrowingRepaymentID panics if the string is not a valid BorrowingRepaymentID.
func MustBorrowingRepaymentID(s string) BorrowingRepaymentID {
	rID, err := ParseBorrowingRepaymentID(s)
	if err != nil {
		panic(err)
	}
	return rID
}

// String returns the string representation.
func (rid BorrowingRepaymentID) String() string {
	return string(rid)
}

// Validate checks if the BorrowingRepaymentID is valid.
func (rid BorrowingRepaymentID) Validate() error {
	return id.Validate(string(rid), repaymentPrefix)
}

const repaymentPrefix = "brp_"

// Borrowing represents a personal borrowing or lending agreement.
type Borrowing struct {
	ID              BorrowingID
	SpaceID         SpaceID
	Direction       BorrowingDirection
	Counterparty    string
	ContactInfo     string
	TotalAmount     int64
	RemainingAmount int64
	Currency        Currency
	Status          BorrowingStatus
	EstablishedAt   time.Time
	DueAt           *time.Time
	Notes           string
	AccountID       *AccountID // Transient: used to link a transaction on creation/update
	CreateTime      time.Time
	UpdateTime      time.Time
}

// Validate checks basic properties of a borrowing.
func (b *Borrowing) Validate() error {
	if err := b.ID.Validate(); err != nil {
		return fmt.Errorf("validate borrowing ID: %w", err)
	}
	if err := b.SpaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	if b.Direction != BorrowingDirectionBorrowed && b.Direction != BorrowingDirectionLent {
		return fmt.Errorf("invalid borrowing direction: %s", b.Direction)
	}
	if b.Counterparty == "" {
		return errors.New("counterparty is required")
	}
	if b.TotalAmount <= 0 {
		return errors.New("total amount must be greater than zero")
	}
	if b.AccountID != nil {
		if err := b.AccountID.Validate(); err != nil {
			return fmt.Errorf("validate account ID: %w", err)
		}
	}
	if b.RemainingAmount < 0 || b.RemainingAmount > b.TotalAmount {
		return errors.New("invalid remaining amount")
	}
	if err := b.Currency.Validate(); err != nil {
		return fmt.Errorf("validate currency: %w", err)
	}
	if b.Status != BorrowingStatusActive && b.Status != BorrowingStatusPaidOff {
		return fmt.Errorf("invalid borrowing status: %s", b.Status)
	}
	if b.EstablishedAt.IsZero() {
		return errors.New("established date is required")
	}
	return nil
}

// BorrowingRepayment represents a repayment installment for a borrowing.
type BorrowingRepayment struct {
	ID          BorrowingRepaymentID
	BorrowingID BorrowingID
	SpaceID     SpaceID
	Amount      int64
	PaymentDate time.Time
	Notes       string
	AccountID   *AccountID // Nullable reference to the source/destination account
	CreateTime  time.Time
	UpdateTime  time.Time
}

// Validate checks basic properties of a repayment.
func (r *BorrowingRepayment) Validate() error {
	if err := r.ID.Validate(); err != nil {
		return fmt.Errorf("validate repayment ID: %w", err)
	}
	if err := r.BorrowingID.Validate(); err != nil {
		return fmt.Errorf("validate parent borrowing ID: %w", err)
	}
	if err := r.SpaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	if r.Amount <= 0 {
		return errors.New("repayment amount must be greater than zero")
	}
	if r.PaymentDate.IsZero() {
		return errors.New("payment date is required")
	}
	if r.AccountID != nil {
		if err := r.AccountID.Validate(); err != nil {
			return fmt.Errorf("validate account ID: %w", err)
		}
	}
	return nil
}

// ListBorrowingsFilter encapsulates filtering parameters for listing borrowings.
type ListBorrowingsFilter struct {
	Status        *BorrowingStatus
	Direction     *BorrowingDirection
	PageSize      int32
	NextPageToken string
}
