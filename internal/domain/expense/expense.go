package expense

import (
	"fmt"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/masterkeysrd/saturn/internal/domain/budget"
)

type Expense struct {
	ID          ID        `dynamodbav:"id"`
	Type        Type      `dynamodbav:"type"`
	BudgetID    budget.ID `dynamodbav:"budget_id"`
	Budget      *Budget   `dynamodbav:"budget"`
	Description string    `dynamodbav:"description"`
	BillingDay  int       `dynamodbav:"billing_day"`
	Amount      int       `dynamodbav:"amount"`
}

type ID string

type Budget struct {
	Description string `dynamodbav:"description"`
}

func (e *Expense) Validate() error {
	if e == nil {
		return fmt.Errorf("expense is nil")
	}

	if e.ID == "" {
		return fmt.Errorf("id is empty")
	}

	if e.BudgetID == "" {
		return fmt.Errorf("budget_id is empty")
	}

	if e.Description == "" {
		return fmt.Errorf("description is empty")
	}

	if e.BillingDay < 1 || e.BillingDay > 31 {
		return fmt.Errorf("invalid billing day: %d", e.BillingDay)
	}

	if e.Amount <= 0 {
		return fmt.Errorf("invalid amount: %d", e.Amount)
	}

	return nil
}

// Type represents the type of the expense.
type Type int

// ExpenseType constants
const (
	TypeUnknown  Type = iota // Unknown type.
	TypeFixed                // Fixed type.
	TypeVariable             // Variable type.
)

func (t Type) MarshalText() ([]byte, error) {
	return []byte(t.String()), nil
}

func (t *Type) UnmarshalText(text []byte) error {
	*t = ParseType(string(text))
	return nil
}

func (t Type) MarshalBinary() ([]byte, error) {
	return []byte{byte(t)}, nil
}

func (t *Type) UnmarshalBinary(data []byte) error {
	*t = Type(data[0])
	return nil
}

// MarshalDynamoDBAttributeValue implements custom marshaling for DynamoDB.
func (t Type) MarshalDynamoDBAttributeValue() (types.AttributeValue, error) {
	return attributevalue.Marshal(t.String())
}

// UnmarshalDynamoDBAttributeValue implements custom unmarshaling for DynamoDB.
func (t *Type) UnmarshalDynamoDBAttributeValue(av types.AttributeValue) error {
	var str string
	if err := attributevalue.Unmarshal(av, &str); err != nil {
		return err
	}
	*t = ParseType(str)
	return nil
}

// String returns the string representation of the expense type.
func (t Type) String() string {
	switch t {
	case TypeFixed:
		return "fixed"
	case TypeVariable:
		return "variable"
	default:
		return "unknown"
	}
}

// ParseType parses the string representation of the expense type.
func ParseType(s string) Type {
	switch s {
	case "fixed":
		return TypeFixed
	case "variable":
		return TypeVariable
	default:
		return TypeUnknown
	}
}
