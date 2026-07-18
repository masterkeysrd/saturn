import { ShieldCheckIcon } from "lucide-react"
import type { FeatureMenu } from "@/lib/navigation"

export const menu: FeatureMenu = {
  title: "Admin",
  icon: ShieldCheckIcon,
  weight: 90,
  group: "main",
  adminOnly: true,
  items: [
    {
      title: "Users Management",
      url: "/admin/users",
    },
  ],
}
