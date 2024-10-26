package apigateway

import (
	"context"
	"encoding/json"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/masterkeysrd/saturn/internal/foundations/transport"
)

type APIGatewayHandler func(ctx context.Context, event events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error)

type Options struct {
	ErrorEncoder ErrorEncoder
}

type Option func(*Options)

func Handle(handler transport.HandlerFunc, opts ...Option) {
	options := Options{
		ErrorEncoder: defaultErrorEncoder,
	}

	for _, o := range opts {
		o(&options)
	}

	lambda.Start(handle(handler, &options))
}

func handle(handler transport.HandlerFunc, opts *Options) APIGatewayHandler {
	return func(ctx context.Context, event events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
		ctx = CtxFromEvent(ctx, event)

		res, err := handler(ctx, []byte(event.Body))

		if err != nil {
			return opts.ErrorEncoder(ctx, err)
		}

		b, err := json.Marshal(res)
		if err != nil {
			return opts.ErrorEncoder(ctx, err)
		}

		return events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       string(b),
		}, nil
	}
}
