import { lazy, createElement } from "react"
import { Navigate } from "react-router-dom"
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
        {createElement(
          lazy(() =>
            import("./admin-view").then((m) => ({ default: m.AdminView }))
          )
        )}
      </AdminGuard>
    ),
  },
  {
    path: "/admin/scheduler",
    element: (
      <AdminGuard>
        {createElement(
          lazy(() =>
            import("./scheduler-view").then((m) => ({
              default: m.SchedulerAdminView,
            }))
          )
        )}
      </AdminGuard>
    ),
  },
  {
    path: "/admin/messages",
    element: (
      <AdminGuard>
        {createElement(
          lazy(() =>
            import("./message-view").then((m) => ({
              default: m.MessageQueueAdminView,
            }))
          )
        )}
      </AdminGuard>
    ),
  },
  {
    path: "/admin/backups",
    element: (
      <AdminGuard>
        {createElement(
          lazy(() =>
            import("./backup-view").then((m) => ({
              default: m.BackupAdminView,
            }))
          )
        )}
      </AdminGuard>
    ),
  },
  {
    path: "/admin/security",
    element: (
      <AdminGuard>
        {createElement(
          lazy(() =>
            import("./security-view").then((m) => ({
              default: m.AdminSecurityView,
            }))
          )
        )}
      </AdminGuard>
    ),
  },
]
export default routes
