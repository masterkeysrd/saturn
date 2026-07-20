import { Navigate } from "react-router-dom"
import { BudgetsView } from "./budgets-view"
import { RatesView } from "./rates-view"
import { TransactionsView } from "./transactions-view"
import { SettingsView as FinanceSettingsView } from "./settings-view"
import type { RouteObject } from "react-router-dom"

export const routes: RouteObject[] = [
  {
    path: "/finance",
    element: <Navigate to="/finance/budgets" replace />,
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
    path: "/finance/transactions",
    element: <TransactionsView />,
  },
  {
    path: "/finance/settings",
    element: <FinanceSettingsView />,
  },
]
export default routes
