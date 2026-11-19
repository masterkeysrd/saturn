import { Mail } from "lucide-react"
import type { FeatureMenu } from "@/lib/navigation"
import { MailUnreadBadge } from "./components/mail-unread-badge"

export const menu: FeatureMenu = {
  title: "Mail",
  url: "/mail",
  icon: Mail,
  weight: 10,
  group: "pulse",
  requiresSpace: true,
  badge: MailUnreadBadge,
}
