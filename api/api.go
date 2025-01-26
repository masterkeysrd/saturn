// Package api contains the OpenAPI 3.0 specification shared between the server and
// the client, mirroring the types and interfaces of saturn domain model.
//
// As we are using AWS Lambdas and API Gateway, we need are no generating the server
// code from the OpenAPI specification, but we are using the OpenAPI specification to
// generate the client code, types and interfaces.
package api

import (
	"github.com/masterkeysrd/saturn/internal/domain/budget"
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
