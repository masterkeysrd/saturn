package main

import (
	"context"

	categoryapi "github.com/masterkeysrd/saturn/api/category"
	"github.com/masterkeysrd/saturn/internal/config"
	"github.com/masterkeysrd/saturn/internal/domain/category"
	"github.com/masterkeysrd/saturn/internal/domain/general/lists"
	"github.com/masterkeysrd/saturn/internal/foundations/auth"
	"github.com/masterkeysrd/saturn/internal/foundations/log"
	"github.com/masterkeysrd/saturn/internal/foundations/storage/dynamodb"
	"github.com/masterkeysrd/saturn/internal/foundations/transport"
	"github.com/masterkeysrd/saturn/internal/foundations/transport/apigateway"
)

var handler transport.Handler

func init() {
	log.Init()
	cfg, err := config.NewFromEnv(context.Background())
	if err != nil {
		panic("configuration error, " + err.Error())
	}

	client := dynamodb.New(dynamodb.ClientOptions{
		AWSConfig: cfg.AWS(),
		Endpoint:  cfg.DynamoDB().Endpoint(),
	})

	listRepository := lists.NewDynamoDBRepository(client)
	listService := lists.NewService(listRepository)

	service := category.NewService(listService)
	server := categoryapi.NewServer(service)
	handler = transport.NewHandler(server.Get)
}

func main() {
	apigateway.Handle(
		handler,
		apigateway.WithMiddlewares(
			auth.Middleware,
		),
	)
}
