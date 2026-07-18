import { HomeIcon } from "lucide-react"
import type { FeatureMenu } from "@/lib/navigation"

export const menu: FeatureMenu = {
  title: "Dashboard",
  url: "/",
  icon: HomeIcon,
  weight: 0,
  group: "main",
}
