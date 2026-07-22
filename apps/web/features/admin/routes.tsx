import { Navigate } from "react-router-dom"
import { AdminView } from "./admin-view"
import { SchedulerAdminView } from "./scheduler-view"
import { BackupAdminView } from "./backup-view"
import { AdminSecurityView } from "./security-view"
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
  {
    path: "/admin/scheduler",
    element: (
      <AdminGuard>
        <SchedulerAdminView />
      </AdminGuard>
    ),
  },
  {
    path: "/admin/backups",
    element: (
      <AdminGuard>
        <BackupAdminView />
      </AdminGuard>
    ),
  },
  {
    path: "/admin/security",
    element: (
      <AdminGuard>
        <AdminSecurityView />
      </AdminGuard>
    ),
  },
]
export default routes
