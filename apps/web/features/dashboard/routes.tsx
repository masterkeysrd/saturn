import { lazy, createElement } from "react"
import type { RouteObject } from "react-router-dom"

export const routes: RouteObject[] = [
  {
    path: "/",
    element: createElement(
      lazy(() =>
        import("./dashboard-view").then((m) => ({ default: m.DashboardView }))
      )
    ),
  },
]
export default routes
