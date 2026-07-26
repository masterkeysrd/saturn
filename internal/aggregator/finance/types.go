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

// AggregatedRecurringExpense wraps the core recurring expense template with hydrated details.
type AggregatedRecurringExpense struct {
	*finance.RecurringExpense
	Budget *AggregatedBudget
}

// AggregatedScheduledPayment wraps the core scheduled payment instance with hydrated details.
type AggregatedScheduledPayment struct {
	*finance.ScheduledPayment
	Budget           *AggregatedBudget
	RecurringExpense *AggregatedRecurringExpense
}
