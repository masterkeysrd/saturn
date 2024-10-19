// Package api contains the OpenAPI 3.0 specification shared between the server and
// the client, mirroring the types and interfaces of saturn domain model.
//
// As we are using AWS Lambdas and API Gateway, we need are no generating the server
// code from the OpenAPI specification, but we are using the OpenAPI specification to
// generate the client code, types and interfaces.
package api

import "github.com/masterkeysrd/saturn/internal/domain/expense"

// To generate the client code, types and interfaces from the OpenAPI specification, run:
// go generate ./...

//go:generate go run -modfile=../tools/go.mod github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen -config openapi-gen.yaml openapi.yaml
func SaturnExpense(exp *Expense) *expense.Expense {
	return &expense.Expense{
		ID:          expense.ID(*exp.Id),
		Amount:      exp.Amount,
		Description: exp.Description,
	}
}

func APIExpense(exp *expense.Expense) *Expense {
	return &Expense{
		Id:          (*ID)(&exp.ID),
		Amount:      exp.Amount,
		Description: exp.Description,
	}
}
