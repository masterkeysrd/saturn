package apigateway

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/foundations/transport"
)

func CtxFromEvent(parent context.Context, event APIGatewayProxyRequest) context.Context {
	params := make(map[string]string)
	for k, v := range event.PathParameters {
		params[k] = v
	}

	var claims map[string]interface{}
	if c, ok := event.RequestContext.Authorizer["claims"].(map[string]interface{}); ok {
		claims = c
	}

	return transport.WithContext(parent).
		WithPathParams(params).
		WithRawEvent(event).
		WithClaims(transport.Claims(claims)).
		Context()
}
