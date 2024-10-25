package expense

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/masterkeysrd/saturn/internal/foundations/errors"
	sdynamodb "github.com/masterkeysrd/saturn/internal/foundations/storage/dynamodb"
)

type Repository interface {
	Create(ctx context.Context, expense *Expense) error
}

type DynamoDBRepository struct {
	tableName string
	client    *sdynamodb.DynamoDB
}

func NewDynamoDBRepository(client *sdynamodb.DynamoDB) *DynamoDBRepository {
	return &DynamoDBRepository{
		tableName: "local-saturn-expenses",
		client:    client,
	}
}

func (r *DynamoDBRepository) Create(ctx context.Context, expense *Expense) error {
	const op = errors.Op("expense/repository.Create")

	item, err := attributevalue.MarshalMap(expense)
	if err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not marshal expense: %w", err))
	}

	_, err = r.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(r.tableName),
		Item:      item,
	})

	if err != nil {
		return errors.New(op, errors.Storage, fmt.Errorf("could not put item: %w", err))
	}

	return nil
}
