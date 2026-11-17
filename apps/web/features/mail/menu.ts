import { Mail } from "lucide-react"
import type { FeatureMenu } from "@/lib/navigation"

export const menu: FeatureMenu = {
  title: "Email",
  url: "/mail",
  icon: Mail,
  weight: 16,
  group: "main",
  requiresSpace: true,
}
