package main

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/expense"
	sdynamodb "github.com/masterkeysrd/saturn/internal/foundations/storage/dynamodb"
)

func handler(ctx context.Context, event events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
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
	if err := json.Unmarshal([]byte(event.Body), &req); err != nil {
		return events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       "Could not unmarshal request",
		}, nil
	}

	exp := api.SaturnExpense(&req)

	if err := service.Create(ctx, exp); err != nil {
		return events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       fmt.Sprintf("{\"error\": \"%s\"}", err.Error()),
		}, nil
	}

	res, err := json.Marshal(api.APIExpense(exp))
	if err != nil {
		return events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       "Could not marshal response",
		}, nil
	}

	return events.APIGatewayProxyResponse{
		StatusCode: 200,
		Body:       string(res),
	}, nil
}

func main() {
	lambda.Start(handler)
}
