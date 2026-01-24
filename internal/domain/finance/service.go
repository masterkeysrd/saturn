package finance

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/access"
	"github.com/masterkeysrd/saturn/internal/foundation/decimal"
	"github.com/masterkeysrd/saturn/internal/foundation/id"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
	"github.com/masterkeysrd/saturn/internal/pkg/errors"
	"github.com/masterkeysrd/saturn/internal/pkg/ptr"
)

type Service struct {
	budgetStore       BudgetStore
	budgetPeriodStore BudgetPeriodStore
	exchangeRateStore ExchangeRateStore
	insightsStore     InsightsStore
	settingsStore     SettingsStore
	transactionStore  TransactionStore
}

type ServiceParams struct {
	deps.In

	BudgetStore       BudgetStore
	BudgetPeriod      BudgetPeriodStore
	ExchangeRateStore ExchangeRateStore
	SettingsStore     SettingsStore
	TransactionStore  TransactionStore
	InsightsStore     InsightsStore
}

func NewService(params ServiceParams) *Service {
	return &Service{
		budgetStore:       params.BudgetStore,
		budgetPeriodStore: params.BudgetPeriod,
		exchangeRateStore: params.ExchangeRateStore,
		transactionStore:  params.TransactionStore,
		settingsStore:     params.SettingsStore,
		insightsStore:     params.InsightsStore,
	}
}

func (s *Service) CreateExpense(ctx context.Context, actor access.Principal, exp *Expense) (*Transaction, error) {
	if !actor.IsSpaceMember() {
		return nil, errors.New("only space members can create expenses")
	}

	// Initialize and validates the budget.
	if err := exp.Initialize(); err != nil {
		return nil, fmt.Errorf("cannot initialize expense: %w", err)
	}
	if err := exp.ValidateForCreate(); err != nil {
		return nil, fmt.Errorf("invalid expense: %w", err)
	}

	budgetPeriod, err := s.GetPeriodForDate(ctx, actor, exp.BudgetID, exp.Date)
	if err != nil {
		return nil, fmt.Errorf("cannot get period for budget: %w", err)
	}

	// If the user does not set a rate in the expense, the
	// rate from the currency will be used.
	exchangeRate := &ExchangeRate{
		ExchangeRateKey: ExchangeRateKey{
			SpaceID:      actor.SpaceID(),
			CurrencyCode: budgetPeriod.Amount.Currency,
		},
	}
	if exp.ExchangeRate != nil {
		exchangeRate.Rate = *exp.ExchangeRate
	}

	// If the rate, is zero means that was not provided by the user,
	// look up the currency table to get the rate.
	if !exchangeRate.Rate.IsPositive() {
		rateEntry, err := s.exchangeRateStore.Get(ctx, ExchangeRateKey{
			SpaceID:      actor.SpaceID(),
			CurrencyCode: budgetPeriod.Amount.Currency,
		})
		if err != nil {
			return nil, fmt.Errorf("cannot get exchange rate: %w", err)
		}
		exchangeRate.Rate = rateEntry.Rate
	}

	transaction, err := exp.Transaction(budgetPeriod, exchangeRate)
	if err != nil {
		return nil, fmt.Errorf("cannot create transaction: %w", err)
	}

	if err := transaction.Validate(); err != nil {
		return nil, fmt.Errorf("generated transaction is invalid: %w", err)
	}

	if err := s.transactionStore.Store(ctx, transaction); err != nil {
		return nil, fmt.Errorf("cannot store transaction: %w", err)
	}

	return transaction, nil
}

func (s *Service) UpdateExpense(ctx context.Context, actor access.Principal, in *UpdateExpenseInput) (*Transaction, error) {
	if !actor.IsSpaceMember() {
		return nil, errors.New("only space members can update expenses")
	}

	if err := in.Validate(); err != nil {
		return nil, fmt.Errorf("invalid expense for update: %w", err)
	}

	// Clean and trim the input.
	in.Expense.sanitize()

	// Validate for update with field mask
	if err := in.Expense.ValidateForUpdate(in.UpdateMask); err != nil {
		return nil, fmt.Errorf("invalid expense: %w", err)
	}

	// Get existing transaction
	existing, err := s.GetTransaction(ctx, in.ID)
	if err != nil {
		return nil, fmt.Errorf("cannot get transaction: %w", err)
	}

	// Check is done before the existing date is updated.
	shouldUpdatePeriod := in.UpdateMask.Contains("date") && in.Expense.Date != existing.Date

	if err := in.Expense.UpdateTransaction(existing, in.UpdateMask); err != nil {
		return nil, fmt.Errorf("cannot update transaction: %w", err)
	}

	// If date was changed syncronize the period.
	if shouldUpdatePeriod {
		period, err := s.GetPeriodForDate(ctx, actor, *existing.BudgetID, existing.Date)
		if err != nil {
			return nil, fmt.Errorf("cannot get budget period: %w", err)
		}

		existing.BudgetPeriodID = ptr.Of(period.ID)
	}

	if err := existing.Validate(); err != nil {
		return nil, fmt.Errorf("updated transaction is invalid: %w", err)
	}

	if err := s.transactionStore.Store(ctx, existing); err != nil {
		return nil, fmt.Errorf("cannot store transaction: %w", err)
	}

	return existing, nil
}

func (s *Service) ListTransactions(ctx context.Context) ([]*Transaction, error) {
	transactions, err := s.transactionStore.List(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot list transactions: %w", err)
	}
	return transactions, nil
}

func (s *Service) DeleteTransaction(ctx context.Context, tid TransactionID) error {
	if err := id.Validate(tid); err != nil {
		return fmt.Errorf("invalid transaction id: %s", err)
	}
	if _, err := s.transactionStore.Get(ctx, tid); err != nil {
		return fmt.Errorf("cannot get transaction: %w", err)
	}
	if err := s.transactionStore.Delete(ctx, tid); err != nil {
		return fmt.Errorf("cannot delete transaction: %s", err)
	}
	return nil
}

func (s *Service) GetTransaction(ctx context.Context, tid TransactionID) (*Transaction, error) {
	if err := id.Validate(tid); err != nil {
		return nil, fmt.Errorf("invalid id: %w", err)
	}

	transaction, err := s.transactionStore.Get(ctx, tid)
	if err != nil {
		return nil, fmt.Errorf("cannot get transaction: %w", err)
	}

	return transaction, nil
}

func (s *Service) CreateBudget(ctx context.Context, actor access.Principal, budget *Budget) error {
	if !actor.IsSpaceAdmin() {
		return errors.New("only space admins can create budgets")
	}

	// Initialize and validates the budget.
	if err := budget.Initialize(actor); err != nil {
		return fmt.Errorf("cannot initialize budget: %w", err)
	}

	budget.sanitize()
	if err := budget.Validate(); err != nil {
		return fmt.Errorf("invalid budget: %w", err)
	}

	setting, err := s.settingsStore.Get(ctx, actor.SpaceID())
	if err != nil {
		return fmt.Errorf("cannot get settings: %w", err)
	}

	exchangeRate, err := s.exchangeRateStore.Get(ctx, ExchangeRateKey{
		SpaceID:      actor.SpaceID(),
		CurrencyCode: budget.Amount.Currency,
	})
	if err != nil {
		return fmt.Errorf("cannot get exchange rate: %w", err)
	}

	if err := s.budgetStore.Store(ctx, budget); err != nil {
		return fmt.Errorf("cannot store budget: %w", err)
	}

	// Create the first period for the budget.
	period, err := budget.CreatePeriod(exchangeRate, setting, time.Now())
	if err != nil {
		return fmt.Errorf("cannot create period: %w", err)
	}

	if err := period.Validate(); err != nil {
		return fmt.Errorf("budget period is invalid: %w", err)
	}

	if err := s.budgetPeriodStore.Store(ctx, period); err != nil {
		return fmt.Errorf("cannot store budget period: %w", err)
	}

	return nil
}

func (s *Service) UpdateBudget(ctx context.Context, actor access.Principal, in *UpdateBudgetInput) (*Budget, error) {
	if !actor.IsSpaceAdmin() {
		return nil, errors.New("only space admins can update budgets")
	}

	if err := id.Validate(in.ID); err != nil {
		return nil, fmt.Errorf("invalid budget update input: %w", err)
	}

	budget, err := s.GetBudget(ctx, actor, in.ID)
	if err != nil {
		return nil, fmt.Errorf("cannot get budget: %w", err)
	}

	if err := budget.Update(in.Budget, in.UpdateMask); err != nil {
		return nil, fmt.Errorf("cannot update the budget: %w", err)
	}

	budget.sanitize()
	if err := budget.Validate(); err != nil {
		return nil, fmt.Errorf("invalid budget: %w", err)
	}

	if err := s.budgetStore.Store(ctx, budget); err != nil {
		return nil, fmt.Errorf("cannot store budget: %w", err)
	}

	if !in.UpdateMask.Contains("amount") {
		return budget, nil
	}

	period, err := s.GetPeriodForDate(ctx, actor, budget.ID, time.Now())
	if err != nil {
		return nil, fmt.Errorf("cannot get period for budget: %w", err)
	}

	exchangeRate, err := s.exchangeRateStore.Get(ctx, ExchangeRateKey{
		SpaceID:      actor.SpaceID(),
		CurrencyCode: budget.Amount.Currency,
	})
	if err != nil {
		return nil, fmt.Errorf("cannot get exchange rate: %w", err)
	}

	if err := budget.SyncPeriod(period, exchangeRate); err != nil {
		return nil, fmt.Errorf("cannot sync budget period: %w", err)
	}

	if err := period.Validate(); err != nil {
		return nil, fmt.Errorf("budget period is invalid: %w", err)
	}

	if err := s.budgetPeriodStore.Store(ctx, period); err != nil {
		return nil, fmt.Errorf("cannot store budget period: %w", err)
	}

	return budget, nil
}

func (s *Service) DeleteBudget(ctx context.Context, actor access.Principal, bid BudgetID) error {
	if !actor.IsSpaceAdmin() {
		return errors.New("only space admins can delete budgets")
	}

	if err := id.Validate(bid); err != nil {
		return fmt.Errorf("invalid budget id: %w", err)
	}

	criteria := ByBudgetID{bid}
	exists, err := s.transactionStore.ExistsBy(ctx, &criteria)
	if err != nil {
		return fmt.Errorf("cannot check transactions existence for budget: %w", err)
	}

	if exists {
		return errors.New("cannot delete a budget with existing transactions")
	}

	if _, err := s.budgetPeriodStore.DeleteBy(ctx, &criteria); err != nil {
		return fmt.Errorf("cannot delete periods for budget: %w", err)
	}

	if err := s.budgetStore.Delete(ctx, BudgetKey{
		ID: bid, SpaceID: actor.SpaceID(),
	}); err != nil {
		return fmt.Errorf("cannot delete budget: %w", err)
	}

	return nil
}

func (s *Service) GetPeriodForDate(ctx context.Context, actor access.Principal, budgetID BudgetID, date time.Time) (*BudgetPeriod, error) {
	if !actor.IsSpaceMember() {
		return nil, errors.New("only space members can get budget periods")
	}

	setting, err := s.settingsStore.Get(ctx, actor.SpaceID())
	if err != nil {
		return nil, fmt.Errorf("cannot get settings: %w", err)
	}

	// Validate data
	budget, err := s.GetBudget(ctx, actor, budgetID)
	if err != nil {
		return nil, fmt.Errorf("cannot get budget: %w", err)
	}

	period, err := s.budgetPeriodStore.GetByDate(ctx, budgetID, date)
	if err != nil && !errors.IsNotExists(err) {
		return nil, fmt.Errorf("cannot get budget period: %w", err)
	}

	if period != nil {
		return period, nil
	}

	// Get the exchange rate for the budget currency.
	exchangeRate, err := s.exchangeRateStore.Get(ctx, ExchangeRateKey{
		SpaceID:      actor.SpaceID(),
		CurrencyCode: budget.Amount.Currency,
	})
	if err != nil {
		return nil, fmt.Errorf("cannot get exchange rate: %w", err)
	}

	// Create the period for the date.
	period, err = budget.CreatePeriod(exchangeRate, setting, date)
	if err != nil {
		return nil, fmt.Errorf("cannot create period: %w", err)
	}

	if err := period.Validate(); err != nil {
		return nil, fmt.Errorf("budget period is invalid: %w", err)
	}

	if err := s.budgetPeriodStore.Store(ctx, period); err != nil {
		return nil, fmt.Errorf("cannot store budget period: %w", err)
	}

	return period, nil
}

func (s *Service) GetBudget(ctx context.Context, actor access.Principal, id BudgetID) (*Budget, error) {
	if !actor.IsSpaceMember() {
		return nil, errors.New("only space members can get budgets")
	}

	budget, err := s.budgetStore.Get(ctx, BudgetKey{ID: id, SpaceID: actor.SpaceID()})
	if err != nil {
		return nil, fmt.Errorf("cannot get budget: %w", err)
	}

	return budget, nil
}

func (s *Service) ListBudgets(ctx context.Context, actor access.Principal) ([]*Budget, error) {
	budgets, err := s.budgetStore.List(ctx, actor.SpaceID())
	if err != nil {
		return nil, fmt.Errorf("cannot list budgets: %s", err)
	}

	return budgets, nil
}

func (s *Service) CreateExchangeRate(ctx context.Context, actor access.Principal, rate *ExchangeRate) error {
	if !actor.IsSpaceAdmin() {
		return errors.New("only space admins can create exchange rates")
	}

	if err := rate.Initialize(actor); err != nil {
		return fmt.Errorf("cannot initialize exchange rate: %w", err)
	}

	if err := rate.Validate(); err != nil {
		return fmt.Errorf("invalid exchange rate: %w", err)
	}

	exists, err := s.exchangeRateStore.Exists(ctx, ExchangeRateKey{
		SpaceID:      actor.SpaceID(),
		CurrencyCode: rate.CurrencyCode,
	})
	if err != nil {
		return fmt.Errorf("cannot check exchange rate existence: %w", err)
	}
	if exists {
		return errors.New("exchange rate for this currency already exists")
	}

	if err := s.exchangeRateStore.Store(ctx, rate); err != nil {
		return fmt.Errorf("cannot store exchange rate: %w", err)
	}

	return nil
}

func (s *Service) ListExchangeRates(ctx context.Context, actor access.Principal) ([]*ExchangeRate, error) {
	if !actor.IsSpaceMember() {
		return nil, errors.New("only space members can list exchange rates")
	}

	rates, err := s.exchangeRateStore.List(ctx, actor.SpaceID())
	if err != nil {
		return nil, fmt.Errorf("cannot list exchange rates: %w", err)
	}
	return rates, nil
}

func (s *Service) GetExchangeRate(ctx context.Context, actor access.Principal, code CurrencyCode) (*ExchangeRate, error) {
	if !actor.IsSpaceMember() {
		return nil, errors.New("only space members can get exchange rates")
	}

	if err := code.Validate(); err != nil {
		return nil, errors.New("currency code is invalid")
	}

	rate, err := s.exchangeRateStore.Get(ctx, ExchangeRateKey{
		SpaceID:      actor.SpaceID(),
		CurrencyCode: code,
	})
	if err != nil {
		return nil, fmt.Errorf("cannot get exchange rate: %w", err)
	}
	return rate, nil
}

func (s *Service) UpdateExchangeRate(ctx context.Context, actor access.Principal, in *UpdateExchangeRateInput) (*ExchangeRate, error) {
	slog.Info("Service: UpdateExchangeRate called", slog.Any("input", in))
	if !actor.IsSpaceAdmin() {
		return nil, errors.New("only space admins can update exchange rates")
	}

	// TODO: Validate for update
	exchangeRate, err := s.GetExchangeRate(ctx, actor, in.ExchangeRate.CurrencyCode)
	if err != nil {
		return nil, fmt.Errorf("cannot get existing exchange rate: %w", err)
	}

	if err := exchangeRate.Update(actor, in.ExchangeRate, in.UpdateMask); err != nil {
		return nil, fmt.Errorf("cannot update exchange rate: %w", err)
	}

	if err := exchangeRate.Validate(); err != nil {
		return nil, fmt.Errorf("invalid exchange rate: %w", err)
	}

	if err := s.exchangeRateStore.Store(ctx, exchangeRate); err != nil {
		return nil, fmt.Errorf("cannot store exchange rate: %w", err)
	}

	return exchangeRate, nil
}

func (s *Service) ListCurrencies(ctx context.Context) ([]Currency, error) {
	currencies := make([]Currency, 0, len(currencyList))
	currencies = append(currencies, currencyList...)
	return currencies, nil
}

func (s *Service) GetInsights(ctx context.Context, in *GetInsightsInput) (*Insights, error) {
	if err := in.Validate(); err != nil {
		return nil, fmt.Errorf("invalid input: %w", err)
	}

	spendingSeries, err := s.insightsStore.GetSpendingSeries(ctx, SpendingSeriesFilter{
		StartDate: in.StartDate,
		EndState:  in.EndState,
		Budgets:   in.Budgets,
	})
	if err != nil {
		return nil, fmt.Errorf("cannot get spending series: %w", err)
	}

	spendingInsights := NewSpendingInsights()
	spendingInsights.Process(spendingSeries)

	return &Insights{
		Spending: spendingInsights,
	}, nil
}

func (s *Service) CreateSetting(ctx context.Context, actor access.Principal, settings *Setting) error {
	if !actor.IsSpaceOwner() {
		return errors.New("only space owners can create settings")
	}

	// Initialize and validates the settings.
	settings.Initialize()
	settings.Sanitize()
	settings.Touch(actor)
	if err := settings.Validate(); err != nil {
		return fmt.Errorf("invalid settings: %w", err)
	}

	if err := s.settingsStore.Store(ctx, settings); err != nil {
		return fmt.Errorf("cannot store settings: %w", err)
	}

	return nil
}

func (s *Service) GetSetting(ctx context.Context, actor access.Principal) (*Setting, error) {
	if !actor.IsSpaceMember() {
		return nil, errors.New("only space members can get settings")
	}

	settings, err := s.settingsStore.Get(ctx, actor.SpaceID())
	if err != nil {
		return nil, fmt.Errorf("cannot get settings: %w", err)
	}

	return settings, nil
}

func (s *Service) ActivateSetting(ctx context.Context, actor access.Principal) (*Setting, error) {
	if !actor.IsSpaceOwner() {
		return nil, errors.New("only space owners can activate settings")
	}

	settings, err := s.settingsStore.Get(ctx, actor.SpaceID())
	if err != nil {
		return nil, fmt.Errorf("cannot get settings: %w", err)
	}

	if settings.Status != SettingStatusIncomplete {
		return nil, errors.New("only incomplete settings can be activated")
	}

	settings.Status = SettingStatusActive
	settings.Touch(actor)
	if err := settings.Validate(); err != nil {
		return nil, fmt.Errorf("invalid settings: %w", err)
	}

	if err := s.settingsStore.Store(ctx, settings); err != nil {
		return nil, fmt.Errorf("cannot store settings: %w", err)
	}

	// Create the base currency exchange rate.
	baseRate := &ExchangeRate{
		ExchangeRateKey: ExchangeRateKey{
			SpaceID:      actor.SpaceID(),
			CurrencyCode: settings.BaseCurrencyCode,
		},
		Rate:   decimal.FromInt(1),
		IsBase: true,
	}

	if err := baseRate.Initialize(actor); err != nil {
		return nil, fmt.Errorf("cannot initialize base exchange rate: %w", err)
	}

	if err := s.exchangeRateStore.Store(ctx, baseRate); err != nil {
		return nil, fmt.Errorf("cannot store base exchange rate: %w", err)
	}

	return settings, nil
}

func (s *Service) UpdateSetting(ctx context.Context, actor access.Principal, in *UpdateSettingInput) (*Setting, error) {
	if !actor.IsSpaceAdmin() {
		return nil, errors.New("only space admins can update settings")
	}

	if err := in.Validate(); err != nil {
		return nil, fmt.Errorf("invalid update settings input: %w", err)
	}

	settings, err := s.settingsStore.Get(ctx, actor.SpaceID())
	if err != nil {
		return nil, fmt.Errorf("cannot get existing settings: %w", err)
	}

	if err := settings.Update(in.Setting, in.UpdateMask); err != nil {
		return nil, fmt.Errorf("cannot update settings: %w", err)
	}

	settings.Sanitize()
	settings.Touch(actor)
	if err := s.settingsStore.Store(ctx, settings); err != nil {
		return nil, fmt.Errorf("cannot store settings: %w", err)
	}

	return settings, nil
}
