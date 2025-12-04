package finance

import (
	"errors"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/pkg/money"
)

// TODO: Change for a config base currency
const DefaultBaseCurrency CurrencyCode = "USD"

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

type CurrencyCode = money.CurrencyCode
