package main

import (
	"context"
	"encoding/json"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/expense"
	sdynamodb "github.com/masterkeysrd/saturn/internal/foundations/storage/dynamodb"
	"github.com/masterkeysrd/saturn/internal/foundations/transport/apigateway"
)

func handler(ctx context.Context, payload []byte) (interface{}, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		panic("configuration error, " + err.Error())
	}

	client := sdynamodb.New(sdynamodb.Options{
		AWSConfig: cfg,
		Endpoint:  "http://dynamodb:8000",
	})

	repository := expense.NewDynamoDBRepository(client)
	service := expense.NewService(repository)

	var req api.Expense
	if err := json.Unmarshal(payload, &req); err != nil {
		return nil, err
	}

	exp := api.SaturnExpense(&req)
	if err := service.Create(ctx, exp); err != nil {
		return nil, err
	}

	return api.APIExpense(exp), nil
}

func main() {
	apigateway.Handle(handler)
}
