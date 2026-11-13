import { Mail } from "lucide-react"
import type { FeatureMenu } from "@/lib/navigation"
import { MailUnreadBadge } from "./components/mail-unread-badge"

export const menu: FeatureMenu = {
  title: "Email",
  url: "/mail",
  icon: Mail,
  weight: 16,
  group: "main",
  requiresSpace: true,
  badge: MailUnreadBadge,
}
