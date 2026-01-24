package finance

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/access"
	"github.com/masterkeysrd/saturn/internal/foundation/decimal"
	"github.com/masterkeysrd/saturn/internal/foundation/fieldmask"
	"github.com/masterkeysrd/saturn/internal/foundation/id"
	"github.com/masterkeysrd/saturn/internal/foundation/space"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
)

const DefaultBaseCurrency CurrencyCode = "USD"

var (
	currencyMap = map[CurrencyCode]Currency{
		"CAD": {
			Code:          "CAD",
			Name:          "Canadian Dollar",
			Symbol:        "C$",
			DecimalPlaces: 2,
		},
		"COP": {
			Code:          "COP",
			Name:          "Colombian Peso",
			Symbol:        "COL$",
			DecimalPlaces: 0,
		},
		"DOP": {
			Code:          "DOP",
			Name:          "Dominican Peso",
			Symbol:        "RD$",
			DecimalPlaces: 2,
		},
		"EUR": {
			Code:          "EUR",
			Name:          "Euro",
			Symbol:        "€",
			DecimalPlaces: 2,
		},
		"JPY": {
			Code:          "JPY",
			Name:          "Japanese Yen",
			Symbol:        "¥",
			DecimalPlaces: 0,
		},
		"MXN": {
			Code:          "MXN",
			Name:          "Mexican Peso",
			Symbol:        "MX$",
			DecimalPlaces: 2,
		},
		"USD": {
			Code:          "USD",
			Name:          "United States Dollar",
			Symbol:        "$",
			DecimalPlaces: 2,
		},
	}

	currencyList = buildCurrencyList()
)

var SupportedCurrenciesList = currencyList

type CurrencyCode = money.CurrencyCode

type Currency struct {
	Code          CurrencyCode
	Name          string
	Symbol        string
	DecimalPlaces int32
}

type ExchangeRateStore interface {
	Get(context.Context, ExchangeRateKey) (*ExchangeRate, error)
	List(context.Context, space.ID) ([]*ExchangeRate, error)
	Exists(context.Context, ExchangeRateKey) (bool, error)
	Store(context.Context, *ExchangeRate) error
}

var ExchangeRateUpdateSchema = fieldmask.NewSchema("exchange_rate").
	Field("rate",
		fieldmask.WithDescription("The exchange rate value."),
		fieldmask.WithRequired(),
	).
	Build()

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

func (e *ExchangeRate) Update(actor access.Principal, input *ExchangeRate, updateMask *fieldmask.FieldMask) error {
	if e == nil {
		return errors.New("exchange rate is nil")
	}

	if updateMask == nil {
		return errors.New("update mask is nil")
	}

	if err := ExchangeRateUpdateSchema.Validate(updateMask); err != nil {
		return fmt.Errorf("invalid update mask: %w", err)
	}

	if updateMask.Contains("rate.value") {
		e.Rate = input.Rate
	}

	e.UpdateBy = actor.ActorID()
	e.UpdateTime = time.Now().UTC()
	return nil
}

// ConvertToBase converts an amount (in this rate's currency) BACK to the Base Currency.
//
// Logic: BaseAmount = Amount / Rate
// Example:
// - Rate: 1 USD = 63.1 DOP
// - Input: 6310 DOP (63.10 pesos)
// - Output: 100 USD (1.00 dollar)
func (e *ExchangeRate) ConvertToBase(amount money.Money, baseCurrencyCode CurrencyCode) (money.Money, error) {
	if e == nil {
		return money.Money{}, errors.New("exchange rate is nil")
	}

	// Ensure the money passed matches this exchange rate.
	// You cannot convert "EUR" using the "DOP" exchange rate.
	if amount.Currency != e.CurrencyCode {
		return money.Money{}, fmt.Errorf(
			"currency mismatch: cannot convert %s using exchange rate for %s",
			amount.Currency, e.CurrencyCode,
		)
	}

	if amount.Currency == baseCurrencyCode {
		return amount, nil
	}

	// Convert amount to decimal for calculation
	targetAmount := decimal.FromInt(int64(amount.Cents))

	// Calculate base amount
	baseAmount := targetAmount.Div(e.Rate)

	// Round to nearest cent
	finalCents := baseAmount.Round(0)

	return money.Money{
		Currency: baseCurrencyCode,
		Cents:    money.Cents(finalCents.IntPart()),
	}, nil
}

type UpdateExchangeRateInput struct {
	ExchangeRate *ExchangeRate
	UpdateMask   *fieldmask.FieldMask
}

func buildCurrencyList() []Currency {
	list := make([]Currency, 0, len(currencyMap))
	for _, currency := range currencyMap {
		list = append(list, currency)
	}
	return list
}
