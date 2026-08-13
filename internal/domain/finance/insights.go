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

// FormatLabel returns the presentation string for a given interval timestamp according to granularity rules.
func (g Granularity) FormatLabel(t time.Time) string {
	switch g {
	case GranularityDaily:
		return t.Format("02 Jan")
	case GranularityWeekly:
		_, w := t.ISOWeek()
		return fmt.Sprintf("Wk %d", w)
	case GranularityMonthly:
		return t.Format("Jan 06")
	case GranularityYearly:
		return t.Format("2006")
	default:
		return t.Format("Jan 06")
	}
}

// ResolveRange validates the request options, parses granularity, and computes default date boundaries.
func (req *GetSpentInsightsRequest) ResolveRange() (Granularity, time.Time, time.Time, error) {
	if err := req.SpaceID.Validate(); err != nil {
		return "", time.Time{}, time.Time{}, fmt.Errorf("validate space ID: %w", err)
	}
	g, err := ParseGranularity(req.Granularity)
	if err != nil {
		return "", time.Time{}, time.Time{}, err
	}

	start := req.StartDate
	if start.IsZero() {
		now := time.Now().UTC()
		switch g {
		case GranularityDaily:
			start = now.AddDate(0, 0, -30)
		case GranularityWeekly:
			start = now.AddDate(0, 0, -84)
		case GranularityMonthly:
			start = now.AddDate(-1, 0, 0)
		case GranularityYearly:
			start = now.AddDate(-5, 0, 0)
		}
	}
	end := req.EndDate
	if end.IsZero() {
		end = time.Now().UTC()
	}

	return g, start, end, nil
}

// BuildSpentInsights processes raw trend rows, budget distributions, and top expenses into a fully aggregated SpentInsights model.
func BuildSpentInsights(
	g Granularity,
	start, end time.Time,
	baseCurrency string,
	trendRows []*SpentTrend,
	distRows []*BudgetDistribution,
	topRows []*TopExpense,
) *SpentInsights {
	trendPoints := make([]*TrendDataPoint, 0)
	var currentPoint *TrendDataPoint
	var lastStart time.Time
	var unbudgetedSpentInBase int64

	for _, row := range trendRows {
		if row.BudgetID == "" {
			unbudgetedSpentInBase += row.SpentInBase
		}

		if currentPoint == nil || !row.IntervalStart.Equal(lastStart) {
			currentPoint = &TrendDataPoint{
				Label:     g.FormatLabel(row.IntervalStart),
				StartDate: row.IntervalStart.Format(time.RFC3339),
			}
			trendPoints = append(trendPoints, currentPoint)
			lastStart = row.IntervalStart
		}

		currentPoint.AmountInBase += row.SpentInBase
		currentPoint.TransactionCount += row.TxnCount

		if row.BudgetID != "" {
			currentPoint.Contributions = append(currentPoint.Contributions, &BudgetContribution{
				BudgetID:      row.BudgetID,
				BudgetName:    row.BudgetName,
				BudgetColor:   row.BudgetColor,
				AmountInBase:  row.SpentInBase,
				AmountInLocal: row.SpentInLocal,
				LocalCurrency: row.BudgetCurrency,
			})
		} else {
			currentPoint.Contributions = append(currentPoint.Contributions, &BudgetContribution{
				BudgetID:      "unbudgeted",
				BudgetName:    "Unbudgeted",
				BudgetColor:   "#94a3b8",
				AmountInBase:  row.SpentInBase,
				AmountInLocal: row.SpentInLocal,
				LocalCurrency: baseCurrency,
			})
		}
	}

	for _, pt := range trendPoints {
		if pt.AmountInBase > 0 {
			for _, c := range pt.Contributions {
				c.ContributionPercentage = (float64(c.AmountInBase) / float64(pt.AmountInBase)) * 100.0
			}
		}
	}

	var totalSpent int64
	var totalLimit int64
	distributions := make([]*BudgetUsage, 0, len(distRows)+1)

	for _, r := range distRows {
		totalSpent += r.SpentInBase
		limitInBase := ConvertAmount(r.BudgetLimit, r.ExchangeRateToBase)
		totalLimit += limitInBase

		usagePct := 0.0
		if r.BudgetLimit > 0 {
			usagePct = (float64(r.SpentInLocalMatching) / float64(r.BudgetLimit)) * 100.0
		}

		distributions = append(distributions, &BudgetUsage{
			BudgetID:        r.BudgetID,
			BudgetName:      r.BudgetName,
			BudgetColor:     r.BudgetColor,
			BudgetIcon:      r.BudgetIcon,
			Limit:           r.BudgetLimit,
			Spent:           r.SpentInLocalMatching,
			SpentInBase:     r.SpentInBase,
			UsagePercentage: usagePct,
		})
	}

	if unbudgetedSpentInBase > 0 {
		totalSpent += unbudgetedSpentInBase
		distributions = append(distributions, &BudgetUsage{
			BudgetID:        "unbudgeted",
			BudgetName:      "Unbudgeted",
			BudgetColor:     "#94a3b8",
			BudgetIcon:      "Coins",
			Limit:           0,
			Spent:           unbudgetedSpentInBase,
			SpentInBase:     unbudgetedSpentInBase,
			UsagePercentage: 0.0,
		})
	}

	remaining := totalLimit - totalSpent
	burnRate := 0.0
	days := end.Sub(start).Hours() / 24.0
	if days > 0 {
		burnRate = float64(totalSpent) / days
	}

	topExpenses := make([]*HighValueExpense, 0, len(topRows))
	for _, r := range topRows {
		topExpenses = append(topExpenses, &HighValueExpense{
			TransactionID:   r.TransactionID,
			Description:     r.Description,
			Amount:          r.Amount,
			Currency:        r.Currency,
			AmountInBase:    r.AmountInBase,
			BudgetName:      r.BudgetName,
			TransactionDate: r.TransactionDate,
			EffectiveDate:   r.EffectiveDate,
		})
	}

	return &SpentInsights{
		TotalLimit:      totalLimit,
		TotalSpent:      totalSpent,
		RemainingBudget: remaining,
		BurnRate:        burnRate,
		Trend:           trendPoints,
		Distributions:   distributions,
		TopExpenses:     topExpenses,
	}
}

// Insights holds unified space analytics for outflows and inflows.
type Insights struct {
	Spent  *SpentInsights
	Income *IncomeInsights
}

// IncomeInsights aggregates calculated inflow analytics.
type IncomeInsights struct {
	TotalIncome   int64
	Trend         []*IncomeTrendDataPoint
	Distributions []*IncomeSource
	TopIncomes    []*HighValueIncome
}

type IncomeTrendDataPoint struct {
	Label            string
	StartDate        string
	AmountInBase     int64
	TransactionCount int32
	Contributions    []*AccountContribution
}

type AccountContribution struct {
	AccountID     string
	AccountName   string
	AmountInBase  int64
	AmountInLocal int64
	LocalCurrency string
}

type IncomeSource struct {
	Name         string
	Amount       int64
	AmountInBase int64
	Percentage   float64
}

type HighValueIncome struct {
	TransactionID   string
	Description     string
	Amount          int64
	Currency        string
	AmountInBase    int64
	TransactionDate time.Time
	EffectiveDate   time.Time
}

// BuildIncomeInsights processes raw income trend rows, sources, and top incomes into a fully aggregated IncomeInsights model.
func BuildIncomeInsights(
	g Granularity,
	start, end time.Time,
	baseCurrency string,
	trendRows []*IncomeTrend,
	sourceRows []*IncomeSourceRow,
	topRows []*TopIncome,
) *IncomeInsights {
	trendPoints := make([]*IncomeTrendDataPoint, 0)
	var currentPoint *IncomeTrendDataPoint
	var lastStart time.Time

	for _, row := range trendRows {
		if currentPoint == nil || !row.IntervalStart.Equal(lastStart) {
			currentPoint = &IncomeTrendDataPoint{
				Label:     g.FormatLabel(row.IntervalStart),
				StartDate: row.IntervalStart.Format(time.RFC3339),
			}
			trendPoints = append(trendPoints, currentPoint)
			lastStart = row.IntervalStart
		}

		currentPoint.AmountInBase += row.IncomeInBase
		currentPoint.TransactionCount += row.TxnCount

		if row.AccountID != "" {
			currentPoint.Contributions = append(currentPoint.Contributions, &AccountContribution{
				AccountID:     row.AccountID,
				AccountName:   row.AccountName,
				AmountInBase:  row.IncomeInBase,
				AmountInLocal: row.IncomeInLocal,
				LocalCurrency: row.Currency,
			})
		}
	}

	var totalIncome int64
	distributions := make([]*IncomeSource, 0, len(sourceRows))

	for _, r := range sourceRows {
		totalIncome += r.AmountInBase
	}

	for _, r := range sourceRows {
		pct := 0.0
		if totalIncome > 0 {
			pct = (float64(r.AmountInBase) / float64(totalIncome)) * 100.0
		}
		distributions = append(distributions, &IncomeSource{
			Name:         r.SourceName,
			Amount:       r.AmountInBase,
			AmountInBase: r.AmountInBase,
			Percentage:   pct,
		})
	}

	topIncomes := make([]*HighValueIncome, 0, len(topRows))
	for _, r := range topRows {
		topIncomes = append(topIncomes, &HighValueIncome{
			TransactionID:   r.TransactionID,
			Description:     r.Description,
			Amount:          r.Amount,
			Currency:        r.Currency,
			AmountInBase:    r.AmountInBase,
			TransactionDate: r.TransactionDate,
			EffectiveDate:   r.EffectiveDate,
		})
	}

	return &IncomeInsights{
		TotalIncome:   totalIncome,
		Trend:         trendPoints,
		Distributions: distributions,
		TopIncomes:    topIncomes,
	}
}
