package dynamodb

import (
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

func DefaultNameResolver(name string) string {
	return name
}

type Options struct {
	AWSConfig aws.Config
	Endpoint  string
}

type DynamoDB struct {
	*dynamodb.Client
}

func New(cfg Options) *DynamoDB {
	client := dynamodb.NewFromConfig(cfg.AWSConfig, func(o *dynamodb.Options) {
		if cfg.Endpoint != "" {
			o.BaseEndpoint = aws.String(cfg.Endpoint)
		}
	})

	return &DynamoDB{Client: client}
}
