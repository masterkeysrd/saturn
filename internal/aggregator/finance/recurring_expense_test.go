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

type mockRecurringExpenseStore struct {
	expenses map[finance.RecurringExpenseID]*finance.RecurringExpense
}

func (m *mockRecurringExpenseStore) Create(ctx context.Context, re *finance.RecurringExpense) error {
	m.expenses[re.ID] = re
	return nil
}

func (m *mockRecurringExpenseStore) GetByID(ctx context.Context, spaceID finance.SpaceID, id finance.RecurringExpenseID) (*finance.RecurringExpense, error) {
	re, ok := m.expenses[id]
	if !ok {
		return nil, errors.New("recurring expense not found")
	}
	return re, nil
}

func (m *mockRecurringExpenseStore) GetByIDs(ctx context.Context, spaceID finance.SpaceID, ids []finance.RecurringExpenseID) ([]*finance.RecurringExpense, error) {
	var list []*finance.RecurringExpense
	for _, id := range ids {
		if re, ok := m.expenses[id]; ok {
			list = append(list, re)
		}
	}
	return list, nil
}

func (m *mockRecurringExpenseStore) Update(ctx context.Context, re *finance.RecurringExpense) error {
	m.expenses[re.ID] = re
	return nil
}

func (m *mockRecurringExpenseStore) Delete(ctx context.Context, id finance.RecurringExpenseID) error {
	delete(m.expenses, id)
	return nil
}

func (m *mockRecurringExpenseStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListRecurringExpensesFilter) (*paging.Page[*finance.RecurringExpense], error) {
	var list []*finance.RecurringExpense
	for _, re := range m.expenses {
		if re.SpaceID == spaceID {
			list = append(list, re)
		}
	}
	pageSize := int(filter.PageSize)
	if pageSize <= 0 {
		pageSize = 20
	}
	return paging.NewPage(list, pageSize, func(e *finance.RecurringExpense) paging.Cursor {
		return paging.Cursor{ID: string(e.ID)}
	}), nil
}

func (m *mockRecurringExpenseStore) ListPendingGeneration(ctx context.Context, maxDueDate time.Time) ([]*finance.RecurringExpense, error) {
	return nil, nil
}

type mockScheduledPaymentStore struct {
	payments map[finance.ScheduledPaymentID]*finance.ScheduledPayment
}

func (m *mockScheduledPaymentStore) Create(ctx context.Context, sp *finance.ScheduledPayment) error {
	m.payments[sp.ID] = sp
	return nil
}

func (m *mockScheduledPaymentStore) GetByID(ctx context.Context, spaceID finance.SpaceID, id finance.ScheduledPaymentID) (*finance.ScheduledPayment, error) {
	sp, ok := m.payments[id]
	if !ok {
		return nil, errors.New("scheduled payment not found")
	}
	return sp, nil
}

func (m *mockScheduledPaymentStore) UpdateStatus(ctx context.Context, id finance.ScheduledPaymentID, status finance.ScheduledPaymentStatus) error {
	if p, ok := m.payments[id]; ok {
		p.Status = status
		return nil
	}
	return errors.New("scheduled payment not found")
}

func (m *mockScheduledPaymentStore) Delete(ctx context.Context, id finance.ScheduledPaymentID) error {
	delete(m.payments, id)
	return nil
}

func (m *mockScheduledPaymentStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListScheduledPaymentsFilter) (*paging.Page[*finance.ScheduledPayment], error) {
	var list []*finance.ScheduledPayment
	for _, sp := range m.payments {
		if sp.SpaceID == spaceID {
			list = append(list, sp)
		}
	}
	pageSize := int(filter.PageSize)
	if pageSize <= 0 {
		pageSize = 20
	}
	return paging.NewPage(list, pageSize, func(p *finance.ScheduledPayment) paging.Cursor {
		return paging.Cursor{ID: string(p.ID)}
	}), nil
}

func TestListRecurringExpensesAndScheduledPaymentsAggregator(t *testing.T) {
	ctx := context.Background()
	spaceID := finance.SpaceID("spc_" + ksuid.New().String())

	// Mocks Setup
	bStore := &mockBudgetStore{budgets: make(map[finance.BudgetID]*finance.Budget)}
	reStore := &mockRecurringExpenseStore{expenses: make(map[finance.RecurringExpenseID]*finance.RecurringExpense)}
	spStore := &mockScheduledPaymentStore{payments: make(map[finance.ScheduledPaymentID]*finance.ScheduledPayment)}

	budget := &finance.Budget{
		ID:       finance.BudgetID("bgt_" + ksuid.New().String()),
		SpaceID:  spaceID,
		Name:     "Test Budget",
		Color:    "red",
		Icon:     "home",
		Currency: finance.Currency("USD"),
	}
	_ = bStore.Create(ctx, budget)

	re := &finance.RecurringExpense{
		ID:          finance.RecurringExpenseID("rec_" + ksuid.New().String()),
		SpaceID:     spaceID,
		BudgetID:    budget.ID,
		Name:        "SaaS",
		Amount:      1000,
		Currency:    finance.Currency("USD"),
		Interval:    "monthly",
		NextDueDate: time.Now(),
		Status:      finance.RecurringExpenseActive,
	}
	_ = reStore.Create(ctx, re)

	sp := &finance.ScheduledPayment{
		ID:         finance.ScheduledPaymentID("sch_" + ksuid.New().String()),
		SpaceID:    spaceID,
		BudgetID:   budget.ID,
		SourceType: "recurrent_expense",
		SourceID:   string(re.ID),
		Amount:     1000,
		Currency:   finance.Currency("USD"),
		DueDate:    time.Now(),
		Status:     finance.ScheduledPaymentPending,
	}
	_ = spStore.Create(ctx, sp)

	deps := finance.Dependencies{
		BudgetStore:           bStore,
		RecurringExpenseStore: reStore,
		ScheduledPaymentStore: spStore,
		SettingsStore:         &mockSettingsStore{settings: make(map[finance.SpaceID]*finance.FinanceSettings)},
	}
	fs := finance.NewService(deps)
	agg := NewService(fs)

	t.Run("ListRecurringExpenses Basic view", func(t *testing.T) {
		page, err := agg.ListRecurringExpenses(ctx, spaceID, ViewBasic, finance.ListRecurringExpensesFilter{})
		if err != nil {
			t.Fatal(err)
		}
		if len(page.Items) != 1 {
			t.Fatalf("expected 1 expense, got %d", len(page.Items))
		}
		if page.Items[0].Budget != nil {
			t.Fatal("budget should be nil in ViewBasic")
		}
	})

	t.Run("ListRecurringExpenses Full view", func(t *testing.T) {
		page, err := agg.ListRecurringExpenses(ctx, spaceID, ViewFull, finance.ListRecurringExpensesFilter{})
		if err != nil {
			t.Fatal(err)
		}
		if len(page.Items) != 1 {
			t.Fatalf("expected 1 expense, got %d", len(page.Items))
		}
		if page.Items[0].Budget == nil {
			t.Fatal("budget should be populated in ViewFull")
		}
		if page.Items[0].Budget.Name != "Test Budget" {
			t.Fatalf("expected budget name 'Test Budget', got '%s'", page.Items[0].Budget.Name)
		}
	})

	t.Run("ListScheduledPayments Basic view", func(t *testing.T) {
		page, err := agg.ListScheduledPayments(ctx, spaceID, ViewBasic, finance.ListScheduledPaymentsFilter{})
		if err != nil {
			t.Fatal(err)
		}
		if len(page.Items) != 1 {
			t.Fatalf("expected 1 payment, got %d", len(page.Items))
		}
		if page.Items[0].Budget != nil || page.Items[0].RecurringExpense != nil {
			t.Fatal("relations should be nil in ViewBasic")
		}
	})

	t.Run("ListScheduledPayments Full view", func(t *testing.T) {
		page, err := agg.ListScheduledPayments(ctx, spaceID, ViewFull, finance.ListScheduledPaymentsFilter{})
		if err != nil {
			t.Fatal(err)
		}
		if len(page.Items) != 1 {
			t.Fatalf("expected 1 payment, got %d", len(page.Items))
		}
		if page.Items[0].Budget == nil {
			t.Fatal("budget should be populated in ViewFull")
		}
		if page.Items[0].RecurringExpense == nil {
			t.Fatal("recurring expense parent should be populated in ViewFull")
		}
		if page.Items[0].RecurringExpense.Name != "SaaS" {
			t.Fatalf("expected parent name 'SaaS', got '%s'", page.Items[0].RecurringExpense.Name)
		}
	})
}
