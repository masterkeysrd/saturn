package financeaggregator

import (
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

// AggregatedBudgetPeriod wraps the core budget period with read progress metrics.
type AggregatedBudgetPeriod struct {
	*finance.BudgetPeriod
	SpentAmount int64
	SpentInBase int64
	LimitInBase int64
}

// AggregatedBudget embeds the core budget template and associates it with its active period metrics.
type AggregatedBudget struct {
	*finance.Budget
	Period *AggregatedBudgetPeriod
}

// AggregatedRecurringTransaction wraps the core recurring transaction template with hydrated details.
type AggregatedRecurringTransaction struct {
	*finance.RecurringTransaction
	Budget *AggregatedBudget
}

// AggregatedScheduledTransaction wraps the core scheduled transaction instance with hydrated details.
type AggregatedScheduledTransaction struct {
	*finance.ScheduledTransaction
	Budget               *AggregatedBudget
	RecurringTransaction *AggregatedRecurringTransaction
}
