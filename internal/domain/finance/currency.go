package finance

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/access"
	"github.com/masterkeysrd/saturn/internal/foundation/decimal"
	"github.com/masterkeysrd/saturn/internal/foundation/id"
	"github.com/masterkeysrd/saturn/internal/foundation/space"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
)

// TODO: Change for a config base currency
const DefaultBaseCurrency CurrencyCode = "USD"

type CurrencyStore interface {
	Get(context.Context, CurrencyCode) (*Currency, error)
	List(context.Context) ([]*Currency, error)
	Store(context.Context, *Currency) error
}

type CurrencyCode = money.CurrencyCode

type Currency struct {
	Code      CurrencyCode
	Name      string
	Rate      float64
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (c *Currency) Initialize() error {
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

type ExchangeRateStore interface {
	Get(context.Context, ExchangeRateKey) (*ExchangeRate, error)
	List(context.Context, space.ID) ([]*ExchangeRate, error)
	Exists(context.Context, ExchangeRateKey) (bool, error)
	Store(context.Context, *ExchangeRate) error
}

type ExchangeRateKey struct {
	SpaceID      space.ID
	CurrencyCode CurrencyCode
}

type ExchangeRate struct {
	ExchangeRateKey
	Rate       decimal.Decimal
	IsBase     bool
	CreateTime time.Time
	CreateBy   access.UserID
	UpdateTime time.Time
	UpdateBy   access.UserID
}

func (e *ExchangeRate) Initialize(actor access.Principal) error {
	if e == nil {
		return errors.New("exchange rate is nil")
	}

	e.SpaceID = actor.SpaceID()
	e.CreateBy = actor.ActorID()
	e.CreateTime = time.Now().UTC()
	e.UpdateBy = actor.ActorID()
	e.UpdateTime = e.CreateTime
	return nil
}

func (e *ExchangeRate) Validate() error {
	if e == nil {
		return errors.New("exchange rate is nil")
	}

	if err := id.Validate(e.SpaceID); err != nil {
		return fmt.Errorf("space id is invalid: %w", err)
	}

	if err := e.CurrencyCode.Validate(); err != nil {
		return fmt.Errorf("currency code is invalid: %w", err)
	}

	if e.Rate.Cmp(decimal.FromInt(0)) <= 0 {
		return errors.New("rate must be a positive number")
	}
	return nil
}
