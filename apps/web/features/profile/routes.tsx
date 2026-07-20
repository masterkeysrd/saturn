import { Navigate } from "react-router-dom"
import type { RouteObject } from "react-router-dom"

export const routes: RouteObject[] = [
  {
    path: "/profile",
    element: <Navigate to="/settings?tab=account" replace />,
  },
]
export default routes
