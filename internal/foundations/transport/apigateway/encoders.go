package apigateway

import (
	"context"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/foundations/errors"
)

type ErrorEncoder func(ctx context.Context, err error) (APIGatewayProxyResponse, error)

func defaultErrorEncoder(ctx context.Context, err error) (APIGatewayProxyResponse, error) {
	status := 500
	switch {
	case errors.Is(err, errors.Invalid):
		status = 400
	case errors.Is(err, errors.Permission):
		status = 403
	case errors.Is(err, errors.NotExist):
		status = 404
	case errors.Is(err, errors.Exist):
		status = 409
	case errors.Is(err, errors.IO):
		status = 500
	case errors.Is(err, errors.Storage):
		status = 500
	case errors.Is(err, errors.Internal):
		status = 500
	case errors.Is(err, errors.Other):
		status = 500
	}

	return APIGatewayProxyResponse{
		StatusCode: status,
		Body:       fmt.Sprintf(`{"error": "%s"}`, err.Error()),
	}, nil
}
