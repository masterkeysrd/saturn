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

func (e *ExchangeRate) ConvertMoney(amount money.Money) (money.Money, error) {
	if e == nil {
		return money.Money{}, errors.New("exchange rate is nil")
	}

	if amount.Currency == e.CurrencyCode {
		return amount, nil
	}

	convertedCents := decimal.FromInt(amount.Cents.Int64()).Mul(e.Rate)
	convertedCents = convertedCents.Round(0)

	return money.Money{
		Currency: e.CurrencyCode,
		Cents:    money.Cents(convertedCents.IntPart()),
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
