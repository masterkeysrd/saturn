package financeaggregator

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/segmentio/ksuid"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

type mockRecurringTransactionStore struct {
	expenses map[finance.SpaceID]map[finance.RecurringTransactionID]*finance.RecurringTransaction
}

func (m *mockRecurringTransactionStore) Create(ctx context.Context, fCtx finance.Context, re *finance.RecurringTransaction) error {
	if m.expenses[fCtx.SpaceID()] == nil {
		m.expenses[fCtx.SpaceID()] = make(map[finance.RecurringTransactionID]*finance.RecurringTransaction)
	}
	m.expenses[fCtx.SpaceID()][re.ID] = re
	return nil
}

func (m *mockRecurringTransactionStore) GetByID(ctx context.Context, fCtx finance.Context, id finance.RecurringTransactionID) (*finance.RecurringTransaction, error) {
	spaceExpenses := m.expenses[fCtx.SpaceID()]
	if spaceExpenses == nil {
		return nil, errors.New("recurring transaction not found")
	}
	re, ok := spaceExpenses[id]
	if !ok {
		return nil, errors.New("recurring transaction not found")
	}
	return re, nil
}

func (m *mockRecurringTransactionStore) GetByIDs(ctx context.Context, fCtx finance.Context, ids []finance.RecurringTransactionID) ([]*finance.RecurringTransaction, error) {
	spaceExpenses := m.expenses[fCtx.SpaceID()]
	var list []*finance.RecurringTransaction
	if spaceExpenses != nil {
		for _, id := range ids {
			if re, ok := spaceExpenses[id]; ok {
				list = append(list, re)
			}
		}
	}
	return list, nil
}

func (m *mockRecurringTransactionStore) Update(ctx context.Context, fCtx finance.Context, re *finance.RecurringTransaction) error {
	if m.expenses[fCtx.SpaceID()] == nil {
		m.expenses[fCtx.SpaceID()] = make(map[finance.RecurringTransactionID]*finance.RecurringTransaction)
	}
	m.expenses[fCtx.SpaceID()][re.ID] = re
	return nil
}

func (m *mockRecurringTransactionStore) Delete(ctx context.Context, fCtx finance.Context, id finance.RecurringTransactionID, opts finance.DeleteOptions) error {
	if m.expenses[fCtx.SpaceID()] != nil {
		delete(m.expenses[fCtx.SpaceID()], id)
	}
	return nil
}

func (m *mockRecurringTransactionStore) ListBySpace(ctx context.Context, fCtx finance.Context, filter *finance.ListRecurringTransactionsFilter) (*paging.Page[*finance.RecurringTransaction], error) {
	var list []*finance.RecurringTransaction
	for _, re := range m.expenses[fCtx.SpaceID()] {
		list = append(list, re)
	}
	pageSize := int(filter.PageSize)
	if pageSize <= 0 {
		pageSize = 20
	}
	return paging.NewPage(list, pageSize, func(e *finance.RecurringTransaction) paging.Cursor {
		return paging.Cursor{ID: string(e.ID)}
	}), nil
}

func (m *mockRecurringTransactionStore) ListPendingGeneration(ctx context.Context, maxDueDate time.Time) ([]finance.PendingRecurringTransaction, error) {
	return nil, nil
}

type mockScheduledTransactionStore struct {
	payments map[finance.SpaceID]map[finance.ScheduledTransactionID]*finance.ScheduledTransaction
}

func (m *mockScheduledTransactionStore) Create(ctx context.Context, fCtx finance.Context, sp *finance.ScheduledTransaction) error {
	if m.payments[fCtx.SpaceID()] == nil {
		m.payments[fCtx.SpaceID()] = make(map[finance.ScheduledTransactionID]*finance.ScheduledTransaction)
	}
	m.payments[fCtx.SpaceID()][sp.ID] = sp
	return nil
}

func (m *mockScheduledTransactionStore) GetByID(ctx context.Context, fCtx finance.Context, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error) {
	spacePayments := m.payments[fCtx.SpaceID()]
	if spacePayments == nil {
		return nil, errors.New("scheduled transaction not found")
	}
	sp, ok := spacePayments[id]
	if !ok {
		return nil, errors.New("scheduled transaction not found")
	}
	return sp, nil
}

func (m *mockScheduledTransactionStore) Update(ctx context.Context, fCtx finance.Context, sp *finance.ScheduledTransaction) error {
	if m.payments[fCtx.SpaceID()] != nil {
		if _, ok := m.payments[fCtx.SpaceID()][sp.ID]; ok {
			m.payments[fCtx.SpaceID()][sp.ID] = sp
			return nil
		}
	}
	return errors.New("scheduled transaction not found")
}

func (m *mockScheduledTransactionStore) UpdateStatus(ctx context.Context, fCtx finance.Context, id finance.ScheduledTransactionID, status finance.ScheduledTransactionStatus) error {
	if m.payments[fCtx.SpaceID()] != nil {
		if p, ok := m.payments[fCtx.SpaceID()][id]; ok {
			p.Status = status
			return nil
		}
	}
	return errors.New("scheduled transaction not found")
}

func (m *mockScheduledTransactionStore) Delete(ctx context.Context, fCtx finance.Context, id finance.ScheduledTransactionID) error {
	if m.payments[fCtx.SpaceID()] != nil {
		delete(m.payments[fCtx.SpaceID()], id)
	}
	return nil
}

func (m *mockScheduledTransactionStore) HasScheduledTransactions(ctx context.Context, fCtx finance.Context, filter *finance.ListScheduledTransactionsFilter) (bool, error) {
	for _, sp := range m.payments[fCtx.SpaceID()] {
		if filter != nil && filter.BudgetID != nil && (sp.BudgetID == nil || *sp.BudgetID != *filter.BudgetID) {
			continue
		}
		return true, nil
	}
	return false, nil
}

func (m *mockScheduledTransactionStore) ListBySpace(ctx context.Context, fCtx finance.Context, filter *finance.ListScheduledTransactionsFilter) (*paging.Page[*finance.ScheduledTransaction], error) {
	var list []*finance.ScheduledTransaction
	for _, sp := range m.payments[fCtx.SpaceID()] {
		list = append(list, sp)
	}
	pageSize := int(filter.PageSize)
	if pageSize <= 0 {
		pageSize = 20
	}
	return paging.NewPage(list, pageSize, func(p *finance.ScheduledTransaction) paging.Cursor {
		return paging.Cursor{ID: string(p.ID)}
	}), nil
}

func TestListRecurringTransactionsAndScheduledTransactionsAggregator(t *testing.T) {
	ctx := context.Background()
	spaceID := finance.SpaceID("spc_" + ksuid.New().String())
	rCtx := finance.NewContext(spaceID, "usr_1", time.UTC, "USD")

	// Mocks Setup
	bStore := &mockBudgetStore{budgets: make(map[finance.SpaceID]map[finance.BudgetID]*finance.Budget)}
	reStore := &mockRecurringTransactionStore{expenses: make(map[finance.SpaceID]map[finance.RecurringTransactionID]*finance.RecurringTransaction)}
	spStore := &mockScheduledTransactionStore{payments: make(map[finance.SpaceID]map[finance.ScheduledTransactionID]*finance.ScheduledTransaction)}

	budget := &finance.Budget{
		ID:       finance.BudgetID("bgt_" + ksuid.New().String()),
		Name:     "Test Budget",
		Color:    "red",
		Icon:     "home",
		Currency: finance.Currency("USD"),
	}
	_ = bStore.Create(ctx, rCtx, budget)

	re := &finance.RecurringTransaction{
		ID:          finance.RecurringTransactionID("rec_" + ksuid.New().String()),
		BudgetID:    &budget.ID,
		Name:        "SaaS",
		Amount:      1000,
		Currency:    finance.Currency("USD"),
		Interval:    "monthly",
		NextDueDate: time.Now(),
		Status:      finance.RecurringTransactionActive,
		Type:        finance.TransactionTypeExpense,
	}
	_ = reStore.Create(ctx, rCtx, re)

	sp := &finance.ScheduledTransaction{
		ID:         finance.ScheduledTransactionID("sch_" + ksuid.New().String()),
		BudgetID:   &budget.ID,
		SourceType: "recurrent_transaction",
		SourceID:   string(re.ID),
		Amount:     1000,
		Currency:   finance.Currency("USD"),
		DueDate:    time.Now(),
		Status:     finance.ScheduledTransactionPending,
		Type:       finance.TransactionTypeExpense,
	}
	_ = spStore.Create(ctx, rCtx, sp)

	deps := finance.Dependencies{
		BudgetStore:               bStore,
		RecurringTransactionStore: reStore,
		ScheduledTransactionStore: spStore,
		SettingsStore:             &mockSettingsStore{settings: make(map[finance.SpaceID]*finance.FinanceSettings)},
	}
	fs := finance.NewService(deps)
	agg := NewService(fs)

	t.Run("ListRecurringTransactions Basic view", func(t *testing.T) {
		page, err := agg.ListRecurringTransactions(ctx, rCtx, ViewBasic, finance.ListRecurringTransactionsFilter{})
		if err != nil {
			t.Fatal(err)
		}
		if len(page.Items) != 1 {
			t.Fatalf("expected 1 transaction, got %d", len(page.Items))
		}
		if page.Items[0].Budget != nil {
			t.Fatal("budget should be nil in ViewBasic")
		}
	})

	t.Run("ListRecurringTransactions Full view", func(t *testing.T) {
		page, err := agg.ListRecurringTransactions(ctx, rCtx, ViewFull, finance.ListRecurringTransactionsFilter{})
		if err != nil {
			t.Fatal(err)
		}
		if len(page.Items) != 1 {
			t.Fatalf("expected 1 transaction, got %d", len(page.Items))
		}
		if page.Items[0].Budget == nil {
			t.Fatal("budget should be populated in ViewFull")
		}
		if page.Items[0].Budget.Name != "Test Budget" {
			t.Fatalf("expected budget name 'Test Budget', got '%s'", page.Items[0].Budget.Name)
		}
	})

	t.Run("ListScheduledTransactions Basic view", func(t *testing.T) {
		page, err := agg.ListScheduledTransactions(ctx, rCtx, ViewBasic, finance.ListScheduledTransactionsFilter{})
		if err != nil {
			t.Fatal(err)
		}
		if len(page.Items) != 1 {
			t.Fatalf("expected 1 transaction, got %d", len(page.Items))
		}
		if page.Items[0].Budget != nil || page.Items[0].RecurringTransaction != nil {
			t.Fatal("relations should be nil in ViewBasic")
		}
	})

	t.Run("ListScheduledTransactions Full view", func(t *testing.T) {
		page, err := agg.ListScheduledTransactions(ctx, rCtx, ViewFull, finance.ListScheduledTransactionsFilter{})
		if err != nil {
			t.Fatal(err)
		}
		if len(page.Items) != 1 {
			t.Fatalf("expected 1 transaction, got %d", len(page.Items))
		}
		if page.Items[0].Budget == nil {
			t.Fatal("budget should be populated in ViewFull")
		}
		if page.Items[0].RecurringTransaction == nil {
			t.Fatal("recurring transaction parent should be populated in ViewFull")
		}
		if page.Items[0].RecurringTransaction.Name != "SaaS" {
			t.Fatalf("expected parent name 'SaaS', got '%s'", page.Items[0].RecurringTransaction.Name)
		}
	})
}
