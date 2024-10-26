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
	List(ctx context.Context) ([]*Expense, error)
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

func (r *DynamoDBRepository) List(ctx context.Context) ([]*Expense, error) {
	const op = errors.Op("expense/repository.List")

	// TODO: Change this to use Query instead of Scan when
	// we implement the user_id index
	res, err := r.client.Scan(ctx, &dynamodb.ScanInput{
		TableName: aws.String(r.tableName),
	})
	if err != nil {
		return nil, errors.New(op, errors.Storage, fmt.Errorf("could not scan table: %w", err))
	}

	expenses := make([]*Expense, len(res.Items))
	for i, item := range res.Items {
		exp := new(Expense)
		if err := attributevalue.UnmarshalMap(item, exp); err != nil {
			return nil, errors.New(op, errors.Internal, fmt.Errorf("could not unmarshal expense: %w", err))
		}

		expenses[i] = exp
	}

	return expenses, nil
}
