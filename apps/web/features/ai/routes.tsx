import { lazy, createElement } from "react"
import type { SaturnRouteObject } from "@/lib/navigation"

export const routes: SaturnRouteObject[] = [
  {
    path: "/space/ai/chat/:threadId?",
    element: createElement(
      lazy(() => import("./chat-view").then((m) => ({ default: m.ChatView })))
    ),
    requiresSpace: true,
  },
  {
    path: "/space/ai/agents",
    element: createElement(
      lazy(() =>
        import("./agents-view").then((m) => ({ default: m.AgentsView }))
      )
    ),
    requiresSpace: true,
  },
  {
    path: "/space/ai/models",
    element: createElement(
      lazy(() =>
        import("./models-view").then((m) => ({ default: m.ModelsView }))
      )
    ),
    requiresSpace: true,
  },
  {
    path: "/space/ai/mcp",
    element: createElement(
      lazy(() =>
        import("./mcp-servers-view").then((m) => ({
          default: m.MCPServersView,
        }))
      )
    ),
    requiresSpace: true,
  },
  {
    path: "/space/ai/runs",
    element: createElement(
      lazy(() => import("./runs-view").then((m) => ({ default: m.RunsView })))
    ),
    requiresSpace: true,
  },
]

export default routes
