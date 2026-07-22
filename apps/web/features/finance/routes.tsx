import { InsightsView } from "./insights-view"
import { BudgetsView } from "./budgets-view"
import { RatesView } from "./rates-view"
import { TransactionsView } from "./transactions-view"
import { SettingsView as FinanceSettingsView } from "./settings-view"
import { RecurringView } from "./recurring-view"
import { BorrowingView } from "./borrowing-view"
import { AccountsView } from "./accounts-view"
import type { SaturnRouteObject } from "@/lib/navigation"

export const routes: SaturnRouteObject[] = [
  {
    path: "/finance",
    element: <InsightsView />,
    requiresSpace: true,
  },
  {
    path: "/finance/accounts",
    element: <AccountsView />,
    requiresSpace: true,
  },
  {
    path: "/finance/recurring",
    element: <RecurringView />,
    requiresSpace: true,
  },
  {
    path: "/finance/budgets",
    element: <BudgetsView />,
    requiresSpace: true,
  },
  {
    path: "/finance/rates",
    element: <RatesView />,
    requiresSpace: true,
  },
  {
    path: "/finance/borrowings",
    element: <BorrowingView />,
    requiresSpace: true,
  },
  {
    path: "/finance/transactions",
    element: <TransactionsView />,
    requiresSpace: true,
  },
  {
    path: "/finance/settings",
    element: <FinanceSettingsView />,
    requiresSpace: true,
  },
]
export default routes
