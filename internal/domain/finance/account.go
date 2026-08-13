package finance

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
)

type AccountType string

const (
	AccountTypeBank           AccountType = "BANK"
	AccountTypeCreditCard     AccountType = "CREDIT_CARD"
	AccountTypeCash           AccountType = "CASH"
	AccountTypeDigitalAccount AccountType = "DIGITAL_ACCOUNT"
)

// AccountID is a custom string type representing an account's unique identifier (KSUID).
type AccountID string

// NewAccountID creates a new AccountID using the default ID generator.
func NewAccountID() (AccountID, error) {
	raw, err := id.Generate(accountPrefix)
	if err != nil {
		return "", err
	}
	return AccountID(raw), nil
}

// ParseAccountID parses a string into an AccountID and validates it.
func ParseAccountID(s string) (AccountID, error) {
	if err := id.Validate(s, accountPrefix); err != nil {
		return "", fmt.Errorf("invalid account ID: %w", err)
	}
	return AccountID(s), nil
}

// MustAccountID panics if the string is not a valid AccountID.
func MustAccountID(s string) AccountID {
	aID, err := ParseAccountID(s)
	if err != nil {
		panic(err)
	}
	return aID
}

// String returns the string representation.
func (aid AccountID) String() string {
	return string(aid)
}

// Validate checks if the AccountID is valid.
func (aid AccountID) Validate() error {
	return id.Validate(string(aid), accountPrefix)
}

const accountPrefix = "acc_"

// Account represents a physical or digital location where funds are held.
type Account struct {
	ID             AccountID
	SpaceID        SpaceID
	Name           string
	Type           AccountType
	Currency       Currency
	InitialBalance int64
	CurrentBalance int64
	CreditLimit    int64
	IsDefault      bool
	IsActive       bool
	Color          string
	Notes          string
	LastFour       string
	InstitutionID  *InstitutionID
	Version        int64
	CreateTime     time.Time
	UpdateTime     time.Time
}

// AccountPatchSchema defines patchable fields for an Account entity.
var AccountPatchSchema = patch.NewSchema[Account]().
	Register("name", patch.Field(func(a *Account) *string { return &a.Name })).
	Register("credit_limit", patch.Field(func(a *Account) *int64 { return &a.CreditLimit })).
	Register("is_default", patch.Field(func(a *Account) *bool { return &a.IsDefault })).
	Register("is_active", patch.Field(func(a *Account) *bool { return &a.IsActive })).
	Register("color", patch.Field(func(a *Account) *string { return &a.Color })).
	Register("notes", patch.Field(func(a *Account) *string { return &a.Notes })).
	Register("last_four", patch.Field(func(a *Account) *string { return &a.LastFour })).
	Register("institution_id", patch.Field(func(a *Account) **InstitutionID { return &a.InstitutionID }))

// ApplyPatch applies partial updates to an Account entity based on a field mask.
func (a *Account) ApplyPatch(incoming *Account, mask []string) error {
	if err := AccountPatchSchema.Apply(a, incoming, mask); err != nil {
		return err
	}
	a.UpdateTime = time.Now().UTC()
	return a.Validate()
}

// Validate checks the account's business rules.
func (a *Account) Validate() error {
	a.Name = strings.TrimSpace(a.Name)
	if a.Name == "" {
		return errors.New("account name is required")
	}
	if len(a.Name) > 255 {
		return errors.New("account name must not exceed 255 characters")
	}
	if a.Type != AccountTypeBank && a.Type != AccountTypeCreditCard && a.Type != AccountTypeCash && a.Type != AccountTypeDigitalAccount {
		return fmt.Errorf("invalid account type: %s", a.Type)
	}
	if err := a.Currency.Validate(); err != nil {
		return fmt.Errorf("validate currency: %w", err)
	}
	if a.Type == AccountTypeCreditCard && a.CreditLimit < 0 {
		return errors.New("credit limit cannot be negative")
	}
	if a.Type != AccountTypeCreditCard {
		a.CreditLimit = 0
	}
	a.LastFour = strings.TrimSpace(a.LastFour)
	if a.LastFour != "" {
		if len(a.LastFour) != 4 {
			return errors.New("last four must be exactly 4 digits")
		}
		for _, r := range a.LastFour {
			if r < '0' || r > '9' {
				return errors.New("last four must contain only digits")
			}
		}
	}
	a.Color = strings.TrimSpace(a.Color)
	if a.Color == "" {
		a.Color = "#6366f1"
	}
	if err := a.ID.Validate(); err != nil {
		return fmt.Errorf("validate account ID: %w", err)
	}
	if err := a.SpaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	return nil
}

// ApplyTransaction Impact adjusts the current account balance according to transaction type and account rules.
func (a *Account) ApplyTransaction(tType TransactionType, impactAmount int64) {
	if tType == TransactionTypeBalanceAdjustment {
		a.CurrentBalance += impactAmount
		a.UpdateTime = time.Now().UTC()
		return
	}

	isOutflow := (tType == TransactionTypeExpense || tType == TransactionTypeTransferOut)
	isInflow := (tType == TransactionTypeIncome || tType == TransactionTypeTransferIn)

	if a.Type == AccountTypeCreditCard {
		// Liability Account Rules (Positive = Debt Owed):
		// Outflow (Purchase/Expense/TransferOut) INCREASES debt (+amount)
		// Inflow (Card Payment/Refund/TransferIn) DECREASES debt (-amount)
		if isOutflow {
			a.CurrentBalance += impactAmount
		} else if isInflow {
			a.CurrentBalance -= impactAmount
		}
	} else {
		// Asset Account Rules (Positive = Money Owned):
		// Outflow (Withdrawal/Expense/TransferOut) DECREASES asset (-amount)
		// Inflow (Deposit/Income/TransferIn) INCREASES asset (+amount)
		if isOutflow {
			a.CurrentBalance -= impactAmount
		} else if isInflow {
			a.CurrentBalance += impactAmount
		}
	}

	a.UpdateTime = time.Now().UTC()
}

// RollbackTransaction Impact reverts a previously applied transaction impact on current balance.
func (a *Account) RollbackTransaction(tType TransactionType, impactAmount int64) {
	if tType == TransactionTypeBalanceAdjustment {
		a.CurrentBalance -= impactAmount
		a.UpdateTime = time.Now().UTC()
		return
	}

	isOutflow := (tType == TransactionTypeExpense || tType == TransactionTypeTransferOut)
	isInflow := (tType == TransactionTypeIncome || tType == TransactionTypeTransferIn)

	if a.Type == AccountTypeCreditCard {
		if isOutflow {
			a.CurrentBalance -= impactAmount
		} else if isInflow {
			a.CurrentBalance += impactAmount
		}
	} else {
		if isOutflow {
			a.CurrentBalance += impactAmount
		} else if isInflow {
			a.CurrentBalance -= impactAmount
		}
	}

	a.UpdateTime = time.Now().UTC()
}

// ReconcileAccountOpts contains options for building a balance reconciliation transaction.
type ReconcileAccountOpts struct {
	TargetBalance  int64
	AdjustmentDate time.Time
	Note           string
}

// ReconcileBalance computes reconciliation delta and generates a BALANCE_ADJUSTMENT transaction entity.
func (a *Account) ReconcileBalance(opts ReconcileAccountOpts) (*Transaction, error) {
	delta := opts.TargetBalance - a.CurrentBalance
	if delta == 0 {
		return nil, nil
	}

	txnID, err := NewTransactionID()
	if err != nil {
		return nil, err
	}

	adjDate := opts.AdjustmentDate
	if adjDate.IsZero() {
		adjDate = time.Now().UTC()
	}

	desc := "Balance Adjustment"
	if opts.Note != "" {
		desc += " (" + opts.Note + ")"
	}

	accID := a.ID
	return &Transaction{
		ID:              txnID,
		SpaceID:         a.SpaceID,
		AccountID:       &accID,
		Type:            TransactionTypeBalanceAdjustment,
		Amount:          delta,
		Currency:        a.Currency,
		Description:     desc,
		TransactionDate: adjDate,
		EffectiveDate:   adjDate,
	}, nil
}

// SetAsDefault sets account as default, enforcing that inactive accounts cannot be default.
func (a *Account) SetAsDefault() error {
	if !a.IsActive {
		return errors.New("cannot set an inactive account as default")
	}
	a.IsDefault = true
	a.UpdateTime = time.Now().UTC()
	return nil
}

// Deactivate deactivates the account (disallowed if it's currently default).
func (a *Account) Deactivate() error {
	if a.IsDefault {
		return errors.New("cannot deactivate default account")
	}
	a.IsActive = false
	a.UpdateTime = time.Now().UTC()
	return nil
}

// Activate sets IsActive = true.
func (a *Account) Activate() {
	a.IsActive = true
	a.UpdateTime = time.Now().UTC()
}

// ValidateTransferTo verifies that a transfer can occur from this account to the destination account.
func (a *Account) ValidateTransferTo(dest *Account, amount int64) error {
	if dest == nil {
		return errors.New("destination account is required")
	}
	if a.ID == dest.ID {
		return errors.New("source and destination accounts must be different")
	}
	if a.SpaceID != dest.SpaceID {
		return errors.New("source and destination accounts must belong to the same space")
	}
	if !a.IsActive {
		return errors.New("source account is inactive")
	}
	if !dest.IsActive {
		return errors.New("destination account is inactive")
	}
	if amount <= 0 {
		return errors.New("transfer amount must be greater than zero")
	}
	return nil
}

// DefaultAccountSortField represents the fallback sorting column name for accounts.
const DefaultAccountSortField = "name"

// AccountSortFields registry maps sortable account field names to their cursor string extraction logic.
var AccountSortFields = map[string]func(*Account) string{
	"name":            func(a *Account) string { return a.Name },
	"current_balance": func(a *Account) string { return fmt.Sprintf("%018d", a.CurrentBalance) },
	"create_time":     func(a *Account) string { return a.CreateTime.Format(time.RFC3339Nano) },
}

// IsAccountSortField validates if a sort column name is allowed.
func IsAccountSortField(field string) bool {
	_, ok := AccountSortFields[field]
	return ok
}

// GetSortValue extracts and formats the string representation of a field for cursor-based lexical sorting.
func (a *Account) GetSortValue(field string) string {
	if fn, ok := AccountSortFields[field]; ok {
		return fn(a)
	}
	return a.GetSortValue(DefaultAccountSortField)
}
