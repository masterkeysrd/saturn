import type { CurrencyCode, Money } from "@/lib/money";
import type { Meta } from "@/lib/pagination";
import type { MessageInitShape } from "@bufbuild/protobuf";
import {
  Budget_View,
  BudgetSchema,
  ListBudgetsRequestSchema,
  ListExchangeRatesRequestSchema,
  ListTransactionsRequestSchema,
  ListTransactionsResponseSchema,
  TransactionSchema,
  Transaction_Type,
  Transaction_View,
} from "@saturn/gen/saturn/finance/v1/finance_pb";

// Re-export Budget_View as BudgetView for naming consistency.
export {
  Budget_View as BudgetView,
  Transaction_Type as TransactionType,
  Transaction_View as TransactionView,
};

export interface ListBudgetsResponse {
  budgets?: Budget[];
  meta?: Meta;
}

export type ListBudgetParams = MessageInitShape<
  typeof ListBudgetsRequestSchema
>;

export type ListExchangeRatesParams = MessageInitShape<
  typeof ListExchangeRatesRequestSchema
>;

export type Budget = MessageInitShape<typeof BudgetSchema>;

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

export type ListTransactionsParams = MessageInitShape<
  typeof ListTransactionsRequestSchema
>;

export type ListTransactionsResponse = MessageInitShape<
  typeof ListTransactionsResponseSchema
>;

export type Transaction = MessageInitShape<typeof TransactionSchema>;

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
