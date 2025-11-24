package finance

import "github.com/masterkeysrd/saturn/internal/foundation/fieldmask"

// ExpenseUpdateSchema only includes updatable fields
var ExpenseUpdateSchema = fieldmask.NewSchema("expense").
	Field("name",
		fieldmask.WithDescription("Expense name"),
		fieldmask.WithRequired(),
	).
	Field("description",
		fieldmask.WithDescription("Expense description"),
	).
	Field("date",
		fieldmask.WithDescription("Expense date"),
		fieldmask.WithRequired(),
	).
	Field("amount",
		fieldmask.WithDescription("Expense amount in cents"),
		fieldmask.WithRequired(),
	).
	Field("exchange_rate",
		fieldmask.WithDescription("Custom exchange rate (optional)"),
	).
	Build()
