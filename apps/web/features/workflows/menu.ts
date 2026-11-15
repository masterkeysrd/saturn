import { Workflow, Zap, History } from "lucide-react"
import type { FeatureMenu } from "@/lib/navigation"

export const menu: FeatureMenu = {
  title: "Workflows",
  icon: Workflow,
  weight: 55,
  group: "main",
  requiresSpace: true,
  items: [
    {
      title: "Studio",
      url: "/space/workflows",
      icon: Zap,
    },
    {
      title: "Run History",
      url: "/space/workflows/runs",
      icon: History,
    },
  ],
}
