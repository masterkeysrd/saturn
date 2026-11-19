import { CalendarIcon } from "lucide-react"
import type { FeatureMenu } from "@/lib/navigation"

export const menu: FeatureMenu = {
  title: "Calendar",
  url: "/calendar",
  icon: CalendarIcon,
  weight: 20,
  group: "pulse",
  requiresSpace: true,
}
