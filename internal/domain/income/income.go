package income

import (
	"fmt"
)

type ID string

type Income struct {
	ID     ID     `dynamodbav:"id"`
	Name   string `dynamodbav:"description"`
	Amount int    `dynamodbav:"amount"`
}

func (i *Income) Validate() error {
	if i == nil {
		return fmt.Errorf("income is nil")
	}

	if i.ID == "" {
		return fmt.Errorf("id is empty")
	}

	if i.Amount <= 0 {
		return fmt.Errorf("invalid amount: %d", i.Amount)
	}

	if i.Name == "" {
		return fmt.Errorf("description is empty")
	}

	return nil
}

func (i *Income) Update(other *Income) {
	if other.Amount > 0 {
		i.Amount = other.Amount
	}

	if other.Name != "" {
		i.Name = other.Name
	}
}
