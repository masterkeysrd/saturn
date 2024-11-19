package config

import (
	"context"
	"fmt"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
)

type Config interface {
	// AWS returns the AWS configuration.
	AWS() aws.Config

	// DynamoDB returns the DynamoDB configuration.
	DynamoDB() DynamoDBConfig
}

type DynamoDBConfig interface {
	// Endpoint returns the DynamoDB endpoint.
	Endpoint() string
}

type configImpl struct {
	awsConfig      aws.Config
	dynamoDBConfig DynamoDBConfig
}

func (c *configImpl) AWS() aws.Config {
	if c == nil {
		return aws.Config{}
	}

	return c.awsConfig
}

func (c *configImpl) DynamoDB() DynamoDBConfig {
	if c == nil {
		return nil
	}

	return c.dynamoDBConfig
}

type dynamoDBConfigImpl struct {
	endpoint string
}

func (c *dynamoDBConfigImpl) Endpoint() string {
	if c == nil {
		return ""
	}

	return c.endpoint
}

// NewFromEnv creates a new configuration from environment variables.
func NewFromEnv(ctx context.Context) (Config, error) {
	awscfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("unable to load AWS configuration, %w", err)
	}

	return &configImpl{
		awsConfig:      awscfg,
		dynamoDBConfig: newDynamoDBConfigFromEnv(),
	}, nil
}

func newDynamoDBConfigFromEnv() DynamoDBConfig {
	return &dynamoDBConfigImpl{
		endpoint: os.Getenv("DYNAMODB_ENDPOINT"),
	}
}
