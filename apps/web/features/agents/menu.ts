import { Bot, Cpu, Key, History } from "lucide-react"
import type { FeatureMenu } from "@/lib/navigation"

export const menu: FeatureMenu = {
  title: "AI Agents",
  icon: Bot,
  weight: 60,
  group: "main",
  requiresSpace: true,
  items: [
    {
      title: "Active Agents",
      url: "/space/agents",
      icon: Cpu,
    },
    {
      title: "LLM Connections",
      url: "/space/agents/connections",
      icon: Key,
    },
    {
      title: "Execution Logs",
      url: "/space/agents/runs",
      icon: History,
    },
  ],
}
