// Package api contains the OpenAPI 3.0 specification shared between the server and
// the client, mirroring the types and interfaces of saturn domain model.
//
// As we are using AWS Lambdas and API Gateway, we need are no generating the server
// code from the OpenAPI specification, but we are using the OpenAPI specification to
// generate the client code, types and interfaces.
package api

// To generate the models of the payload run:
// go generate ./...

//go:generate go tool oapi-codegen -config openapi-gen.yaml openapi.yaml

type CreateBudgetRequest struct {
	Budget *Budget
}

type ListBudgetsRequest struct{}
