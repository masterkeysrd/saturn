package main

import (
	"context"
	"encoding/json"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/expense"
	dynamodb "github.com/masterkeysrd/saturn/internal/foundations/storage/dynamodb"
	"github.com/masterkeysrd/saturn/internal/foundations/transport"
	"github.com/masterkeysrd/saturn/internal/foundations/transport/apigateway"
)

type Handler struct {
	expenseUpdater interface {
		Update(ctx context.Context, exp *expense.Expense) error
	}
}

func (h *Handler) Handle(ctx context.Context, payload []byte) (interface{}, error) {
	var req api.Expense
	if err := json.Unmarshal(payload, &req); err != nil {
		return nil, err
	}

	id := transport.PathParam(ctx, "id")
	req.Id = &id

	exp := api.SaturnExpense(&req)
	if err := h.expenseUpdater.Update(ctx, exp); err != nil {
		return nil, err
	}

	return api.APIExpense(exp), nil
}

var handler *Handler

func init() {
	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		panic("configuration error, " + err.Error())
	}

	client := dynamodb.New(dynamodb.Options{
		AWSConfig: cfg,
		Endpoint:  "http://dynamodb:8000",
	})

	repository := expense.NewDynamoDBRepository(client)
	service := expense.NewService(repository)

	handler = &Handler{
		expenseUpdater: service,
	}
}

func main() {
	apigateway.Handle(handler.Handle)
}
