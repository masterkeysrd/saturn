package expense

import (
	"fmt"
)

type ID string

type Expense struct {
	ID          ID     `dynamodbav:"id"`
	Amount      int    `dynamodbav:"amount"`
	Description string `dynamodbav:"description"`
}

func (e *Expense) Validate() error {
	if e == nil {
		return fmt.Errorf("expense is nil")
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

func (e *Expense) Update(other *Expense) {
	if other.Amount > 0 {
		e.Amount = other.Amount
	}

	if other.Description != "" {
		e.Description = other.Description
	}
}
