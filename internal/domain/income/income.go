package income

import (
	"fmt"

	"github.com/masterkeysrd/saturn/internal/domain/category"
)

type ID string

type Income struct {
	ID         ID          `dynamodbav:"id"`
	CategoryID category.ID `dynamodbav:"category_id"`
	Category   *Category   `dynamodbav:"category"`
	Name       string      `dynamodbav:"description"`
	Amount     int         `dynamodbav:"amount"`
}

func (i *Income) Validate() error {
	if i == nil {
		return fmt.Errorf("income is nil")
	}

	if i.ID == "" {
		return fmt.Errorf("id is empty")
	}

	if i.CategoryID == "" {
		return fmt.Errorf("category id is empty")
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

	if other.CategoryID != "" {
		i.CategoryID = other.CategoryID
	}

	if other.Category != nil {
		i.Category = other.Category
	}
}

type Category struct {
	Name string `dynamodbav:"name"`
}
