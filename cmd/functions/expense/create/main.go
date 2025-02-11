package main

import (
	"context"

	expenseapi "github.com/masterkeysrd/saturn/api/expense"
	"github.com/masterkeysrd/saturn/internal/config"
	"github.com/masterkeysrd/saturn/internal/domain/budget"
	"github.com/masterkeysrd/saturn/internal/domain/category"
	"github.com/masterkeysrd/saturn/internal/domain/expense"
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

	categoryService := category.NewService(listService)

	budgetRepository := budget.NewDynamoDBRepository(client)
	budgetService := budget.NewService(budgetRepository)

	expenseRepository := expense.NewDynamoDBRepository(client)
	expenseService := expense.NewService(expense.ServiceParams{
		Repository:      expenseRepository,
		BudgetService:   budgetService,
		CategoryService: categoryService,
	})
	server := expenseapi.NewServer(expenseService)
	handler = transport.NewHandler(server.Create)
}

func main() {
	apigateway.Handle(handler,
		apigateway.WithMiddlewares(
			auth.Middleware,
		),
	)
}
