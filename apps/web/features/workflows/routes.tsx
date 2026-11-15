import { lazy, createElement } from "react"
import type { SaturnRouteObject } from "@/lib/navigation"

export const routes: SaturnRouteObject[] = [
  {
    path: "/space/workflows",
    element: createElement(
      lazy(() =>
        import("./workflows-list-view").then((m) => ({
          default: m.WorkflowsListView,
        }))
      )
    ),
    requiresSpace: true,
  },
  {
    path: "/space/workflows/new",
    element: createElement(
      lazy(() =>
        import("./workflow-editor-view").then((m) => ({
          default: m.WorkflowEditorView,
        }))
      )
    ),
    requiresSpace: true,
  },
  {
    path: "/space/workflows/runs",
    element: createElement(
      lazy(() =>
        import("./workflow-runs-view").then((m) => ({
          default: m.WorkflowRunsView,
        }))
      )
    ),
    requiresSpace: true,
  },
  {
    path: "/space/workflows/runs/:runId",
    element: createElement(
      lazy(() =>
        import("./workflow-runs-view").then((m) => ({
          default: m.WorkflowRunsView,
        }))
      )
    ),
    requiresSpace: true,
  },
  {
    path: "/space/workflows/:flowId",
    element: createElement(
      lazy(() =>
        import("./workflow-editor-view").then((m) => ({
          default: m.WorkflowEditorView,
        }))
      )
    ),
    requiresSpace: true,
  },
]

export default routes
