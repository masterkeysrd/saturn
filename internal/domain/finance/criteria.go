package finance

import "github.com/masterkeysrd/saturn/internal/foundation/space"

type ByBudgetID struct {
	ID      BudgetID
	SpaceID space.ID
}

// isTransactionCriteria enable to filter some transaction
// store methods by BudgetID.
func (*ByBudgetID) isTransactionCriteria() {}

// isBudgetPeriodCriteria enable to filter periods operations
// by Budget ID
func (*ByBudgetID) isBudgetPeriodCriteria() {}
