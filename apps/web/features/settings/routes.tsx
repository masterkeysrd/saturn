import { SettingsView } from "./settings-view"
import type { RouteObject } from "react-router-dom"

export const routes: RouteObject[] = [
  {
    path: "/settings",
    element: <SettingsView />,
  },
]
export default routes
