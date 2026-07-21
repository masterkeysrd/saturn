import { InsightsView } from "./insights-view"
import { BudgetsView } from "./budgets-view"
import { RatesView } from "./rates-view"
import { TransactionsView } from "./transactions-view"
import { SettingsView as FinanceSettingsView } from "./settings-view"
import { RecurringView } from "./recurring-view"
import { BorrowingView } from "./borrowing-view"
import { AccountsView } from "./accounts-view"
import type { RouteObject } from "react-router-dom"

export const routes: RouteObject[] = [
  {
    path: "/finance",
    element: <InsightsView />,
  },
  {
    path: "/finance/accounts",
    element: <AccountsView />,
  },
  {
    path: "/finance/recurring",
    element: <RecurringView />,
  },
  {
    path: "/finance/budgets",
    element: <BudgetsView />,
  },
  {
    path: "/finance/rates",
    element: <RatesView />,
  },
  {
    path: "/finance/borrowings",
    element: <BorrowingView />,
  },
  {
    path: "/finance/transactions",
    element: <TransactionsView />,
  },
  {
    path: "/finance/settings",
    element: <FinanceSettingsView />,
  },
]
export default routes
