import { DashboardView } from "./dashboard-view"
import type { RouteObject } from "react-router-dom"

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <DashboardView />,
  },
]
export default routes
