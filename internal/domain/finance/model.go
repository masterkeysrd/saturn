package finance

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/pkg/id"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
	"github.com/masterkeysrd/saturn/internal/pkg/timeutils"
)

type Budget struct {
	ID        BudgetID
	Name      string
	Amount    money.Money
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (b *Budget) Create() error {
	id, err := id.New[BudgetID]()
	if err != nil {
		return fmt.Errorf("cannot created a budget identifier: %w", err)
	}

	b.ID = id
	b.CreatedAt = time.Now().UTC()
	b.Name = strings.TrimSpace(b.Name)
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
		return fmt.Errorf("invalid ammount: %w", err)
	}
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

// TODO: Change for a config base currency
const DefaultBaseCurrency CurrencyCode = "USD"

type Currency struct {
	Code      CurrencyCode
	Name      string
	Rate      float64
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (c *Currency) Create() error {
	c.CreatedAt = time.Now().UTC()
	return nil
}

func (c *Currency) Validate() error {
	if err := c.Code.Validate(); err != nil {
		return fmt.Errorf("code is invalid: %w", err)
	}

	if c.Name == "" {
		return errors.New("name is require")
	}

	if len(c.Name) > 50 {
		return errors.New("name cannot have more that 50 characters ")
	}

	if c.Rate <= 0 {
		return errors.New("rate must be a positive number")
	}

	return nil
}

type CurrencyCode = money.CurrencyCode
