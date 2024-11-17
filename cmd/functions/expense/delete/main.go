package main

import (
	"context"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/masterkeysrd/saturn/internal/domain/expense"
	dynamodb "github.com/masterkeysrd/saturn/internal/foundations/storage/dynamodb"
	"github.com/masterkeysrd/saturn/internal/foundations/transport"
	"github.com/masterkeysrd/saturn/internal/foundations/transport/apigateway"
)

type Handler struct {
	expenseDeleter interface {
		Delete(ctx context.Context, id expense.ID) error
	}
}

func (h *Handler) Handle(ctx context.Context, payload []byte) (interface{}, error) {
	id := transport.PathParam(ctx, "id")

	if err := h.expenseDeleter.Delete(ctx, expense.ID(id)); err != nil {
		return nil, err
	}

	return nil, nil
}

var handler *Handler

func init() {
	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		panic("configuration error, " + err.Error())
	}

	client := dynamodb.New(dynamodb.ClientOptions{
		AWSConfig: cfg,
		Endpoint:  "http://dynamodb:8000",
	})

	repository := expense.NewDynamoDBRepository(client)
	service := expense.NewService(repository)

	handler = &Handler{
		expenseDeleter: service,
	}
}

func main() {
	apigateway.Handle(handler.Handle)
}
