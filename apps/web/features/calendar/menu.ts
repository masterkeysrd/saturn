import { CalendarIcon } from "lucide-react"
import type { FeatureMenu } from "@/lib/navigation"

export const menu: FeatureMenu = {
  title: "Calendar",
  url: "/calendar",
  icon: CalendarIcon,
  weight: 15,
  group: "main",
  requiresSpace: true,
}
