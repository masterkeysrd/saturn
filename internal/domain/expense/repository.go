package expense

import (
	"context"
	"fmt"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/masterkeysrd/saturn/internal/domain/user"
	"github.com/masterkeysrd/saturn/internal/foundations/errors"
	"github.com/masterkeysrd/saturn/internal/foundations/storage/dynamodb"
	"github.com/masterkeysrd/saturn/internal/foundations/uuid"
)

type Repository interface {
	List(context.Context) ([]*Expense, error)
	Get(context.Context, ID) (*Expense, error)
	Create(context.Context, *Expense) error
	Update(context.Context, *Expense) error
	Delete(context.Context, ID) error
}

type DynamoDBRepository struct {
	client dynamodb.Client
}

func NewDynamoDBRepository(client *dynamodb.DynamoDB) *DynamoDBRepository {
	return &DynamoDBRepository{
		client: client,
	}
}

func (r *DynamoDBRepository) TableName() string {
	env := os.Getenv("ENVIRONMENT")
	if env == "" {
		env = "local"
	}

	return env + "-saturn-expenses"
}

func (r *DynamoDBRepository) Get(ctx context.Context, id ID) (*Expense, error) {
	const op = errors.Op("expense/repository.Get")

	key := map[string]types.AttributeValue{
		"id": &types.AttributeValueMemberS{
			Value: string(id),
		},
	}

	key, err := user.AppendUserIDMember(ctx, key)
	if err != nil {
		return nil, errors.New(op, errors.Internal, fmt.Errorf("could not append user id: %w", err))
	}

	item, err := r.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(r.TableName()),
		Key:       key,
	})
	if err != nil {
		return nil, errors.New(op, errors.Internal, fmt.Errorf("could not get item: %w", err))
	}

	if item.Item == nil {
		return nil, errors.New(op, errors.NotExist, fmt.Errorf("item not found"))
	}

	var expense Expense
	if err := attributevalue.UnmarshalMap(item.Item, &expense); err != nil {
		return nil, errors.New(op, errors.Internal, fmt.Errorf("could not unmarshal item: %w", err))
	}

	return &expense, nil
}

func (r *DynamoDBRepository) List(ctx context.Context) ([]*Expense, error) {
	const op = errors.Op("expense/repository.List")

	userID := user.UserIDFromContext(ctx)
	if err := uuid.Validate(userID); err != nil {
		return nil, errors.New(op, errors.Internal, fmt.Errorf("could not validate user id: %w", err))
	}

	resp, err := r.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(r.TableName()),
		KeyConditionExpression: aws.String("user_id = :user_id"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":user_id": &types.AttributeValueMemberS{
				Value: string(userID),
			},
		},
	})

	if err != nil {
		return nil, errors.New(op, errors.Internal, fmt.Errorf("could not query items: %w", err))
	}

	expenses := make([]*Expense, 0, len(resp.Items))
	if err := attributevalue.UnmarshalListOfMaps(resp.Items, &expenses); err != nil {
		return nil, errors.New(op, errors.Internal, fmt.Errorf("could not unmarshal items: %w", err))
	}

	return expenses, nil
}

func (r *DynamoDBRepository) Create(ctx context.Context, expense *Expense) error {
	const op = errors.Op("expense/repository.Create")

	item, err := attributevalue.MarshalMap(expense)
	if err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not marshal item: %w", err))
	}

	item, err = user.AppendUserIDMember(ctx, item)
	if err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not append user id: %w", err))
	}

	if _, err := r.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(r.TableName()),
		Item:      item,
	}); err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not put item: %w", err))
	}

	return nil
}

func (r *DynamoDBRepository) Update(ctx context.Context, expense *Expense) error {
	const op = errors.Op("expense/repository.Update")

	item, err := attributevalue.MarshalMap(expense)
	if err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not marshal item: %w", err))
	}

	item, err = user.AppendUserIDMember(ctx, item)
	if err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not append user id: %w", err))
	}

	if _, err := r.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(r.TableName()),
		Item:      item,
	}); err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not put item: %w", err))
	}

	return nil
}

func (r *DynamoDBRepository) Delete(ctx context.Context, id ID) error {
	const op = errors.Op("expense/repository.Delete")

	key := map[string]types.AttributeValue{
		"id": &types.AttributeValueMemberS{
			Value: string(id),
		},
	}

	key, err := user.AppendUserIDMember(ctx, key)
	if err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not append user id: %w", err))
	}

	if _, err := r.client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(r.TableName()),
		Key:       key,
	}); err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not delete item: %w", err))
	}

	return nil
}
