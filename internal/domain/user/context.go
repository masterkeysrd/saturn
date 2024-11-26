package user

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/masterkeysrd/saturn/internal/foundations/uuid"
)

type userContextKeyT struct{}

var userContextKey = userContextKeyT{}

// WithUserID adds the user ID to the context.
func WithUserID(ctx context.Context, id ID) context.Context {
	return context.WithValue(ctx, userContextKey, id)
}

// UserIDFromContext extracts the user ID from the context.
func UserIDFromContext(ctx context.Context) ID {
	userID, _ := ctx.Value(userContextKey).(ID)
	return userID
}

// AppendUserIDMember appends the user ID to the attribute value map.
func AppendUserIDMember(ctx context.Context, m map[string]types.AttributeValue) (map[string]types.AttributeValue, error) {
	id := UserIDFromContext(ctx)
	if err := uuid.Validate(string(id)); err != nil {
		return nil, fmt.Errorf("could not validate user ID: %w", err)
	}

	m["user_id"] = &types.AttributeValueMemberS{Value: string(id)}
	return m, nil
}
