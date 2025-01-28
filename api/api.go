// Package api contains the OpenAPI 3.0 specification shared between the server and
// the client, mirroring the types and interfaces of saturn domain model.
//
// As we are using AWS Lambdas and API Gateway, we need are no generating the server
// code from the OpenAPI specification, but we are using the OpenAPI specification to
// generate the client code, types and interfaces.
package api

import (
	"github.com/masterkeysrd/saturn/internal/domain/budget"
	"github.com/masterkeysrd/saturn/internal/domain/expense"
	"github.com/masterkeysrd/saturn/internal/domain/income"
)

// To generate the client code, types and interfaces from the OpenAPI specification, run:
// go generate ./...

//go:generate go run -modfile=../tools/go.mod github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen -config openapi-gen.yaml openapi.yaml

func SaturnBudget(exp *Budget) *budget.Budget {
	var id budget.ID
	if exp.Id != nil {
		id = budget.ID(*exp.Id)
	}
	return &budget.Budget{
		ID:          budget.ID(id),
		Amount:      exp.Amount,
		Description: exp.Description,
	}
}

func APIBudget(exp *budget.Budget) *Budget {
	id := string(exp.ID)
	return &Budget{
		Id:          &id,
		Amount:      exp.Amount,
		Description: exp.Description,
	}
}

func APIBudgets(exps []*budget.Budget) []*Budget {
	res := make([]*Budget, len(exps))
	for i, exp := range exps {
		res[i] = APIBudget(exp)
	}

	return res
}

func SaturnExpense(exp *Expense) *expense.Expense {
	var id expense.ID
	if exp.Id != nil {
		id = expense.ID(*exp.Id)
	}

	return &expense.Expense{
		ID:          id,
		Type:        expense.ParseType(string(exp.Type)),
		BudgetID:    budget.ID(exp.Budget.Id),
		Description: exp.Description,
		BillingDay:  exp.BillingDay,
		Amount:      exp.Amount,
	}
}

func APIExpense(exp *expense.Expense) *Expense {
	id := string(exp.ID)

	return &Expense{
		Id:   &id,
		Type: ExpenseType(exp.Type.String()),
		Budget: struct {
			Description *string `json:"description,omitempty"`
			Id          ID      `json:"id"`
		}{
			Id:          ID(exp.BudgetID),
			Description: &exp.Budget.Description,
		},
		Description: exp.Description,
		BillingDay:  exp.BillingDay,
		Amount:      exp.Amount,
	}
}

func APIExpenses(exps []*expense.Expense) []*Expense {
	res := make([]*Expense, len(exps))
	for i, exp := range exps {
		res[i] = APIExpense(exp)
	}

	return res
}

func SaturnIncome(exp *Income) *income.Income {
	var id income.ID
	if exp.Id != nil {
		id = income.ID(*exp.Id)
	}

	return &income.Income{
		ID:     id,
		Name:   exp.Name,
		Amount: exp.Amount,
	}
}

func APIIncome(exp *income.Income) *Income {
	id := string(exp.ID)

	return &Income{
		Id:     &id,
		Name:   exp.Name,
		Amount: exp.Amount,
	}
}

func APIIncomes(exps []*income.Income) []*Income {
	res := make([]*Income, len(exps))
	for i, exp := range exps {
		res[i] = APIIncome(exp)
	}

	return res
}
