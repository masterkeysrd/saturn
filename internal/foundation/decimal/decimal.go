package decimal

import (
	"database/sql/driver"
	"fmt"

	"github.com/shopspring/decimal"
)

// Decimal represents a fixed-point decimal number.
type Decimal struct {
	d decimal.Decimal
}

func FromString(s string) (Decimal, error) {
	d, err := decimal.NewFromString(s)
	if err != nil {
		return Decimal{}, fmt.Errorf("invalid decimal string: %w", err)
	}
	return Decimal{d: d}, nil
}

func FromInt(i int64) Decimal {
	return Decimal{d: decimal.NewFromInt(i)}
}

func (d Decimal) String() string {
	return d.d.String()
}

func (d Decimal) Value() (driver.Value, error) {
	return d.d.Value()
}

func (d *Decimal) Scan(value any) error {
	if err := d.d.Scan(value); err != nil {
		return fmt.Errorf("cannot scan decimal: %w", err)
	}
	return nil
}

func (d Decimal) UnmarshalText(text []byte) error {
	return d.d.UnmarshalText(text)
}

func (d *Decimal) UnmarshalBinary(data []byte) error {
	return d.d.UnmarshalBinary(data)
}

func (d Decimal) MarshalText() ([]byte, error) {
	return d.d.MarshalText()
}

func (d Decimal) MarshalBinary() ([]byte, error) {
	return d.d.MarshalBinary()
}

func (d Decimal) Cmp(other Decimal) int {
	return d.d.Cmp(other.d)
}
