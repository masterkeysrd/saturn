package apigateway

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

type HandlerFunc func(ctx context.Context, payload []byte) (any, error)
type APIGatewayHandler func(ctx context.Context, event events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error)

func Handle(handler HandlerFunc) {
	lambda.Start(handle(handler))
}

func handle(handler HandlerFunc) APIGatewayHandler {
	return func(ctx context.Context, event events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
		res, err := handler(ctx, []byte(event.Body))

		if err != nil {
			return events.APIGatewayProxyResponse{
				StatusCode: 500,
				Body:       fmt.Sprintf("{\"error\": \"%s\"}", err.Error()),
			}, nil
		}

		b, err := json.Marshal(res)
		if err != nil {
			return events.APIGatewayProxyResponse{
				StatusCode: 500,
				Body:       "{\"error\": \"could not marshal response\"}",
			}, nil
		}

		return events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       string(b),
		}, nil
	}
}
