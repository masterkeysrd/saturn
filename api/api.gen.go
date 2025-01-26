// Package api provides primitives to interact with the openapi HTTP API.
//
// Code generated by github.com/oapi-codegen/oapi-codegen/v2 version v2.4.1 DO NOT EDIT.
package api

// Defines values for ExpenseType.
const (
	Fixed    ExpenseType = "fixed"
	Variable ExpenseType = "variable"
)

// Budget A budget to track expenses
type Budget struct {
	// Amount The amount of the budget in cents (e.g. $10.00 is 1000)
	Amount int `json:"amount"`

	// Description A description of the budget
	Description string `json:"description"`

	// Id The unique identifier for the resource
	Id *ID `json:"id,omitempty"`
}

// Error An error response
type Error struct {
	// Message A message describing the error
	Message *string `json:"message,omitempty"`
}

// Expense An expense to track
type Expense struct {
	// Amount The amount of the expense in cents (e.g. $10.00 is 1000)
	Amount int `json:"amount"`

	// Budget The budget this expense is associated with
	Budget *struct {
		// Description A description of the budget
		Description *string `json:"description,omitempty"`

		// Id The unique identifier for the resource
		Id *ID `json:"id,omitempty"`
	} `json:"budget,omitempty"`

	// Description A description of the expense
	Description string `json:"description"`

	// Id The unique identifier for the resource
	Id *ID `json:"id,omitempty"`

	// Type The type of expense:
	//   - `fixed`: A recurring expense that is the same amount each month
	//   - `variable`: An expense that changes each month
	//
	// When `type` is `fixed`, the `amount` is the total amount of the expense. When `type` is `variable`, the `amount` is an estimate of the expense.
	Type ExpenseType `json:"type"`
}

// ExpenseType The type of expense:
//   - `fixed`: A recurring expense that is the same amount each month
//   - `variable`: An expense that changes each month
//
// When `type` is `fixed`, the `amount` is the total amount of the expense. When `type` is `variable`, the `amount` is an estimate of the expense.
type ExpenseType string

// ID The unique identifier for the resource
type ID = string

// BadRequestError An error response
type BadRequestError = Error

// ForbiddenError An error response
type ForbiddenError = Error

// InternalServerError An error response
type InternalServerError = Error

// NotFoundError An error response
type NotFoundError = Error

// CreateBudgetJSONRequestBody defines body for CreateBudget for application/json ContentType.
type CreateBudgetJSONRequestBody = Budget

// UpdateBudgetJSONRequestBody defines body for UpdateBudget for application/json ContentType.
type UpdateBudgetJSONRequestBody = Budget

// CreateExpenseJSONRequestBody defines body for CreateExpense for application/json ContentType.
type CreateExpenseJSONRequestBody = Expense

// UpdateExpenseJSONRequestBody defines body for UpdateExpense for application/json ContentType.
type UpdateExpenseJSONRequestBody = Expense
