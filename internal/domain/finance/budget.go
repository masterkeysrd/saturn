package finance

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/fieldmask"
	"github.com/masterkeysrd/saturn/internal/pkg/id"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
	"github.com/masterkeysrd/saturn/internal/pkg/timeutils"
)

// BudgetUpdateSchema only includes updatable fields
var BudgetUpdateSchema = fieldmask.NewSchema("budget").
	Field("name",
		fieldmask.WithDescription("Budget name"),
		fieldmask.WithRequired(),
	).
	Field("amount",
		fieldmask.WithDescription("Budget amount in cents"),
		fieldmask.WithRequired(),
	).
	Build()

type UpdateBudgetInput struct {
	ID         BudgetID
	Budget     *Budget
	UpdateMask *fieldmask.FieldMask
}

type Budget struct {
	ID        BudgetID
	Name      string
	Amount    money.Money
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (b *Budget) Initialize() error {
	if b == nil {
		return errors.New("cannot initialize nil budget")
	}
	id, err := id.New[BudgetID]()
	if err != nil {
		return fmt.Errorf("cannot created a budget identifier: %w", err)
	}

	b.ID = id
	b.CreatedAt = time.Now().UTC()
	return nil
}

func (b *Budget) Validate() error {
	if b == nil {
		return errors.New("budget is nil")
	}

	if b.ID == "" {
		return errors.New("id field is required")
	}

	if err := id.Validate(b.ID); err != nil {
		return fmt.Errorf("id field is invalid: %w", err)
	}

	if b.Name == "" {
		return errors.New("name field is required")
	}

	if len(b.Name) > 32 {
		return errors.New("name field exceeds 32 characters")
	}

	if b.Amount.Cents <= 0 {
		return errors.New("amount field must be a positive number")
	}

	if err := b.Amount.Validate(); err != nil {
		return fmt.Errorf("invalid amount: %w", err)
	}
	return nil
}

func (b *Budget) Update(update *Budget, fields *fieldmask.FieldMask) error {
	if b == nil {
		return errors.New("cannot update nil budget")
	}

	if update == nil {
		return errors.New("update source is nil")
	}

	if err := BudgetUpdateSchema.Validate(fields); err != nil {
		return err
	}

	if fields.Contains("name") {
		b.Name = update.Name
	}

	if fields.Contains("amount") {
		if b.Amount.Currency != update.Amount.Currency {
			return fmt.Errorf("budget currency cannot be changed: %s vs %s", b.Amount.Currency, update.Amount.Currency)
		}

		b.Amount = update.Amount
	}

	b.UpdatedAt = time.Now().UTC()
	return nil
}

// CreatePeriod creates a new BudgetPeriod for the provided time 't' and exchange context 'c'.
// The base currency is set to DefaultBaseCurrency and the conversion is computed using c.Rate.
func (b *Budget) CreatePeriod(c *Currency, t time.Time) (*BudgetPeriod, error) {
	id, err := id.New[BudgetPeriodID]()
	if err != nil {
		return nil, fmt.Errorf("cannot create period identifier: %w", err)
	}

	start, end := timeutils.MonthStartEnd(t)
	p := BudgetPeriod{
		ID:           id,
		BudgetID:     b.ID,
		StartDate:    start,
		EndDate:      end,
		Amount:       b.Amount,
		BaseAmount:   b.Amount.Exchange(DefaultBaseCurrency, c.Rate),
		ExchangeRate: c.Rate,
		CreatedAt:    time.Now().UTC(),
	}

	return &p, nil
}

// SyncPeriod updates a calculated BudgetPeriod object (or Value Object)
// based on the master Budget's current state.
func (b *Budget) SyncPeriod(period *BudgetPeriod, currency *Currency) error {
	if b == nil {
		return errors.New("cannot sync period on nil budget")
	}

	if period == nil {
		return errors.New("budget period is nil")
	}

	if currency == nil {
		return errors.New("currency is nil")
	}

	if b.ID != period.BudgetID {
		return errors.New("cannot sync period: ID mismatch with root budget")
	}

	if b.Amount.Currency != currency.Code {
		return fmt.Errorf("budget currency (%s) cannot be synced with external currency (%s)", b.Amount.Currency, currency.Code)
	}

	period.BaseAmount = b.Amount.Exchange(DefaultBaseCurrency, currency.Rate)
	period.ExchangeRate = currency.Rate
	period.UpdatedAt = time.Now().UTC()
	return nil
}

func (b *Budget) sanitize() {
	if b == nil {
		return
	}
	b.Name = strings.TrimSpace(b.Name)
}

type BudgetID string

func (id BudgetID) String() string {
	return string(id)
}

type BudgetPeriod struct {
	ID           BudgetPeriodID
	BudgetID     BudgetID
	StartDate    time.Time
	EndDate      time.Time
	Amount       money.Money
	BaseAmount   money.Money
	ExchangeRate float64
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// Validate checks whether the BudgetPeriod fields are valid.
// Returns nil if valid, or an error describing the first problem encountered.
func (bp *BudgetPeriod) Validate() error {
	if bp == nil {
		return fmt.Errorf("budget period is nil")
	}
	if bp.ID == "" {
		return fmt.Errorf("budget period ID is empty")
	}
	if bp.BudgetID == "" {
		return fmt.Errorf("budget ID is empty")
	}
	if bp.StartDate.IsZero() {
		return fmt.Errorf("start date is not set")
	}
	if bp.EndDate.IsZero() {
		return fmt.Errorf("end date is not set")
	}
	if bp.EndDate.Before(bp.StartDate) {
		return fmt.Errorf("end date %v is before start date %v", bp.EndDate, bp.StartDate)
	}
	if bp.Amount.Cents < 0 {
		return fmt.Errorf("amount cents cannot be negative")
	}
	if bp.Amount.Currency == "" {
		return fmt.Errorf("amount currency is empty")
	}
	if bp.BaseAmount.Cents < 0 {
		return fmt.Errorf("base amount cents cannot be negative")
	}
	if bp.BaseAmount.Currency == "" {
		return fmt.Errorf("base amount currency is empty")
	}
	if bp.ExchangeRate <= 0 {
		return fmt.Errorf("exchange rate must be positive")
	}
	if bp.CreatedAt.IsZero() {
		return fmt.Errorf("created at is not set")
	}
	// UpdatedAt may be zero for new objects. Add check if you require it.
	return nil
}

type BudgetPeriodID string

func (i BudgetPeriodID) String() string {
	return string(i)
}
