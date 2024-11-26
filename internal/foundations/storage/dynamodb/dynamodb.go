package dynamodb

import (
	"context"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

type Options = dynamodb.Options
type GetItemInput = dynamodb.GetItemInput
type GetItemOutput = dynamodb.GetItemOutput
type QueryInput = dynamodb.QueryInput
type QueryOutput = dynamodb.QueryOutput
type ScanInput = dynamodb.ScanInput
type ScanOutput = dynamodb.ScanOutput
type PutItemInput = dynamodb.PutItemInput
type PutItemOutput = dynamodb.PutItemOutput
type DeleteItemInput = dynamodb.DeleteItemInput
type DeleteItemOutput = dynamodb.DeleteItemOutput

type ClientOptions struct {
	AWSConfig aws.Config
	Endpoint  string
}

type DynamoDB struct {
	*dynamodb.Client
}

type Client interface {
	Query(ctx context.Context, params *QueryInput, optFns ...func(*Options)) (*QueryOutput, error)
	Scan(ctx context.Context, params *ScanInput, optFns ...func(*Options)) (*ScanOutput, error)
	GetItem(ctx context.Context, params *GetItemInput, optFns ...func(*Options)) (*GetItemOutput, error)
	PutItem(ctx context.Context, params *PutItemInput, optFns ...func(*Options)) (*PutItemOutput, error)
	DeleteItem(ctx context.Context, params *DeleteItemInput, optFns ...func(*Options)) (*DeleteItemOutput, error)
}

func New(cfg ClientOptions) *DynamoDB {
	client := dynamodb.NewFromConfig(cfg.AWSConfig, func(o *Options) {
		if cfg.Endpoint != "" {
			o.BaseEndpoint = aws.String(cfg.Endpoint)
		}
	})

	return &DynamoDB{Client: client}
}
