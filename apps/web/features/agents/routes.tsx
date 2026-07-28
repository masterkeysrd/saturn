import { lazy, createElement } from "react"
import type { SaturnRouteObject } from "@/lib/navigation"

export const routes: SaturnRouteObject[] = [
  {
    path: "/space/agents",
    element: createElement(
      lazy(() =>
        import("./agents-list-view").then((m) => ({
          default: m.AgentsListView,
        }))
      )
    ),
    requiresSpace: true,
  },
  {
    path: "/space/agents/connections",
    element: createElement(
      lazy(() =>
        import("./connections-list-view").then((m) => ({
          default: m.ConnectionsListView,
        }))
      )
    ),
    requiresSpace: true,
  },
  {
    path: "/space/agents/runs",
    element: createElement(
      lazy(() =>
        import("./runs-list-view").then((m) => ({
          default: m.AgentRunsListView,
        }))
      )
    ),
    requiresSpace: true,
  },
]
export default routes
