package finance

import (
	"errors"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
	"github.com/masterkeysrd/saturn/internal/platform/sorting"
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

// BorrowingRepaymentID is a type alias for TransactionID since all repayments are transactions.
type BorrowingRepaymentID = TransactionID

// NewBorrowingRepaymentID creates a new repayment TransactionID.
func NewBorrowingRepaymentID() (BorrowingRepaymentID, error) {
	return NewTransactionID()
}

// ParseBorrowingRepaymentID parses a string into a BorrowingRepaymentID (TransactionID).
func ParseBorrowingRepaymentID(s string) (BorrowingRepaymentID, error) {
	return ParseTransactionID(s)
}

// MustBorrowingRepaymentID panics if the string is not a valid BorrowingRepaymentID.
func MustBorrowingRepaymentID(s string) BorrowingRepaymentID {
	return MustTransactionID(s)
}

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
	Version         int64
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

// BorrowingPatchSchema defines patchable fields for a Borrowing entity.
var BorrowingPatchSchema = patch.NewSchema[Borrowing]().
	Register("id", patch.Field(func(b *Borrowing) *BorrowingID { return &b.ID })).
	Register("direction", patch.Field(func(b *Borrowing) *BorrowingDirection { return &b.Direction })).
	Register("counterparty", patch.Field(func(b *Borrowing) *string { return &b.Counterparty })).
	Register("contact_info", patch.Field(func(b *Borrowing) *string { return &b.ContactInfo })).
	Register("total_amount", patch.Field(func(b *Borrowing) *int64 { return &b.TotalAmount })).
	Register("currency", patch.Field(func(b *Borrowing) *Currency { return &b.Currency })).
	Register("status", patch.Field(func(b *Borrowing) *BorrowingStatus { return &b.Status })).
	Register("established_at", patch.Field(func(b *Borrowing) *time.Time { return &b.EstablishedAt })).
	Register("due_at", patch.Field(func(b *Borrowing) **time.Time { return &b.DueAt })).
	Register("notes", patch.Field(func(b *Borrowing) *string { return &b.Notes })).
	Register("account_id", patch.Field(func(b *Borrowing) **AccountID { return &b.AccountID }))

// ApplyPatch applies partial updates to a Borrowing entity based on a field mask.
func (b *Borrowing) ApplyPatch(incoming *Borrowing, mask []string) error {
	if err := BorrowingPatchSchema.Apply(b, incoming, mask); err != nil {
		return err
	}
	b.UpdateTime = time.Now().UTC()
	return b.Validate()
}

// BorrowingTransactionType represents the type of transaction (PAYMENT vs DISBURSEMENT).
type BorrowingTransactionType string

const (
	BorrowingTransactionTypePayment      BorrowingTransactionType = "PAYMENT"
	BorrowingTransactionTypeDisbursement BorrowingTransactionType = "DISBURSEMENT"
)

// BorrowingTransactionOpts defines parameters for instantiating a Transaction linked to a Borrowing.
type BorrowingTransactionOpts struct {
	Role                string
	Type                TransactionType
	Amount              int64
	AmountInBase        int64
	AccountImpactAmount int64
	AccountID           *AccountID
	TransactionDate     time.Time
	Description         string
}

// ApplyTransaction updates borrowing balances and status based on a payment or disbursement.
// Returns the corresponding BorrowingRole, TransactionType, and default description.
func (b *Borrowing) ApplyTransaction(txnType BorrowingTransactionType, amount int64) (role string, tType TransactionType, defaultDesc string, err error) {
	if amount <= 0 {
		return "", "", "", errors.New("borrowing transaction amount must be positive")
	}

	if txnType == BorrowingTransactionTypeDisbursement {
		b.RemainingAmount += amount
		b.TotalAmount += amount
		b.Status = BorrowingStatusActive
		role = "DISBURSEMENT"
		if b.Direction == BorrowingDirectionLent {
			tType = TransactionTypeExpense
			defaultDesc = fmt.Sprintf("Additional loan to %s", b.Counterparty)
		} else {
			tType = TransactionTypeIncome
			defaultDesc = fmt.Sprintf("Additional loan from %s", b.Counterparty)
		}
	} else { // PAYMENT
		b.RemainingAmount -= amount
		if b.RemainingAmount <= 0 {
			b.RemainingAmount = 0
			b.Status = BorrowingStatusPaidOff
		}
		role = "REPAYMENT"
		if b.Direction == BorrowingDirectionLent {
			tType = TransactionTypeIncome
			defaultDesc = fmt.Sprintf("Repayment from %s", b.Counterparty)
		} else {
			tType = TransactionTypeExpense
			defaultDesc = fmt.Sprintf("Repayment to %s", b.Counterparty)
		}
	}

	b.UpdateTime = time.Now().UTC()
	return role, tType, defaultDesc, nil
}

// NewTransaction constructs a valid Transaction entity linked to this Borrowing.
func (b *Borrowing) NewTransaction(opts BorrowingTransactionOpts) (*Transaction, error) {
	txnID, err := NewTransactionID()
	if err != nil {
		return nil, err
	}

	bID := b.ID
	t := &Transaction{
		ID:              txnID,
		SpaceID:         b.SpaceID,
		Type:            opts.Type,
		AccountID:       opts.AccountID,
		Amount:          opts.Amount,
		Currency:        b.Currency,
		AmountInBase:    opts.AmountInBase,
		Description:     opts.Description,
		TransactionDate: opts.TransactionDate,
		EffectiveDate:   opts.TransactionDate,
		Metadata: TransactionMetadata{
			BorrowingID:         &bID,
			BorrowingRole:       opts.Role,
			BorrowingAmount:     opts.Amount,
			AccountImpactAmount: opts.AccountImpactAmount,
		},
		CreateTime: time.Now().UTC(),
		UpdateTime: time.Now().UTC(),
	}

	if err := t.Validate(); err != nil {
		return nil, fmt.Errorf("validate borrowing transaction: %w", err)
	}
	return t, nil
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

// DefaultBorrowingSortField represents the fallback sorting column name for borrowings.
const DefaultBorrowingSortField = "create_time"

// BorrowingSortFields registry maps sortable borrowing field names to cursor strings.
var BorrowingSortFields = map[string]func(*Borrowing) string{
	"create_time":    func(b *Borrowing) string { return b.CreateTime.Format(time.RFC3339) },
	"counterparty":   func(b *Borrowing) string { return b.Counterparty },
	"total_amount":   func(b *Borrowing) string { return fmt.Sprintf("%019d", b.TotalAmount) },
	"established_at": func(b *Borrowing) string { return b.EstablishedAt.Format(time.RFC3339) },
	"due_at": func(b *Borrowing) string {
		if b.DueAt != nil {
			return b.DueAt.Format(time.RFC3339)
		}
		return ""
	},
}

// IsBorrowingSortField validates if a sort column name is allowed.
func IsBorrowingSortField(field string) bool {
	_, ok := BorrowingSortFields[field]
	return ok
}

// GetSortValue extracts the sort value string for pagination cursor generation.
func (b *Borrowing) GetSortValue(field string) string {
	if fn, ok := BorrowingSortFields[field]; ok {
		return fn(b)
	}
	return b.GetSortValue(DefaultBorrowingSortField)
}

// ListBorrowingsFilter encapsulates filtering parameters for listing borrowings.
type ListBorrowingsFilter struct {
	Status        *BorrowingStatus
	Direction     *BorrowingDirection
	PageSize      int32
	NextPageToken string
	Sort          sorting.SortOrder
}
