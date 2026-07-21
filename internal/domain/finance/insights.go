package finance

import (
	"fmt"
	"strings"
	"time"
)

type Granularity string

const (
	GranularityDaily   Granularity = "daily"
	GranularityWeekly  Granularity = "weekly"
	GranularityMonthly Granularity = "monthly"
	GranularityYearly  Granularity = "yearly"
)

// ParseGranularity parses a string representation of granularity into the Granularity type.
func ParseGranularity(s string) (Granularity, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "daily", "day", "d":
		return GranularityDaily, nil
	case "weekly", "week", "w":
		return GranularityWeekly, nil
	case "monthly", "month", "m", "":
		return GranularityMonthly, nil
	case "yearly", "year", "y":
		return GranularityYearly, nil
	default:
		return "", fmt.Errorf("invalid granularity: %q", s)
	}
}

// SpentTrend represents trend aggregation data for a given interval.
type SpentTrend struct {
	IntervalStart  time.Time
	BudgetID       string
	BudgetName     string
	BudgetColor    string
	BudgetCurrency string
	TxnCount       int32
	SpentInBase    int64
	SpentInLocal   int64
}

// BudgetDistribution represents spend allocation per budget.
type BudgetDistribution struct {
	BudgetID             string
	BudgetName           string
	BudgetColor          string
	BudgetIcon           string
	BudgetLimit          int64
	BudgetCurrency       string
	SpentInBase          int64
	SpentInLocalMatching int64
	ExchangeRateToBase   float64
}

// TopExpense represents a high-value transaction.
type TopExpense struct {
	TransactionID   string
	Description     string
	Amount          int64
	Currency        string
	AmountInBase    int64
	BudgetName      string
	TransactionDate time.Time
	EffectiveDate   time.Time
}

// SpentInsights aggregates all calculated outflow analytics.
type SpentInsights struct {
	TotalLimit      int64
	TotalSpent      int64
	RemainingBudget int64
	BurnRate        float64
	Trend           []*TrendDataPoint
	Distributions   []*BudgetUsage
	TopExpenses     []*HighValueExpense
}

type TrendDataPoint struct {
	Label            string
	StartDate        string
	AmountInBase     int64
	TransactionCount int32
	Contributions    []*BudgetContribution
}

type BudgetContribution struct {
	BudgetID               string
	BudgetName             string
	BudgetColor            string
	AmountInBase           int64
	AmountInLocal          int64
	LocalCurrency          string
	ContributionPercentage float64
}

type BudgetUsage struct {
	BudgetID        string
	BudgetName      string
	BudgetColor     string
	BudgetIcon      string
	Limit           int64
	Spent           int64
	SpentInBase     int64
	UsagePercentage float64
}

type HighValueExpense struct {
	TransactionID   string
	Description     string
	Amount          int64
	Currency        string
	AmountInBase    int64
	BudgetName      string
	TransactionDate time.Time
	EffectiveDate   time.Time
}

// GetSpentInsightsRequest encapsulates parameter options for retrieving spent insights.
type GetSpentInsightsRequest struct {
	SpaceID     SpaceID
	Granularity string
	StartDate   time.Time
	EndDate     time.Time
}
