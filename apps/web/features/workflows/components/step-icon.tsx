import {
  Bot,
  Sparkles,
  Filter,
  GitBranch,
  Repeat,
  Wand2,
  FileOutput,
  OctagonX,
  FileText,
  Cog,
  Landmark,
  Calendar,
  Mail,
} from "lucide-react"

export function StepIcon({
  type,
  className = "h-4 w-4",
}: {
  type: string
  className?: string
}) {
  switch (type) {
    case "llm.generate":
      return <Sparkles className={className} />
    case "ai.agent_run":
      return <Bot className={className} />
    case "filter":
      return <Filter className={className} />
    case "switch":
      return <GitBranch className={className} />
    case "for_each":
      return <Repeat className={className} />
    case "transform":
      return <Wand2 className={className} />
    case "output":
      return <FileOutput className={className} />
    case "stop":
      return <OctagonX className={className} />
    case "document.extract_text":
      return <FileText className={className} />
    default:
      if (type.startsWith("finance.")) return <Landmark className={className} />
      if (type.startsWith("calendar."))
        return <Calendar className={className} />
      if (type.startsWith("mail.")) return <Mail className={className} />
      return <Cog className={className} />
  }
}
