import { AgentsListView } from "./agents-list-view"
import { ConnectionsListView } from "./connections-list-view"
import { AgentRunsListView } from "./runs-list-view"
import type { SaturnRouteObject } from "@/lib/navigation"

export const routes: SaturnRouteObject[] = [
  {
    path: "/space/agents",
    element: <AgentsListView />,
    requiresSpace: true,
  },
  {
    path: "/space/agents/connections",
    element: <ConnectionsListView />,
    requiresSpace: true,
  },
  {
    path: "/space/agents/runs",
    element: <AgentRunsListView />,
    requiresSpace: true,
  },
]
export default routes
