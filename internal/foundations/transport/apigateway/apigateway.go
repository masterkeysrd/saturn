package apigateway

import (
	"context"
	"encoding/json"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/masterkeysrd/saturn/internal/foundations/transport"
)

// APIGatewayProxyRequest is a type alias for [events.APIGatewayProxyRequest].
type APIGatewayProxyRequest = events.APIGatewayProxyRequest

// APIGatewayProxyResponse is a type alias for [events.APIGatewayProxyResponse].
type APIGatewayProxyResponse = events.APIGatewayProxyResponse

// APIGatewayHandler is a hadler function for AWS Lambda.
type APIGatewayHandler func(ctx context.Context, event APIGatewayProxyRequest) (APIGatewayProxyResponse, error)

// Options is a configuration struct for the Handle function.
type Options struct {
	ErrorEncoder ErrorEncoder           // error encoder function
	Middlewares  []transport.Middleware // middlewares to be executed
}

// Option is a function that modifies the Options struct.
type Option func(*Options)

// WithMiddlewares adds middlewares to the Options struct.
func WithMiddlewares(middlewares ...transport.Middleware) Option {
	return func(o *Options) {
		o.Middlewares = append(o.Middlewares, middlewares...)
	}
}

// Handle registers a transport.Handler to be executed by AWS Lambda.
func Handle(handler transport.Handler, opts ...Option) {
	options := buildOptions(opts...)
	lambda.Start(handle(handler.Handle, &options))
}

// HandleFn registers a transport.HandlerFunc to be executed by AWS Lambda.
func HandleFn(handler transport.HandlerFunc, opts ...Option) {
	options := buildOptions(opts...)
	lambda.Start(handle(handler, &options))
}

// handle is the internal handler function that wraps the transport.HandlerFunc
// and executes it with the given event, middlewares and error encoder.
func handle(handler transport.HandlerFunc, opts *Options) APIGatewayHandler {
	return func(ctx context.Context, event APIGatewayProxyRequest) (APIGatewayProxyResponse, error) {
		ctx = CtxFromEvent(ctx, event)

		h := handler
		for i := len(opts.Middlewares) - 1; i >= 0; i-- {
			h = func(next transport.HandlerFunc, middleware transport.Middleware) transport.HandlerFunc {
				return func(ctx context.Context, payload []byte) (interface{}, error) {
					res, err := middleware(ctx, payload, next)
					if err != nil {
						return nil, err
					}

					return res, nil
				}
			}(h, opts.Middlewares[i])
		}

		res, err := h(ctx, []byte(event.Body))

		if err != nil {
			return opts.ErrorEncoder(ctx, err)
		}

		if res == nil {
			return APIGatewayProxyResponse{
				StatusCode: 204,
			}, nil
		}

		b, err := json.Marshal(res)
		if err != nil {
			return opts.ErrorEncoder(ctx, err)
		}

		return APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       string(b),
		}, nil
	}
}

func buildOptions(opts ...Option) Options {
	options := Options{
		ErrorEncoder: defaultErrorEncoder,
	}

	for _, o := range opts {
		o(&options)
	}

	return options
}
