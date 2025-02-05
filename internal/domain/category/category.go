package category

import "github.com/masterkeysrd/saturn/internal/foundations/errors"

type ID string

type Category struct {
	ID   ID     `dynamodbav:"id"`
	Name string `dynamodbav:"name"`
}

func (c *Category) Validate() error {
	if c.ID == "" {
		return errors.New("id is required")
	}

	if c.Name == "" {
		return errors.New("name is required")
	}

	return nil
}

func (c *Category) Update(other *Category) {
	if other.Name != "" {
		c.Name = other.Name
	}
}

type CategoryType string

const (
	ExpenseCategoryType CategoryType = "expense"
	IncomeCategoryType  CategoryType = "income"
)

func (t CategoryType) Validate() error {
	switch t {
	case ExpenseCategoryType, IncomeCategoryType:
		return nil
	default:
		return errors.New("invalid category type")
	}
}
