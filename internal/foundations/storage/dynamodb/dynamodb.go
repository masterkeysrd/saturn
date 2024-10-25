package dynamodb

import (
	"context"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

type Options struct {
	AWSConfig aws.Config
	Endpoint  string
}

type DynamoDB struct {
	*dynamodb.Client
}

type Client interface {
	PutItem(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error)
}

func New(cfg Options) *DynamoDB {
	client := dynamodb.NewFromConfig(cfg.AWSConfig, func(o *dynamodb.Options) {
		if cfg.Endpoint != "" {
			o.BaseEndpoint = aws.String(cfg.Endpoint)
		}
	})

	return &DynamoDB{Client: client}
}
