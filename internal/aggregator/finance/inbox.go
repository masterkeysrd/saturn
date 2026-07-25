package financeaggregator

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// ListInboxItems retrieves staging inbox items for a space.
func (s *Service) ListInboxItems(ctx context.Context, spaceID finance.SpaceID, filter finance.ListInboxItemsFilter) (*paging.Page[*finance.InboxItem], error) {
	return s.financeService.ListInboxItems(ctx, string(spaceID), &filter)
}
