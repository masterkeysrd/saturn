import { SettingsView } from "./settings-view"
import { SpaceSettingsView } from "./space-settings-view"
import type { SaturnRouteObject } from "@/lib/navigation"

export const routes: SaturnRouteObject[] = [
  {
    path: "/settings",
    element: <SettingsView />,
    requiresSpace: false,
  },
  {
    path: "/space/settings",
    element: <SpaceSettingsView />,
    requiresSpace: true,
  },
]
export default routes
