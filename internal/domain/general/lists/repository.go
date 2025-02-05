package lists

import (
	"context"
	"fmt"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/masterkeysrd/saturn/internal/domain/user"
	"github.com/masterkeysrd/saturn/internal/foundations/errors"
	"github.com/masterkeysrd/saturn/internal/foundations/log"
	"github.com/masterkeysrd/saturn/internal/foundations/storage/dynamodb"
)

// Repository is a repository for lists.
type Repository interface {
	Get(ctx context.Context, name string) (*List, error)
	Save(ctx context.Context, list *List) error
}

type DynamoDBRepository struct {
	// client is the dynamodb client.
	client dynamodb.Client
}

// NewDynamoDBRepository creates a new dynamodb repository.
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

	return env + "-saturn-lists"
}

// Get gets a list by name.
func (r *DynamoDBRepository) Get(ctx context.Context, name string) (*List, error) {
	const op = errors.Op("list/repository.Get")

	key := map[string]types.AttributeValue{
		"name": &types.AttributeValueMemberS{
			Value: name,
		},
	}

	key, err := user.AppendUserIDMember(ctx, key)
	if err != nil {
		return nil, errors.New(op, errors.Internal, fmt.Errorf("could not append user id: %w", err))
	}

	log.InfoCtx(ctx, "get_list", log.Any("key", key))

	item, err := r.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(r.TableName()),
		Key:       key,
	})
	log.InfoCtx(ctx, "get_list", log.Any("item", item), log.Any("err", err))
	if err != nil {
		return nil, errors.New(op, errors.Internal, fmt.Errorf("could not get item: %w", err))
	}

	if item.Item == nil {
		return nil, errors.New(op, errors.NotExist, fmt.Errorf("list not found"))
	}

	var list List
	if err := attributevalue.UnmarshalMap(item.Item, &list); err != nil {
		return nil, errors.New(op, errors.Internal, fmt.Errorf("could not unmarshal item: %w", err))
	}

	return &list, nil
}

// Save creates or updates a list.
func (r *DynamoDBRepository) Save(ctx context.Context, list *List) error {
	const op = errors.Op("list/repository.Save")

	item, err := attributevalue.MarshalMap(list)
	if err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not marshal list: %w", err))
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
		return errors.New(op, errors.Internal, fmt.Errorf("could not put item: %w", err))
	}

	return nil
}
