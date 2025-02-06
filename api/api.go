// Package api contains the OpenAPI 3.0 specification shared between the server and
// the client, mirroring the types and interfaces of saturn domain model.
//
// As we are using AWS Lambdas and API Gateway, we need are no generating the server
// code from the OpenAPI specification, but we are using the OpenAPI specification to
// generate the client code, types and interfaces.
package api

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/budget"
	"github.com/masterkeysrd/saturn/internal/domain/category"
	"github.com/masterkeysrd/saturn/internal/domain/expense"
	"github.com/masterkeysrd/saturn/internal/domain/income"
	"github.com/masterkeysrd/saturn/internal/foundations/log"
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

	var categoryID category.ID
	if exp.Category.Id != nil {
		categoryID = category.ID(*exp.Category.Id)
	}

	return &expense.Expense{
		ID:          id,
		Type:        expense.ParseType(string(exp.Type)),
		BudgetID:    budget.ID(exp.Budget.Id),
		CategoryID:  categoryID,
		Description: exp.Description,
		BillingDay:  exp.BillingDay,
		Amount:      exp.Amount,
	}
}

func APIExpense(exp *expense.Expense) *Expense {
	id := string(exp.ID)

	out := Expense{
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

	if exp.Category != nil {
		categoryID := string(exp.CategoryID)
		out.Category = &Category{
			Id:   &categoryID,
			Name: exp.Category.Name,
		}
	}

	return &out
}

func APIExpenses(exps []*expense.Expense) []*Expense {
	res := make([]*Expense, len(exps))
	for i, exp := range exps {
		res[i] = APIExpense(exp)
	}

	return res
}

func SaturnIncome(inc *Income) *income.Income {
	log.InfoCtx(context.Background(), "SaturnIncome", log.Any("exp", inc))
	var id income.ID
	if inc.Id != nil {
		id = income.ID(*inc.Id)
	}

	var categoryID category.ID
	if inc.Category.Id != nil {
		categoryID = category.ID(*inc.Category.Id)
	}

	log.InfoCtx(context.Background(), "SaturnIncome", log.Any("categoryID", categoryID))

	return &income.Income{
		ID:         id,
		CategoryID: categoryID,
		Name:       inc.Name,
		Amount:     inc.Amount,
	}
}

func APIIncome(exp *income.Income) *Income {
	id := string(exp.ID)

	out := Income{
		Id:     &id,
		Name:   exp.Name,
		Amount: exp.Amount,
	}

	if exp.Category != nil {
		categoryID := string(exp.CategoryID)
		out.Category = &Category{
			Id:   &categoryID,
			Name: exp.Category.Name,
		}
	}

	return &out
}

func APIIncomes(exps []*income.Income) []*Income {
	res := make([]*Income, len(exps))
	for i, exp := range exps {
		res[i] = APIIncome(exp)
	}

	return res
}

func SaturnCategory(exp *Category) *category.Category {
	var id category.ID
	if exp.Id != nil {
		id = category.ID(*exp.Id)
	}

	return &category.Category{
		ID:   id,
		Name: exp.Name,
	}
}

func APICategory(exp *category.Category) *Category {
	id := string(exp.ID)

	return &Category{
		Id:   &id,
		Name: exp.Name,
	}
}

func APICategories(exps []*category.Category) []*Category {
	res := make([]*Category, len(exps))
	for i, exp := range exps {
		res[i] = APICategory(exp)
	}

	return res
}
