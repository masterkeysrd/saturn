package financeaggregator

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// ListInstitutions returns a paginated list of institutions in the specified space.
func (s *Service) ListInstitutions(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListInstitutionsFilter) (*paging.Page[*finance.Institution], error) {
	return s.financeService.ListInstitutions(ctx, spaceID, filter)
}
