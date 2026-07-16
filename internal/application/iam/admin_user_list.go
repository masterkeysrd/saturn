package iam

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

// ListUsersFilter encapsulates the filtering and pagination parameters for listing users.
type ListUsersFilter struct {
	PageSize      int32
	NextPageToken string
	StatusFilter  identity.UserStatus
	SearchQuery   string
}

// ListUsersResponse represents the output for listing users.
type ListUsersResponse struct {
	Users         []*identity.User
	NextPageToken string
}

// ListUsers returns users with optional filtering by status and search query, delegating validation to the service layer.
func (c *Coordinator) ListUsers(ctx context.Context, filter *ListUsersFilter) (*ListUsersResponse, error) {
	users, nextToken, err := c.identityService.ListUsers(ctx, &identity.ListUsersFilter{
		PageSize:      filter.PageSize,
		NextPageToken: filter.NextPageToken,
		StatusFilter:  filter.StatusFilter,
		SearchQuery:   filter.SearchQuery,
	})
	if err != nil {
		return nil, err
	}

	return &ListUsersResponse{
		Users:         users,
		NextPageToken: nextToken,
	}, nil
}
