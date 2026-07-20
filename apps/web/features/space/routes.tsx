import { Navigate } from "react-router-dom"
import type { RouteObject } from "react-router-dom"

export const routes: RouteObject[] = [
  {
    path: "/spaces",
    element: <Navigate to="/settings?tab=spaces" replace />,
  },
]
export default routes
