package financeaggregator

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

// ListBorrowingsFilter encapsulates filtering parameters for listing borrowings in aggregator.
type ListBorrowingsFilter struct {
	finance.ListBorrowingsFilter
}

// ListBorrowings retrieves paginated borrowing records for a space.
func (s *Service) ListBorrowings(ctx context.Context, spaceID finance.SpaceID, filter ListBorrowingsFilter) ([]*finance.Borrowing, string, error) {
	return s.financeService.ListBorrowings(ctx, spaceID, &filter.ListBorrowingsFilter)
}

// GetBorrowing retrieves a single borrowing record by ID for a space.
func (s *Service) GetBorrowing(ctx context.Context, spaceID finance.SpaceID, id finance.BorrowingID) (*finance.Borrowing, error) {
	return s.financeService.GetBorrowing(ctx, spaceID, id)
}
