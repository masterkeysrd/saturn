package financeaggregator

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/segmentio/ksuid"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/sorting"
)

// --- In-Memory Mocks for Stores ---

type mockSettingsStore struct {
	settings map[finance.SpaceID]*finance.FinanceSettings
}

func (m *mockSettingsStore) Create(ctx context.Context, s *finance.FinanceSettings) error {
	m.settings[s.SpaceID] = s
	return nil
}
func (m *mockSettingsStore) GetByID(ctx context.Context, spaceID finance.SpaceID) (*finance.FinanceSettings, error) {
	s, ok := m.settings[spaceID]
	if !ok {
		return nil, finance.ErrSettingsNotFound
	}
	return s, nil
}

type mockBudgetStore struct {
	budgets map[finance.BudgetID]*finance.Budget
}

func (m *mockBudgetStore) Create(ctx context.Context, b *finance.Budget) error {
	m.budgets[b.ID] = b
	return nil
}
func (m *mockBudgetStore) GetByID(ctx context.Context, spaceID finance.SpaceID, id finance.BudgetID) (*finance.Budget, error) {
	b, ok := m.budgets[id]
	if !ok {
		return nil, finance.ErrBudgetNotFound
	}
	return b, nil
}
func (m *mockBudgetStore) GetByIDs(ctx context.Context, spaceID finance.SpaceID, ids []finance.BudgetID) ([]*finance.Budget, error) {
	var list []*finance.Budget
	for _, id := range ids {
		if b, ok := m.budgets[id]; ok {
			list = append(list, b)
		}
	}
	return list, nil
}
func (m *mockBudgetStore) Update(ctx context.Context, b *finance.Budget) error {
	m.budgets[b.ID] = b
	return nil
}
func (m *mockBudgetStore) Delete(ctx context.Context, spaceID finance.SpaceID, id finance.BudgetID, opts finance.DeleteOptions) error {
	delete(m.budgets, id)
	return nil
}
func (m *mockBudgetStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBudgetsFilter) (*paging.Page[*finance.Budget], error) {
	var list []*finance.Budget
	for _, b := range m.budgets {
		if b.SpaceID != spaceID {
			continue
		}
		if len(filter.Statuses) > 0 {
			matched := false
			for _, st := range filter.Statuses {
				if b.Status == st {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
		}
		if filter.SearchQuery != nil && *filter.SearchQuery != "" {
			q := strings.ToLower(*filter.SearchQuery)
			if !strings.Contains(strings.ToLower(b.Name), q) {
				continue
			}
		}
		list = append(list, b)
	}

	// Apply Sorting
	slices.SortFunc(list, func(a, b *finance.Budget) int {
		var valA, valB string
		if filter.Sort.Field == "limit_amount" {
			valA = fmt.Sprintf("%018d", a.LimitAmount)
			valB = fmt.Sprintf("%018d", b.LimitAmount)
		} else {
			valA = a.Name
			valB = b.Name
		}

		if valA != valB {
			if filter.Sort.Ascending {
				if valA < valB {
					return -1
				}
				return 1
			} else {
				if valA > valB {
					return -1
				}
				return 1
			}
		}

		// Tie-breaker: ID
		idA := string(a.ID)
		idB := string(b.ID)
		if idA != idB {
			if filter.Sort.Ascending {
				if idA < idB {
					return -1
				}
				return 1
			} else {
				if idA > idB {
					return -1
				}
				return 1
			}
		}
		return 0
	})

	// Apply pagination
	startIndex := 0
	cursor, _ := paging.Decode(filter.NextPageToken)
	if cursor != nil {
		for idx, item := range list {
			if item.GetSortValue(filter.Sort.Field) == cursor.SortValue && string(item.ID) == cursor.ID {
				startIndex = idx + 1
				break
			}
		}
	}

	if startIndex < len(list) {
		list = list[startIndex:]
	} else {
		list = nil
	}

	page := paging.NewPage(list, int(filter.PageSize), func(b *finance.Budget) paging.Cursor {
		return paging.Cursor{
			SortValue: b.GetSortValue(filter.Sort.Field),
			ID:        string(b.ID),
		}
	})

	return page, nil
}

type mockPeriodStore struct {
	periods map[string]*finance.BudgetPeriod
}

func (m *mockPeriodStore) Create(ctx context.Context, p *finance.BudgetPeriod) error {
	key := string(p.BudgetID) + "_" + p.StartDate.Format(time.RFC3339) + "_" + p.EndDate.Format(time.RFC3339)
	m.periods[key] = p
	return nil
}
func (m *mockPeriodStore) GetByRange(ctx context.Context, budgetID finance.BudgetID, startDate, endDate time.Time) (*finance.BudgetPeriod, error) {
	key := string(budgetID) + "_" + startDate.Format(time.RFC3339) + "_" + endDate.Format(time.RFC3339)
	p, ok := m.periods[key]
	if !ok {
		return nil, finance.ErrPeriodNotFound
	}
	return p, nil
}
func (m *mockPeriodStore) GetByRanges(ctx context.Context, keys []finance.PeriodRangeKey) ([]*finance.BudgetPeriod, error) {
	var list []*finance.BudgetPeriod
	for _, key := range keys {
		k := string(key.BudgetID) + "_" + key.StartDate.Format(time.RFC3339) + "_" + key.EndDate.Format(time.RFC3339)
		if p, ok := m.periods[k]; ok {
			list = append(list, p)
		}
	}
	return list, nil
}
func (m *mockPeriodStore) UpdateLimit(ctx context.Context, periodID finance.PeriodID, limitAmount int64) error {
	return nil
}
func (m *mockPeriodStore) ListByBudget(ctx context.Context, budgetID finance.BudgetID) ([]*finance.BudgetPeriod, error) {
	return nil, nil
}

type mockTransactionStore struct{}

func (m *mockTransactionStore) Create(ctx context.Context, t *finance.Transaction) error { return nil }
func (m *mockTransactionStore) GetByID(ctx context.Context, spaceID finance.SpaceID, id finance.TransactionID) (*finance.Transaction, error) {
	return nil, nil
}
func (m *mockTransactionStore) Update(ctx context.Context, t *finance.Transaction) error { return nil }
func (m *mockTransactionStore) Delete(ctx context.Context, id finance.TransactionID) error {
	return nil
}
func (m *mockTransactionStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error) {
	return nil, nil
}
func (m *mockTransactionStore) HasTransactions(ctx context.Context, spaceID finance.SpaceID, filter *finance.TransactionFilter) (bool, error) {
	return false, nil
}
func (m *mockTransactionStore) AggregateSpent(ctx context.Context, periodID finance.PeriodID, budgetCurrency finance.Currency, exchangeRateToBase float64) (int64, int64, error) {
	return 1500, 1500, nil // Mock $15.00 spent
}
func (m *mockTransactionStore) AggregateSpentBatch(ctx context.Context, periodIDs []finance.PeriodID) ([]finance.PeriodSpent, error) {
	res := make([]finance.PeriodSpent, len(periodIDs))
	for i, id := range periodIDs {
		res[i] = finance.PeriodSpent{
			PeriodID:    id,
			SpentInBase: 1500,
			SpentAmount: 1500,
		}
	}
	return res, nil
}

func TestListAggregatedBudgets(t *testing.T) {
	ctx := context.Background()
	spaceID := finance.SpaceID("spc_" + ksuid.New().String())

	// Setup domain service with mocks
	settings := &finance.FinanceSettings{
		SpaceID:      spaceID,
		BaseCurrency: finance.Currency("USD"),
	}

	ss := &mockSettingsStore{settings: map[finance.SpaceID]*finance.FinanceSettings{spaceID: settings}}
	bs := &mockBudgetStore{budgets: make(map[finance.BudgetID]*finance.Budget)}
	ps := &mockPeriodStore{periods: make(map[string]*finance.BudgetPeriod)}
	ts := &mockTransactionStore{}

	domainService := finance.NewService(finance.Dependencies{
		SettingsStore:    ss,
		BudgetStore:      bs,
		PeriodStore:      ps,
		TransactionStore: ts,
	})

	aggService := NewService(domainService)

	// Create test budgets
	b1ID := finance.BudgetID("bgt_" + ksuid.New().String())
	b2ID := finance.BudgetID("bgt_" + ksuid.New().String())
	b3ID := finance.BudgetID("bgt_" + ksuid.New().String())

	b1 := &finance.Budget{
		ID:          b1ID,
		SpaceID:     spaceID,
		Name:        "Food",
		LimitAmount: 5000,
		Currency:    finance.Currency("USD"),
		Interval:    finance.IntervalMonthly,
		Status:      finance.BudgetStatusActive,
	}
	b2 := &finance.Budget{
		ID:          b2ID,
		SpaceID:     spaceID,
		Name:        "Travel",
		LimitAmount: 10000,
		Currency:    finance.Currency("USD"),
		Interval:    finance.IntervalMonthly,
		Status:      finance.BudgetStatusActive,
	}
	b3 := &finance.Budget{
		ID:          b3ID,
		SpaceID:     spaceID,
		Name:        "Books",
		LimitAmount: 2000,
		Currency:    finance.Currency("USD"),
		Interval:    finance.IntervalMonthly,
		Status:      finance.BudgetStatusPaused, // Inactive
	}

	_ = bs.Create(ctx, b1)
	_ = bs.Create(ctx, b2)
	_ = bs.Create(ctx, b3)

	// Pre-create periods in mock database so GetOrCreatePeriod retrieves them and updates spent metrics
	startDate, endDate := b1.CalculateBounds(time.Now())
	p1 := &finance.BudgetPeriod{
		ID:                 finance.PeriodID("prd_" + ksuid.New().String()),
		BudgetID:           b1ID,
		SpaceID:            spaceID,
		StartDate:          startDate,
		EndDate:            endDate,
		LimitAmount:        5000,
		Currency:           finance.Currency("USD"),
		BaseCurrency:       finance.Currency("USD"),
		ExchangeRateToBase: 1.0,
	}
	p2 := &finance.BudgetPeriod{
		ID:                 finance.PeriodID("prd_" + ksuid.New().String()),
		BudgetID:           b2ID,
		SpaceID:            spaceID,
		StartDate:          startDate,
		EndDate:            endDate,
		LimitAmount:        10000,
		Currency:           finance.Currency("USD"),
		BaseCurrency:       finance.Currency("USD"),
		ExchangeRateToBase: 1.0,
	}
	_ = ps.Create(ctx, p1)
	_ = ps.Create(ctx, p2)

	t.Run("Basic View - Active Only", func(t *testing.T) {
		filter := ListBudgetsFilter{
			ListBudgetsFilter: finance.ListBudgetsFilter{
				Statuses: []finance.BudgetStatus{finance.BudgetStatusActive},
				Sort:     sorting.New("name", true), // A-Z
				PageSize: 10,
			},
			View: ViewBasic,
		}

		page, err := aggService.ListBudgets(ctx, spaceID, filter)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(page.Items) != 2 {
			t.Fatalf("expected 2 active budgets, got %d", len(page.Items))
		}
		if page.Items[0].Name != "Food" || page.Items[1].Name != "Travel" {
			t.Errorf("unexpected sorting or items: %v", page.Items)
		}
		if page.Items[0].Period != nil {
			t.Error("expected period to be nil in basic view")
		}
	})

	t.Run("Full View - Hydrates Period Spent", func(t *testing.T) {
		filter := ListBudgetsFilter{
			ListBudgetsFilter: finance.ListBudgetsFilter{
				Statuses: []finance.BudgetStatus{finance.BudgetStatusActive},
				Sort:     sorting.New("limit_amount", false), // Limit desc (Travel first, then Food)
				PageSize: 10,
			},
			View: ViewFull,
		}

		page, err := aggService.ListBudgets(ctx, spaceID, filter)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(page.Items) != 2 {
			t.Fatalf("expected 2 items, got %d", len(page.Items))
		}
		if page.Items[0].Name != "Travel" || page.Items[1].Name != "Food" {
			t.Errorf("unexpected sorting: %v", page.Items)
		}

		// Verify period was hydrated
		travelBudget := page.Items[0]
		if travelBudget.Period == nil {
			t.Fatal("expected period progress to be hydrated")
		}
		if travelBudget.Period.SpentAmount != 1500 {
			t.Errorf("expected spent amount 1500, got %d", travelBudget.Period.SpentAmount)
		}
	})

	t.Run("Paging - Keeps Order", func(t *testing.T) {
		filter := ListBudgetsFilter{
			ListBudgetsFilter: finance.ListBudgetsFilter{
				Statuses: []finance.BudgetStatus{finance.BudgetStatusActive},
				Sort:     sorting.New("name", true), // Food, Travel
				PageSize: 1,
			},
			View: ViewBasic,
		}

		page1, err := aggService.ListBudgets(ctx, spaceID, filter)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(page1.Items) != 1 {
			t.Fatalf("expected 1 item, got %d", len(page1.Items))
		}
		if page1.Items[0].Name != "Food" {
			t.Errorf("expected Food, got %s", page1.Items[0].Name)
		}
		if !page1.HasMore {
			t.Error("expected has more to be true")
		}

		// Fetch second page
		filter.NextPageToken = page1.NextPageToken
		page2, err := aggService.ListBudgets(ctx, spaceID, filter)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(page2.Items) != 1 {
			t.Fatalf("expected 1 item, got %d", len(page2.Items))
		}
		if page2.Items[0].Name != "Travel" {
			t.Errorf("expected Travel, got %s", page2.Items[0].Name)
		}
		if page2.HasMore {
			t.Error("expected has more to be false on last page")
		}
	})
}
