package financeaggregator

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// GetStatement retrieves a single statement for a workspace.
func (s *Service) GetStatement(ctx context.Context, spaceID finance.SpaceID, id finance.StatementID) (*finance.Statement, error) {
	return s.financeService.GetStatement(ctx, spaceID, id)
}

// ListStatements lists statements in a workspace with filters.
func (s *Service) ListStatements(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListStatementsFilter) (*paging.Page[*finance.Statement], error) {
	return s.financeService.ListStatements(ctx, spaceID, filter)
}

// ListStatementLines lists all statement lines for a statement and resolves suggestions dynamically.
func (s *Service) ListStatementLines(ctx context.Context, spaceID finance.SpaceID, statementID finance.StatementID) ([]*finance.StatementLine, error) {
	return s.financeService.ListStatementLines(ctx, spaceID, statementID)
}
