import { lazy, createElement } from "react"
import { Navigate } from "react-router-dom"
import type { SaturnRouteObject } from "@/lib/navigation"

export const routes: SaturnRouteObject[] = [
  {
    path: "/settings",
    element: <Navigate to="/settings/account" replace />,
    requiresSpace: false,
  },
  {
    path: "/settings/*",
    element: createElement(
      lazy(() =>
        import("./settings-view").then((m) => ({ default: m.SettingsView }))
      )
    ),
    requiresSpace: false,
  },
  {
    path: "/space/settings",
    element: createElement(
      lazy(() =>
        import("./space-settings-view").then((m) => ({
          default: m.SpaceSettingsView,
        }))
      )
    ),
    requiresSpace: true,
  },
]
export default routes
