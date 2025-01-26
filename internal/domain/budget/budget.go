package budget

import (
	"fmt"
)

type ID string

type Budget struct {
	ID          ID     `dynamodbav:"id"`
	Amount      int    `dynamodbav:"amount"`
	Description string `dynamodbav:"description"`
}

func (e *Budget) Validate() error {
	if e == nil {
		return fmt.Errorf("budget is nil")
	}

	if e.ID == "" {
		return fmt.Errorf("id is empty")
	}

	if e.Amount <= 0 {
		return fmt.Errorf("invalid amount: %d", e.Amount)
	}

	if e.Description == "" {
		return fmt.Errorf("description is empty")
	}

	return nil
}

func (e *Budget) Update(other *Budget) {
	if other.Amount > 0 {
		e.Amount = other.Amount
	}

	if other.Description != "" {
		e.Description = other.Description
	}
}
