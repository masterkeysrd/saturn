import { lazy, createElement } from "react"
import type { SaturnRouteObject } from "@/lib/navigation"

export const routes: SaturnRouteObject[] = [
  {
    path: "/finance",
    element: createElement(
      lazy(() =>
        import("./insights-view").then((m) => ({ default: m.InsightsView }))
      )
    ),
    requiresSpace: true,
  },
  {
    path: "/finance/inbox",
    element: createElement(
      lazy(() => import("./inbox-view").then((m) => ({ default: m.InboxView })))
    ),
    requiresSpace: true,
  },
  {
    path: "/finance/accounts",
    element: createElement(
      lazy(() =>
        import("./accounts-view").then((m) => ({ default: m.AccountsView }))
      )
    ),
    requiresSpace: true,
  },
  {
    path: "/finance/reconcile",
    element: createElement(
      lazy(() =>
        import("./reconcile-dashboard-view").then((m) => ({
          default: m.ReconciliationDashboardView,
        }))
      )
    ),
    requiresSpace: true,
  },
  {
    path: "/finance/reconcile/:statementId",
    element: createElement(
      lazy(() =>
        import("./reconcile-workspace-view").then((m) => ({
          default: m.ReconciliationWorkspaceView,
        }))
      )
    ),
    requiresSpace: true,
  },
  {
    path: "/finance/recurring",
    element: createElement(
      lazy(() =>
        import("./recurring-view").then((m) => ({ default: m.RecurringView }))
      )
    ),
    requiresSpace: true,
  },
  {
    path: "/finance/budgets",
    element: createElement(
      lazy(() =>
        import("./budgets-view").then((m) => ({ default: m.BudgetsView }))
      )
    ),
    requiresSpace: true,
  },
  {
    path: "/finance/rates",
    element: createElement(
      lazy(() => import("./rates-view").then((m) => ({ default: m.RatesView })))
    ),
    requiresSpace: true,
  },
  {
    path: "/finance/borrowings",
    element: createElement(
      lazy(() =>
        import("./borrowing-view").then((m) => ({ default: m.BorrowingView }))
      )
    ),
    requiresSpace: true,
  },
  {
    path: "/finance/transactions",
    element: createElement(
      lazy(() =>
        import("./transactions-view").then((m) => ({
          default: m.TransactionsView,
        }))
      )
    ),
    requiresSpace: true,
  },
  {
    path: "/finance/settings",
    element: createElement(
      lazy(() =>
        import("./settings-view").then((m) => ({ default: m.SettingsView }))
      )
    ),
    requiresSpace: true,
  },
]
export default routes
