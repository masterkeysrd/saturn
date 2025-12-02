package appearance

import (
	"errors"
	"strings"
)

// Color represents a validated, normalized Hex color string.
type Color string

const DefaultColorHex Color = "#2196f3" // Blue

// NewColor creates a verified Color.
// It normalizes input (trim, uppercase) and validates format.
// If input is empty, it returns the DefaultColor.
func NewColor(c string) (Color, error) {
	c = strings.TrimSpace(c)
	if c == "" {
		return DefaultColorHex, nil
	}

	// Normalize
	color := Color(strings.ToLower(c))
	if err := color.Validate(); err != nil {
		return "", err
	}
	return Color(c), nil
}

// MustNewColor creates a Color or panics. Use for static constants only.
func MustNewColor(c string) Color {
	col, err := NewColor(c)
	if err != nil {
		panic(err)
	}
	return col
}

func (c Color) String() string { return string(c) }

func (c Color) Validate() error {
	n := len(c)
	if n != 4 && n != 7 {
		return errors.New("color must be a valid hex code (e.g., #FFFFFF or #FFF)")
	}

	if c[0] != '#' {
		return errors.New("color must start with #")
	}

	for i := 1; i < n; i++ {
		if !isHex(c[i]) {
			return errors.New("color contains invalid characters")
		}
	}
	return nil
}

// Icon represents a validated UI icon identifier.
type Icon string

const DefaultIconName Icon = "wallet" // Material Icon identifier

// NewIcon creates a verified Icon.
// It normalizes input (trim) and validates format.
// If input is empty, it returns the DefaultIcon.
func NewIcon(i string) (Icon, error) {
	i = strings.TrimSpace(i)
	if i == "" {
		return Icon(DefaultIconName), nil
	}

	ico := Icon(i)
	if err := ico.Validate(); err != nil {
		return "", err
	}

	return ico, nil
}

func (i Icon) String() string { return string(i) }

func (i Icon) Validate() error {
	if len(i) > 32 {
		return errors.New("icon name exceeds maximum length of 32 characters")
	}

	for _, r := range i {
		if !isSafeIconChar(r) {
			return errors.New("icon name contains invalid characters")
		}
	}
	return nil
}

// Appearance acts as a Value Object grouping visual properties.
type Appearance struct {
	Color Color
	Icon  Icon
}

// New creates a validated Appearance value object.
func New(colorStr, iconStr string) (Appearance, error) {
	color, err := NewColor(colorStr)
	if err != nil {
		return Appearance{}, err
	}

	icon, err := NewIcon(iconStr)
	if err != nil {
		return Appearance{}, err
	}

	return Appearance{
		Color: color,
		Icon:  icon,
	}, nil
}

// IsDefault checks if the appearance matches the application defaults.
func (a Appearance) IsDefault() bool {
	return a.Color == DefaultColorHex && a.Icon == DefaultIconName
}

func (a Appearance) Validate() error {
	if err := a.Color.Validate(); err != nil {
		return err
	}
	if err := a.Icon.Validate(); err != nil {
		return err
	}
	return nil
}

func isHex(b byte) bool {
	return (b >= '0' && b <= '9') ||
		(b >= 'a' && b <= 'f') ||
		(b >= 'A' && b <= 'F')
}

func isSafeIconChar(r rune) bool {
	return (r >= 'a' && r <= 'z') ||
		(r >= 'A' && r <= 'Z') ||
		(r >= '0' && r <= '9') ||
		r == '_' ||
		r == '-'
}
