package apigateway

import (
	"context"

	"github.com/aws/aws-lambda-go/events"
	"github.com/masterkeysrd/saturn/internal/foundations/transport"
)

func CtxFromEvent(ctx context.Context, event events.APIGatewayProxyRequest) context.Context {
	params := make(map[string]string)
	for k, v := range event.PathParameters {
		params[k] = v
	}

	return transport.WithPathParams(ctx, params)
}
