import { Sparkles, MessageSquare, Bot, Cpu, Plug, History } from "lucide-react"
import type { FeatureMenu } from "@/lib/navigation"

export const menu: FeatureMenu[] = [
  {
    title: "AI Assistant",
    url: "/space/ai/chat",
    icon: Sparkles,
    weight: 5,
    group: "main",
    requiresSpace: true,
  },
  {
    title: "AI Studio",
    icon: Bot,
    weight: 60,
    group: "main",
    requiresSpace: true,
    items: [
      {
        title: "Chat",
        url: "/space/ai/chat",
        icon: MessageSquare,
      },
      {
        title: "Agents",
        url: "/space/ai/agents",
        icon: Bot,
      },
      {
        title: "Models & Providers",
        url: "/space/ai/models",
        icon: Cpu,
      },
      {
        title: "MCP Servers",
        url: "/space/ai/mcp",
        icon: Plug,
      },
      {
        title: "Execution Runs",
        url: "/space/ai/runs",
        icon: History,
      },
    ],
  },
]
