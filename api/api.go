// Package api contains the OpenAPI 3.0 specification shared between the server and
// the client, mirroring the types and interfaces of saturn domain model.
//
// As we are using AWS Lambdas and API Gateway, we need are no generating the server
// code from the OpenAPI specification, but we are using the OpenAPI specification to
// generate the client code, types and interfaces.
package api

import (
	"github.com/masterkeysrd/saturn/internal/foundation/pagination"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
)

// To generate the models of the payload run:
// go generate ./...

//go:generate go tool oapi-codegen -config openapi-gen.yaml openapi.yaml

func MoneyModel(in Money) money.Money {
	if in.IsZero() {
		return money.Money{}
	}

	return money.Money{
		Currency: money.CurrencyCode(in.Currency),
		Cents:    money.Cents(in.Cents),
	}
}

func APIMoney(in money.Money) Money {
	if in.IsZero() {
		return Money{}
	}

	return Money{
		Currency: in.Currency.String(),
		Cents:    in.Cents.Int64(),
	}
}

func (m Money) IsZero() bool {
	return m == Money{}
}

type PaginationRequest struct {
	Page int `json:"page"`
	Size int `json:"size"`
}

func (p PaginationRequest) ToPagination() pagination.Pagination {
	return pagination.New(p.Page, p.Size)
}

type CreateBudgetRequest struct {
	Budget *Budget `json:"budgets"`
}

type ListBudgetsRequest struct {
	Search   string `json:"search"`
	Paginate PaginationRequest
}

type GetBudgetRequest struct {
	ID string
}

type UpdateBudgetRequest struct {
	ID         string
	Budget     *Budget
	UpdateMask *UpdateMaskParam
}

type DeleteBudgetRequest struct {
	ID string
}

type CreateCurrencyRequest struct {
	Currency *Currency
}

type GetCurrencyRequest struct {
	Code money.CurrencyCode
}

type ListCurrenciesRequest struct{}

type CreateExpenseRequest struct {
	Expense *Expense
}

type UpdateExpenseRequest struct {
	ID         string
	Expense    *Expense
	UpdateMask *UpdateMaskParam
}

type ListTransactionsRequest struct {
	Search   string `json:"search"`
	Paginate PaginationRequest
}

type GetTransactionRequest struct {
	ID string
}

type DeleteTransactionRequest struct {
	ID string
}

type GetFinanceInsightsRequest struct {
	FinanceGetInsightsParams
}

type RevokeSessionRequest struct {
	Token string `json:"token"`
}
