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
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	"github.com/masterkeysrd/saturn/internal/platform/sorting"
)

// --- In-Memory Mocks for Stores ---

type mockSettingsStore struct {
	settings map[finance.SpaceID]*finance.Settings
}

func (m *mockSettingsStore) Get(ctx context.Context, scopeID string) (*settings.Entry[finance.Settings], error) {
	s, ok := m.settings[finance.SpaceID(scopeID)]
	if !ok {
		return nil, errors.E(errors.NotExist, finance.SettingsNotFound, "finance settings not found")
	}
	return &settings.Entry[finance.Settings]{
		Target:  finance.SettingsKey.For(scopeID),
		Value:   *s,
		Version: 1,
	}, nil
}

func (m *mockSettingsStore) Save(ctx context.Context, entry *settings.Entry[finance.Settings]) error {
	val := entry.Value
	m.settings[finance.SpaceID(entry.Target.ScopeID())] = &val
	return nil
}

type mockBudgetStore struct {
	budgets map[finance.SpaceID]map[finance.BudgetID]*finance.Budget
}

func (m *mockBudgetStore) Create(ctx context.Context, fCtx finance.Context, b *finance.Budget) error {
	if m.budgets[fCtx.SpaceID()] == nil {
		m.budgets[fCtx.SpaceID()] = make(map[finance.BudgetID]*finance.Budget)
	}
	m.budgets[fCtx.SpaceID()][b.ID] = b
	return nil
}
func (m *mockBudgetStore) GetByID(ctx context.Context, fCtx finance.Context, id finance.BudgetID) (*finance.Budget, error) {
	spaceBudgets := m.budgets[fCtx.SpaceID()]
	if spaceBudgets == nil {
		return nil, errors.E(errors.NotExist, finance.BudgetNotFound, "budget not found")
	}
	b, ok := spaceBudgets[id]
	if !ok {
		return nil, errors.E(errors.NotExist, finance.BudgetNotFound, "budget not found")
	}
	return b, nil
}
func (m *mockBudgetStore) GetByIDs(ctx context.Context, fCtx finance.Context, ids []finance.BudgetID) ([]*finance.Budget, error) {
	spaceBudgets := m.budgets[fCtx.SpaceID()]
	var list []*finance.Budget
	if spaceBudgets != nil {
		for _, id := range ids {
			if b, ok := spaceBudgets[id]; ok {
				list = append(list, b)
			}
		}
	}
	return list, nil
}
func (m *mockBudgetStore) Update(ctx context.Context, fCtx finance.Context, b *finance.Budget) error {
	if m.budgets[fCtx.SpaceID()] == nil {
		m.budgets[fCtx.SpaceID()] = make(map[finance.BudgetID]*finance.Budget)
	}
	m.budgets[fCtx.SpaceID()][b.ID] = b
	return nil
}
func (m *mockBudgetStore) Delete(ctx context.Context, fCtx finance.Context, id finance.BudgetID, opts finance.DeleteOptions) error {
	if m.budgets[fCtx.SpaceID()] != nil {
		delete(m.budgets[fCtx.SpaceID()], id)
	}
	return nil
}
func (m *mockBudgetStore) ListBySpace(ctx context.Context, fCtx finance.Context, filter *finance.ListBudgetsFilter) (*paging.Page[*finance.Budget], error) {
	var list []*finance.Budget
	for _, b := range m.budgets[fCtx.SpaceID()] {
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

func (m *mockPeriodStore) Create(ctx context.Context, fCtx finance.Context, p *finance.BudgetPeriod) error {
	key := string(fCtx.SpaceID()) + "_" + string(p.BudgetID) + "_" + p.StartDate.Format(time.RFC3339) + "_" + p.EndDate.Format(time.RFC3339)
	m.periods[key] = p
	return nil
}
func (m *mockPeriodStore) GetByRange(ctx context.Context, fCtx finance.Context, key finance.PeriodRangeKey) (*finance.BudgetPeriod, error) {
	k := string(fCtx.SpaceID()) + "_" + string(key.BudgetID) + "_" + key.StartDate.Format(time.RFC3339) + "_" + key.EndDate.Format(time.RFC3339)
	p, ok := m.periods[k]
	if !ok {
		return nil, errors.E(errors.NotExist, finance.PeriodNotFound, "budget period not found")
	}
	return p, nil
}
func (m *mockPeriodStore) GetByRanges(ctx context.Context, fCtx finance.Context, keys []finance.PeriodRangeKey) ([]*finance.BudgetPeriod, error) {
	var list []*finance.BudgetPeriod
	for _, key := range keys {
		k := string(fCtx.SpaceID()) + "_" + string(key.BudgetID) + "_" + key.StartDate.Format(time.RFC3339) + "_" + key.EndDate.Format(time.RFC3339)
		if p, ok := m.periods[k]; ok {
			list = append(list, p)
		}
	}
	return list, nil
}
func (m *mockPeriodStore) UpdateLimit(ctx context.Context, fCtx finance.Context, periodID finance.PeriodID, limitAmount int64) error {
	return nil
}
func (m *mockPeriodStore) ListByBudget(ctx context.Context, fCtx finance.Context, budgetID finance.BudgetID) ([]*finance.BudgetPeriod, error) {
	return nil, nil
}

type mockTransactionStore struct{}

func (m *mockTransactionStore) Create(ctx context.Context, fCtx finance.Context, t *finance.Transaction) error {
	return nil
}
func (m *mockTransactionStore) GetByID(ctx context.Context, fCtx finance.Context, id finance.TransactionID) (*finance.Transaction, error) {
	return nil, nil
}
func (m *mockTransactionStore) Update(ctx context.Context, fCtx finance.Context, t *finance.Transaction) error {
	return nil
}
func (m *mockTransactionStore) Delete(ctx context.Context, fCtx finance.Context, id finance.TransactionID) error {
	return nil
}
func (m *mockTransactionStore) ListBySpace(ctx context.Context, fCtx finance.Context, filter *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error) {
	return nil, nil
}
func (m *mockTransactionStore) HasTransactions(ctx context.Context, fCtx finance.Context, filter *finance.TransactionFilter) (bool, error) {
	return false, nil
}
func (m *mockTransactionStore) AggregateSpent(ctx context.Context, fCtx finance.Context, periodID finance.PeriodID, budgetCurrency finance.Currency, exchangeRateToBase float64) (int64, int64, error) {
	return 1500, 1500, nil // Mock $15.00 spent
}
func (m *mockTransactionStore) AggregateSpentBatch(ctx context.Context, fCtx finance.Context, periodIDs []finance.PeriodID) ([]finance.PeriodSpent, error) {
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
	rCtx := finance.NewContext(spaceID, "usr_test", time.UTC, "USD")

	// Setup domain service with mocks
	settings := &finance.Settings{
		BaseCurrency: finance.Currency("USD"),
	}

	ss := &mockSettingsStore{settings: map[finance.SpaceID]*finance.Settings{spaceID: settings}}
	bs := &mockBudgetStore{budgets: make(map[finance.SpaceID]map[finance.BudgetID]*finance.Budget)}
	ps := &mockPeriodStore{periods: make(map[string]*finance.BudgetPeriod)}
	ts := &mockTransactionStore{}

	domainService := finance.NewService(finance.Dependencies{
		Settings:         ss,
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
		Name:        "Food",
		LimitAmount: 5000,
		Currency:    finance.Currency("USD"),
		Interval:    finance.IntervalMonthly,
		Status:      finance.BudgetStatusActive,
	}
	b2 := &finance.Budget{
		ID:          b2ID,
		Name:        "Travel",
		LimitAmount: 10000,
		Currency:    finance.Currency("USD"),
		Interval:    finance.IntervalMonthly,
		Status:      finance.BudgetStatusActive,
	}
	b3 := &finance.Budget{
		ID:          b3ID,
		Name:        "Books",
		LimitAmount: 2000,
		Currency:    finance.Currency("USD"),
		Interval:    finance.IntervalMonthly,
		Status:      finance.BudgetStatusPaused, // Inactive
	}

	_ = bs.Create(ctx, rCtx, b1)
	_ = bs.Create(ctx, rCtx, b2)
	_ = bs.Create(ctx, rCtx, b3)

	// Pre-create periods in mock database so GetOrCreatePeriod retrieves them and updates spent metrics
	startDate, endDate := b1.CalculateBounds(time.Now())
	p1 := &finance.BudgetPeriod{
		ID:                 finance.PeriodID("prd_" + ksuid.New().String()),
		BudgetID:           b1ID,
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
		StartDate:          startDate,
		EndDate:            endDate,
		LimitAmount:        10000,
		Currency:           finance.Currency("USD"),
		BaseCurrency:       finance.Currency("USD"),
		ExchangeRateToBase: 1.0,
	}
	_ = ps.Create(ctx, rCtx, p1)
	_ = ps.Create(ctx, rCtx, p2)

	t.Run("Basic View - Active Only", func(t *testing.T) {
		filter := ListBudgetsFilter{
			ListBudgetsFilter: finance.ListBudgetsFilter{
				Statuses: []finance.BudgetStatus{finance.BudgetStatusActive},
				Sort:     sorting.New("name", true), // A-Z
				PageSize: 10,
			},
			View: ViewBasic,
		}

		page, err := aggService.ListBudgets(ctx, rCtx, filter)
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

		page, err := aggService.ListBudgets(ctx, rCtx, filter)
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

		page1, err := aggService.ListBudgets(ctx, rCtx, filter)
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
		page2, err := aggService.ListBudgets(ctx, rCtx, filter)
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
