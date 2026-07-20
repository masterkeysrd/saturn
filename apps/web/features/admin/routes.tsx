import { Navigate } from "react-router-dom"
import { AdminView } from "./admin-view"
import { AdminGuard } from "./admin-guard"
import type { RouteObject } from "react-router-dom"

export const routes: RouteObject[] = [
  {
    path: "/admin",
    element: (
      <AdminGuard>
        <Navigate to="/admin/users" replace />
      </AdminGuard>
    ),
  },
  {
    path: "/admin/users",
    element: (
      <AdminGuard>
        <AdminView />
      </AdminGuard>
    ),
  },
]
export default routes
