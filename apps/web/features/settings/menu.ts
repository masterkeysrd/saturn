import { SettingsIcon } from "lucide-react"
import type { FeatureMenu } from "@/lib/navigation"

export const menu: FeatureMenu = {
  title: "Settings",
  url: "/space/settings",
  icon: SettingsIcon,
  weight: 80,
  group: "main",
  requiresSpace: true,
}
