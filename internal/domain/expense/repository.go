package expense

import (
	"context"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
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
	item, err := attributevalue.MarshalMap(expense)
	if err != nil {
		return err
	}

	_, err = r.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(r.tableName),
		Item:      item,
	})

	return err
}
