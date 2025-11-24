package finance

import (
	"errors"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/foundation/fieldmask"
)

// UpdateExpenseInput contains all data needed to update an expense
type UpdateExpenseInput struct {
	// ID is the transaction identifier
	ID TransactionID

	// Expense contains the fields to update
	Expense *Expense

	// UpdateMask specifies which fields to update.
	// If nil or empty, all fields are updated.
	UpdateMask *fieldmask.FieldMask
}

func (input *UpdateExpenseInput) Validate() error {
	if input.ID == "" {
		return errors.New("id is required")
	}

	if input.Expense == nil {
		return errors.New("expense is required")
	}

	// Validate against schema, don't validate rules just
	// mask fields presence.
	if err := ExpenseUpdateSchema.Validate(input.UpdateMask); err != nil {
		return fmt.Errorf("invalid field mask: %w", err)
	}

	return nil
}
