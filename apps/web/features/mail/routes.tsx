import { lazy, createElement } from "react"
import type { SaturnRouteObject } from "@/lib/navigation"

export const routes: SaturnRouteObject[] = [
  {
    path: "/mail",
    element: createElement(
      lazy(() => import("./mail-view").then((m) => ({ default: m.MailView })))
    ),
    requiresSpace: true,
  },
]

export default routes
