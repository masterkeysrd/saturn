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
func (s *Service) ListBorrowings(ctx context.Context, rCtx finance.Context, filter ListBorrowingsFilter) ([]*finance.Borrowing, string, error) {
	return s.financeService.ListBorrowings(ctx, rCtx, &filter.ListBorrowingsFilter)
}

// GetBorrowing retrieves a single borrowing record by ID for a space.
func (s *Service) GetBorrowing(ctx context.Context, rCtx finance.Context, id finance.BorrowingID) (*finance.Borrowing, error) {
	return s.financeService.GetBorrowing(ctx, rCtx, id)
}
