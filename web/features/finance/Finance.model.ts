import type { CurrencyCode, Money } from "@/lib/money";
import type { Pagination, Meta } from "@/lib/pagination";

export interface ListBudgetsResponse {
  budgets?: Budget[];
  meta?: Meta;
}

export interface ListBudgetParams extends Pagination {
  search?: string;
  page?: number;
}

export interface Budget {
  id?: string;
  name?: string;
  color?: string;
  icon_name?: string;
  amount?: Money;
  base_amount?: Money;
  spent?: Money;
  base_spent?: Money;
}

export interface UpdateBudgetParams {
  update_mask?: string;
}

export interface Expense {
  id?: string;
  budget_id?: string;
  name?: string;
  description?: string;
  date?: string;
  amount?: number; // cents
  exchange_rate?: number;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateExpenseParams {
  update_mask?: string;
}

export interface ListCurrenciesResponse {
  currencies?: Currency[];
}

export interface Currency {
  code?: CurrencyCode;
  name?: string;
  rate?: number;
}

export interface ListCurrenciesResponse {
  currencies?: Currency[];
}

export interface ListTransactionsResponse {
  transactions?: Transaction[];
}

export interface Transaction {
  id?: string;
  name?: string;
  description?: string;
  type?: TransactionType; // extend if needed
  amount?: Money;
  base_amount?: Money;
  exchange_rate?: number;
  budget_id?: string;
  date?: string; // ISO date (YYYY-MM-DD)
  created_at?: string; // ISO timestamp
  updated_at?: string; // ISO timestamp
}

export type TransactionType = "income" | "expense" | "transfer" | "unknown";

/**
 * FinanceInsights is the top-level response for insights queries.
 */
export interface Insights {
  /** Spending insights data */
  spending: SpendingInsights;
}

/**
 * SpendingInsights contains summary, budget aggregates, and trends.
 */
export interface SpendingInsights {
  /** Summary totals across all budgets and periods */
  summary: SpendingSummary;
  /** Budget-level aggregates across all periods */
  by_budget: SpendingBudgetSummary[];
  /** Time-series data grouped by period */
  trends: SpendingTrendPeriod[];
}

/**
 * SpendingSummary represents total spending across all budgets and periods.
 */
export interface SpendingSummary {
  /** Total amount budgeted */
  budgeted?: Money;
  /** Total amount spent */
  spent?: Money;
  /** Remaining budget (budgeted - spent) */
  remaining?: Money;
  /** Percentage of budgeted amount spent (0-100) */
  usage?: number;
  /** Total number of transactions */
  count?: number;
}

/**
 * SpendingTrendPeriod represents spending for a specific time period.
 */
export interface SpendingTrendPeriod {
  /** Period identifier (e.g., "2025-11" for monthly grouping) */
  period: string;
  /** Start of the period in UTC (ISO 8601 format) */
  period_start: string;
  /** End of the period in UTC (ISO 8601 format) */
  period_end: string;
  /** Total amount budgeted for this period */
  budgeted: Money;
  /** Total amount spent in this period */
  spent: Money;
  /** Remaining budget for this period */
  remaining: Money;
  /** Percentage of budgeted amount spent (0-100) */
  usage: number;
  /** Total number of transactions in this period */
  count: number;
  /** Budget breakdown for this period */
  budgets: SpendingBudgetSummary[];
}

/**
 * SpendingBudgetSummary represents spending for a single budget.
 */
export interface SpendingBudgetSummary {
  /** Unique identifier for the budget */
  budget_id: string;
  /** Human-readable budget name (1-100 characters) */
  budget_name: string;
  /** Amount budgeted */
  budgeted: Money;
  /** Amount spent */
  spent: Money;
  /** Remaining budget */
  remaining: Money;
  /** Percentage of budgeted amount spent (0-100) */
  usage: number;
  /** Total number of transactions */
  count: number;
}
