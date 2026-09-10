package iam

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// ListUsersFilter encapsulates the filtering and pagination parameters for listing users.
type ListUsersFilter struct {
	PageSize      int32
	NextPageToken string
	StatusFilter  identity.UserStatus
	SearchQuery   string
}

// ListUsers returns users with optional filtering by status and search query, delegating validation to the service layer.
func (c *coordinator) ListUsers(ctx context.Context, filter *ListUsersFilter) (*paging.Page[*identity.User], error) {
	return c.identityService.ListUsers(ctx, &identity.ListUsersFilter{
		PageSize:      filter.PageSize,
		NextPageToken: filter.NextPageToken,
		StatusFilter:  filter.StatusFilter,
		SearchQuery:   filter.SearchQuery,
	})
}
