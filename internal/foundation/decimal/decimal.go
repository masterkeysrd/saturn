package decimal

import (
	"database/sql/driver"
	"fmt"

	"github.com/shopspring/decimal"
)

var Zero = Decimal{d: decimal.Zero}

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

func (d Decimal) Mul(other Decimal) Decimal {
	return Decimal{d: d.d.Mul(other.d)}
}

func (d Decimal) Div(other Decimal) Decimal {
	return Decimal{d: d.d.Div(other.d)}
}

func (d Decimal) Round(places int32) Decimal {
	return Decimal{d: d.d.Round(places)}
}

func (d Decimal) IntPart() int64 {
	return d.d.IntPart()
}

func (d Decimal) IsZero() bool {
	return d.d.IsZero()
}

func (d Decimal) IsNegative() bool {
	return d.d.IsNegative()
}

func (d Decimal) IsPositive() bool {
	return d.d.IsPositive()
}
