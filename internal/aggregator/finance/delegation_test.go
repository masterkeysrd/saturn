package financeaggregator

import (
	"context"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

func TestDelegations(t *testing.T) {
	ctx := context.Background()
	spaceID := finance.SpaceID("spc_1")

	t.Run("Borrowings", func(t *testing.T) {
		borrowingID := finance.BorrowingID("bor_1")
		borrowing := &finance.Borrowing{ID: borrowingID, SpaceID: spaceID}

		mockFS := &FinanceServiceMock{
			ListBorrowingsFunc: func(ctx context.Context, sid finance.SpaceID, filter *finance.ListBorrowingsFilter) ([]*finance.Borrowing, string, error) {
				return []*finance.Borrowing{borrowing}, "token_bor", nil
			},
			GetBorrowingFunc: func(ctx context.Context, sid finance.SpaceID, id finance.BorrowingID) (*finance.Borrowing, error) {
				return borrowing, nil
			},
		}

		svc := NewService(mockFS)
		list, token, err := svc.ListBorrowings(ctx, spaceID, ListBorrowingsFilter{})
		if err != nil || len(list) != 1 || token != "token_bor" {
			t.Fatalf("ListBorrowings unexpected: %v, %s, %v", list, token, err)
		}

		item, err := svc.GetBorrowing(ctx, spaceID, borrowingID)
		if err != nil || item.ID != borrowingID {
			t.Fatalf("GetBorrowing unexpected: %v, %v", item, err)
		}
	})

	t.Run("ExchangeRates", func(t *testing.T) {
		rate := &finance.ExchangeRate{ID: "rate_1", FromCurrency: "EUR", ToCurrency: "USD", Rate: 1.1}

		mockFS := &FinanceServiceMock{
			ListExchangeRatesFunc: func(ctx context.Context, sid finance.SpaceID, filter *finance.ListExchangeRatesFilter) ([]*finance.ExchangeRate, string, error) {
				return []*finance.ExchangeRate{rate}, "token_rate", nil
			},
			GetExchangeRateByIDFunc: func(ctx context.Context, sid finance.SpaceID, id string) (*finance.ExchangeRate, error) {
				return rate, nil
			},
		}

		svc := NewService(mockFS)
		list, token, err := svc.ListExchangeRates(ctx, spaceID, ListExchangeRatesFilter{})
		if err != nil || len(list) != 1 || token != "token_rate" {
			t.Fatalf("ListExchangeRates unexpected: %v, %s, %v", list, token, err)
		}

		item, err := svc.GetExchangeRate(ctx, spaceID, "rate_1")
		if err != nil || item.ID != "rate_1" {
			t.Fatalf("GetExchangeRate unexpected: %v, %v", item, err)
		}
	})

	t.Run("Inbox", func(t *testing.T) {
		item := &finance.InboxItem{ID: "inbox_1", SpaceID: string(spaceID)}

		mockFS := &FinanceServiceMock{
			ListInboxItemsFunc: func(ctx context.Context, sid finance.SpaceID, filter *finance.ListInboxItemsFilter) (*paging.Page[*finance.InboxItem], error) {
				return &paging.Page[*finance.InboxItem]{Items: []*finance.InboxItem{item}}, nil
			},
		}

		svc := NewService(mockFS)
		page, err := svc.ListInboxItems(ctx, spaceID, finance.ListInboxItemsFilter{})
		if err != nil || len(page.Items) != 1 || page.Items[0].ID != "inbox_1" {
			t.Fatalf("ListInboxItems unexpected: %v, %v", page, err)
		}
	})

	t.Run("Institutions", func(t *testing.T) {
		inst := &finance.Institution{ID: "inst_1", SpaceID: spaceID, Name: "Test Bank"}

		mockFS := &FinanceServiceMock{
			ListInstitutionsFunc: func(ctx context.Context, sid finance.SpaceID, filter *finance.ListInstitutionsFilter) (*paging.Page[*finance.Institution], error) {
				return &paging.Page[*finance.Institution]{Items: []*finance.Institution{inst}}, nil
			},
		}

		svc := NewService(mockFS)
		page, err := svc.ListInstitutions(ctx, spaceID, &finance.ListInstitutionsFilter{})
		if err != nil || len(page.Items) != 1 || page.Items[0].ID != "inst_1" {
			t.Fatalf("ListInstitutions unexpected: %v, %v", page, err)
		}
	})

	t.Run("Statements", func(t *testing.T) {
		stmtID := finance.StatementID("stmt_1")
		stmt := &finance.Statement{ID: stmtID, SpaceID: spaceID}
		line := &finance.StatementLine{ID: "line_1", StatementID: stmtID}

		mockFS := &FinanceServiceMock{
			GetStatementFunc: func(ctx context.Context, sid finance.SpaceID, id finance.StatementID) (*finance.Statement, error) {
				return stmt, nil
			},
			ListStatementsFunc: func(ctx context.Context, sid finance.SpaceID, filter *finance.ListStatementsFilter) (*paging.Page[*finance.Statement], error) {
				return &paging.Page[*finance.Statement]{Items: []*finance.Statement{stmt}}, nil
			},
			ListStatementLinesFunc: func(ctx context.Context, sid finance.SpaceID, statementID finance.StatementID) ([]*finance.StatementLine, error) {
				return []*finance.StatementLine{line}, nil
			},
		}

		svc := NewService(mockFS)
		s, err := svc.GetStatement(ctx, spaceID, stmtID)
		if err != nil || s.ID != stmtID {
			t.Fatalf("GetStatement unexpected: %v, %v", s, err)
		}

		page, err := svc.ListStatements(ctx, spaceID, &finance.ListStatementsFilter{})
		if err != nil || len(page.Items) != 1 {
			t.Fatalf("ListStatements unexpected: %v, %v", page, err)
		}

		lines, err := svc.ListStatementLines(ctx, spaceID, stmtID)
		if err != nil || len(lines) != 1 || lines[0].ID != "line_1" {
			t.Fatalf("ListStatementLines unexpected: %v, %v", lines, err)
		}
	})

	t.Run("GetBudgetPeriod", func(t *testing.T) {
		bgtID := finance.BudgetID("bgt_1")
		periodID := finance.PeriodID("prd_1")
		bgt := &finance.Budget{ID: bgtID, SpaceID: spaceID}
		period := &finance.BudgetPeriod{
			ID:                 periodID,
			BudgetID:           bgtID,
			LimitAmount:        50000,
			ExchangeRateToBase: 1.0,
		}

		mockFS := &FinanceServiceMock{
			GetBudgetFunc: func(ctx context.Context, sid finance.SpaceID, id finance.BudgetID) (*finance.Budget, error) {
				return bgt, nil
			},
			GetOrCreatePeriodsFunc: func(ctx context.Context, budgets []*finance.Budget, date time.Time) (map[finance.BudgetID]*finance.BudgetPeriod, error) {
				return map[finance.BudgetID]*finance.BudgetPeriod{
					bgtID: period,
				}, nil
			},
			AggregateSpentBatchFunc: func(ctx context.Context, periodIDs []finance.PeriodID) ([]finance.PeriodSpent, error) {
				return []finance.PeriodSpent{
					{PeriodID: periodID, SpentAmount: 1200, SpentInBase: 1200},
				}, nil
			},
		}

		svc := NewService(mockFS)
		res, err := svc.GetBudgetPeriod(ctx, spaceID, bgtID, time.Now())
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.ID != periodID {
			t.Errorf("expected %s, got %s", periodID, res.ID)
		}
		if res.SpentAmount != 1200 || res.SpentInBase != 1200 {
			t.Errorf("expected 1200 spent, got amount=%d base=%d", res.SpentAmount, res.SpentInBase)
		}
		if res.LimitInBase != 50000 {
			t.Errorf("expected 50000 limit, got %d", res.LimitInBase)
		}
	})
}
