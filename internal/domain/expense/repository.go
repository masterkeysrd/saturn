package expense

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/masterkeysrd/saturn/internal/foundations/errors"
	dynamodb "github.com/masterkeysrd/saturn/internal/foundations/storage/dynamodb"
)

type Repository interface {
	List(ctx context.Context) ([]*Expense, error)
	Get(ctx context.Context, id ID) (*Expense, error)
	Create(ctx context.Context, expense *Expense) error
	Update(ctx context.Context, expense *Expense) error
	Delete(ctx context.Context, id ID) error
}

type DynamoDBRepository struct {
	tableName string
	client    dynamodb.Client
}

func NewDynamoDBRepository(client *dynamodb.DynamoDB) *DynamoDBRepository {
	return &DynamoDBRepository{
		tableName: "local-saturn-expenses",
		client:    client,
	}
}

func (r *DynamoDBRepository) Get(ctx context.Context, id ID) (*Expense, error) {
	const op = errors.Op("expense/repository.Get")

	item, err := r.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(r.tableName),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{
				Value: string(id),
			},
		},
	})

	if err != nil {
		return nil, errors.New(op, errors.Storage, fmt.Errorf("could not get item: %w", err))
	}

	if item.Item == nil {
		return nil, errors.New(op, errors.NotExist, fmt.Errorf("could not find item"))
	}

	var exp Expense
	if err := attributevalue.UnmarshalMap(item.Item, &exp); err != nil {
		return nil, errors.New(op, errors.Internal, fmt.Errorf("could not unmarshal expense: %w", err))
	}

	return &exp, nil
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

func (r *DynamoDBRepository) Update(ctx context.Context, expense *Expense) error {
	const op = errors.Op("expense/repository.Update")

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

func (r *DynamoDBRepository) Delete(ctx context.Context, id ID) error {
	const op = errors.Op("expense/repository.Delete")

	_, err := r.client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(r.tableName),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{
				Value: string(id),
			},
		},
	})

	if err != nil {
		return errors.New(op, errors.Storage, fmt.Errorf("could not delete item: %w", err))
	}

	return nil
}
