package budget

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
	List(ctx context.Context) ([]*Budget, error)
	Get(ctx context.Context, id ID) (*Budget, error)
	Create(ctx context.Context, budget *Budget) error
	Update(ctx context.Context, budget *Budget) error
	Delete(ctx context.Context, id ID) error
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

	return env + "-saturn-budgets"
}

func (r *DynamoDBRepository) Get(ctx context.Context, id ID) (*Budget, error) {
	const op = errors.Op("budget/repository.Get")

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
		return nil, errors.New(op, errors.Storage, fmt.Errorf("could not get item: %w", err))
	}

	if item.Item == nil {
		return nil, errors.New(op, errors.NotExist, fmt.Errorf("could not find item"))
	}

	var exp Budget
	if err := attributevalue.UnmarshalMap(item.Item, &exp); err != nil {
		return nil, errors.New(op, errors.Internal, fmt.Errorf("could not unmarshal budget: %w", err))
	}

	return &exp, nil
}

func (r *DynamoDBRepository) List(ctx context.Context) ([]*Budget, error) {
	const op = errors.Op("budget/repository.List")

	id := user.UserIDFromContext(ctx)
	if err := uuid.Validate(id); err != nil {
		return nil, errors.New(op, errors.Internal, fmt.Errorf("could not validate user id: %w", err))
	}

	res, err := r.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(r.TableName()),
		KeyConditionExpression: aws.String("user_id = :user_id"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":user_id": &types.AttributeValueMemberS{
				Value: string(id),
			},
		},
	})
	if err != nil {
		return nil, errors.New(op, errors.Storage, fmt.Errorf("could not scan table: %w", err))
	}

	budgets := make([]*Budget, len(res.Items))
	for i, item := range res.Items {
		exp := new(Budget)
		if err := attributevalue.UnmarshalMap(item, exp); err != nil {
			return nil, errors.New(op, errors.Internal, fmt.Errorf("could not unmarshal budget: %w", err))
		}

		budgets[i] = exp
	}

	return budgets, nil
}

func (r *DynamoDBRepository) Create(ctx context.Context, budget *Budget) error {
	const op = errors.Op("budget/repository.Create")

	item, err := attributevalue.MarshalMap(budget)
	if err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not marshal budget: %w", err))
	}

	item, err = user.AppendUserIDMember(ctx, item)
	if err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not append user id: %w", err))
	}

	_, err = r.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(r.TableName()),
		Item:      item,
	})

	if err != nil {
		return errors.New(op, errors.Storage, fmt.Errorf("could not put item: %w on table %s", err, r.TableName()))
	}

	return nil
}

func (r *DynamoDBRepository) Update(ctx context.Context, budget *Budget) error {
	const op = errors.Op("budget/repository.Update")

	item, err := attributevalue.MarshalMap(budget)
	if err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not marshal budget: %w", err))
	}

	item, err = user.AppendUserIDMember(ctx, item)
	if err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not append user id: %w", err))
	}

	_, err = r.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(r.TableName()),
		Item:      item,
	})

	if err != nil {
		return errors.New(op, errors.Storage, fmt.Errorf("could not put item: %w", err))
	}

	return nil
}

func (r *DynamoDBRepository) Delete(ctx context.Context, id ID) error {
	const op = errors.Op("budget/repository.Delete")

	key := map[string]types.AttributeValue{
		"id": &types.AttributeValueMemberS{
			Value: string(id),
		},
	}

	key, err := user.AppendUserIDMember(ctx, key)
	if err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not append user id: %w", err))
	}

	_, err = r.client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(r.TableName()),
		Key:       key,
	})

	if err != nil {
		return errors.New(op, errors.Storage, fmt.Errorf("could not delete item: %w", err))
	}

	return nil
}
