import { lazy, createElement } from "react"
import type { SaturnRouteObject } from "@/lib/navigation"

export const routes: SaturnRouteObject[] = [
  {
    path: "/calendar",
    element: createElement(
      lazy(() =>
        import("./calendar-view").then((m) => ({ default: m.CalendarView }))
      )
    ),
    requiresSpace: true,
  },
]

export default routes
