// Package finance provides core functionality for managing personal financial activities,
// helping users take control of their budgets, transactions, recurring patterns, and currencies.
//
// This package is designed to offer flexible and extensible tools for personal and small-business
// budgeting with multi-currency support and robust transaction tracking.
//
// Features:
//
//   - Budget management: Create, update, and monitor budgets to plan and control expenses across
//     specific categories (e.g., Food, Transport, Rent). Budgets can be defined as templates and
//     instantiated for concrete periods (e.g., monthly).
//
//   - Budget periods: Associate budgets with time intervals (such as months or quarters), enabling
//     users to track spending and evaluate performance for each budgeting interval.
//
//   - Transactions: Record individual financial events (income or expense), link transactions to
//     applicable budgets and periods, and track impact on budgeted amounts in real time.
//
//   - Recurring income and expenses: Define templates for recurring financial activities, such as
//     monthly salaries or subscription payments. The system can generate notifications or scheduled
//     reminders based on these templates to ensure timely entry.
//
//   - Multi-currency support: Use and track multiple currencies across budgets and transactions.
//     The package supports storing and retrieving exchange rates, converting transaction values to
//     a user-chosen base currency for unified budget tracking and reporting.
//
//   - Analytics & reporting: Summarize, analyze, and export budgeting and spending data across
//     periods, categories, and currencies, providing actionable insights into financial habits.
//
// Core Concepts:
//
//   - A Budget is a template for managing planned spending within a category.
//   - A BudgetPeriod represents a specific instance of a budget for a given time interval
//     (e.g., November 2025), including period-specific exchange rates and actual tracked outcomes.
//   - Transactions are linked to budget periods so their impact can be analyzed against goals.
//   - Currencies and exchange rates are managed explicitly to ensure accurate reporting.
package finance
