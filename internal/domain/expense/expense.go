package expense

import (
	"github.com/masterkeysrd/saturn/internal/foundations/uuid"
)

type ID uuid.UUID

type Expense struct {
	ID          ID     `dynamodbav:"id"`
	Amount      int    `dynamodbav:"amount"`
	Description string `dynamodbav:"description"`
}
