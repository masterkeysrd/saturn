import {
  Clock,
  Database,
  KeyRound,
  MessageSquare,
  ShieldAlert,
  ShieldCheckIcon,
  Users,
} from "lucide-react"
import type { FeatureMenu } from "@/lib/navigation"

export const menu: FeatureMenu = {
  title: "Admin",
  icon: ShieldCheckIcon,
  weight: 90,
  group: "admin",
  adminOnly: true,
  items: [
    {
      title: "Users Management",
      url: "/admin/users",
      icon: Users,
    },
    {
      title: "Scheduler Panel",
      url: "/admin/scheduler",
      icon: Clock,
    },
    {
      title: "Message Queue",
      url: "/admin/messages",
      icon: MessageSquare,
    },
    {
      title: "Database Backups",
      url: "/admin/backups",
      icon: Database,
    },
    {
      title: "Security Audit",
      url: "/admin/security",
      icon: ShieldAlert,
    },
    {
      title: "OAuth Clients",
      url: "/admin/oauth-clients",
      icon: KeyRound,
    },
  ],
}
