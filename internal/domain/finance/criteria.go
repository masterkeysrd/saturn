package finance

type ByBudgetID struct {
	ID BudgetID
}

// isTransactionCriteria enable to filter some transaction
// store methods by BudgetID.
func (*ByBudgetID) isTransactionCriteria() {}

// isBudgetPeriodCriteria enable to filter periods operations
// by Budget ID
func (*ByBudgetID) isBudgetPeriodCriteria() {}
