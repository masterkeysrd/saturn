package main

import (
	"context"

	expenseapi "github.com/masterkeysrd/saturn/api/expense"
	"github.com/masterkeysrd/saturn/internal/config"
	"github.com/masterkeysrd/saturn/internal/domain/expense"
	"github.com/masterkeysrd/saturn/internal/foundations/storage/dynamodb"
	"github.com/masterkeysrd/saturn/internal/foundations/transport"
	"github.com/masterkeysrd/saturn/internal/foundations/transport/apigateway"
)

var handler transport.Handler

func init() {
	cfg, err := config.NewFromEnv(context.Background())
	if err != nil {
		panic("configuration error, " + err.Error())
	}

	client := dynamodb.New(dynamodb.ClientOptions{
		AWSConfig: cfg.AWS(),
		Endpoint:  cfg.DynamoDB().Endpoint(),
	})

	repository := expense.NewDynamoDBRepository(client)
	service := expense.NewService(repository)
	server := expenseapi.NewServer(service)
	handler = transport.NewHandler(server.List)
}

func main() {
	apigateway.Handle(handler)
}
