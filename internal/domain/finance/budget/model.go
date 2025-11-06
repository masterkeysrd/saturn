package budget

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/pkg/id"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
)

type Budget struct {
	ID        ID
	Name      string
	Amount    money.Cent
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (b *Budget) Create() error {
	id, err := id.New[ID]()
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

	if b.Amount <= 0 {
		return errors.New("amount field must be a positive number")
	}

	return nil
}

type ID string

func (id ID) String() string {
	return string(id)
}
