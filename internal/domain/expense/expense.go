package expense

import "github.com/google/uuid"

type ID uuid.UUID

type Expense struct {
	ID          ID
	Amount      float32
	Description string
}
