package main

import (
	"context"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/expense"
	sdynamodb "github.com/masterkeysrd/saturn/internal/foundations/storage/dynamodb"
	"github.com/masterkeysrd/saturn/internal/foundations/transport/apigateway"
)

type Handler struct {
	expenseLister interface {
		List(ctx context.Context) ([]*expense.Expense, error)
	}
}

func (h *Handler) Handle(ctx context.Context, payload []byte) (interface{}, error) {
	exps, err := h.expenseLister.List(ctx)
	if err != nil {
		return nil, err
	}

	return api.APIExpenses(exps), nil
}

var handler *Handler

func init() {
	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		panic("configuration error, " + err.Error())
	}

	client := sdynamodb.New(sdynamodb.Options{
		AWSConfig: cfg,
		Endpoint:  "http://dynamodb:8000",
	})

	repository := expense.NewDynamoDBRepository(client)
	service := expense.NewService(repository)

	handler = &Handler{
		expenseLister: service,
	}
}

func main() {
	apigateway.Handle(handler.Handle)
}
