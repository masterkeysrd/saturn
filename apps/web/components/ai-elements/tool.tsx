import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { formatToolDuration, type ToolDomain } from "@saturn/core"
import {
  BotIcon,
  Building2Icon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  Loader2Icon,
  MailIcon,
  PlugIcon,
  WalletIcon,
  WorkflowIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { CodeBlock } from "./code-block"

export type ToolState =
  "running" | "completed" | "error" | "awaiting_approval" | "rejected"

export type ToolProps = ComponentProps<typeof Collapsible> & {
  state?: ToolState
}

export const Tool = ({ className, state, ...props }: ToolProps) => (
  <Collapsible
    className={cn(
      "group not-prose mb-2 w-full rounded-xl border transition-colors",
      state === "running"
        ? "border-primary/40 bg-primary/[0.03]"
        : state === "error"
          ? "border-destructive/40 bg-destructive/[0.03]"
          : "border-border/60 bg-muted/20",
      className
    )}
    {...props}
  />
)

const DOMAIN_ICONS: Record<ToolDomain, typeof WrenchIcon> = {
  finance: WalletIcon,
  calendar: CalendarIcon,
  mail: MailIcon,
  workflows: WorkflowIcon,
  space: Building2Icon,
  agent: BotIcon,
  mcp: PlugIcon,
  general: WrenchIcon,
}

const DOMAIN_ICON_STYLES: Record<ToolDomain, string> = {
  finance: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  calendar: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  mail: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  workflows: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  space: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  agent: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  mcp: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  general: "bg-muted text-muted-foreground",
}

export type ToolHeaderProps = {
  title?: string
  toolName: string
  domain?: ToolDomain
  domainLabel?: string
  serverName?: string
  summary?: string
  state: ToolState
  durationMs?: number
  className?: string
}

const statusConfig: Record<
  ToolState,
  {
    label: string
    icon: ReactNode
    variant: "secondary" | "outline" | "destructive"
  }
> = {
  running: {
    label: "Running",
    icon: <Loader2Icon className="size-3 animate-spin text-primary" />,
    variant: "secondary",
  },
  awaiting_approval: {
    label: "Approval Required",
    icon: <ClockIcon className="size-3 text-amber-500" />,
    variant: "outline",
  },
  completed: {
    label: "Completed",
    icon: <CheckCircleIcon className="size-3 text-emerald-500" />,
    variant: "secondary",
  },
  error: {
    label: "Error",
    icon: <XCircleIcon className="size-3 text-destructive" />,
    variant: "destructive",
  },
  rejected: {
    label: "Rejected",
    icon: <XCircleIcon className="size-3 text-muted-foreground" />,
    variant: "outline",
  },
}

export const ToolHeader = ({
  className,
  title,
  toolName,
  domain = "general",
  domainLabel,
  serverName,
  summary,
  state,
  durationMs,
}: ToolHeaderProps) => {
  const cfg = statusConfig[state] ?? statusConfig.completed
  const DomainIcon = DOMAIN_ICONS[domain] ?? WrenchIcon
  const iconTone = DOMAIN_ICON_STYLES[domain] ?? DOMAIN_ICON_STYLES.general
  const formattedDuration = formatToolDuration(durationMs)

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-2.5 px-3 py-2 text-left text-xs",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-md",
            iconTone
          )}
        >
          <DomainIcon className="size-3" />
        </span>

        {domainLabel && (
          <Badge
            variant="outline"
            className="hidden shrink-0 rounded-full px-1.5 py-0 text-[10px] font-medium text-muted-foreground sm:inline-flex"
          >
            {serverName && domain === "mcp" ? serverName : domainLabel}
          </Badge>
        )}

        <span className="truncate font-medium text-foreground">
          {title || toolName}
        </span>

        {summary && (
          <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">
            · {summary}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
        {formattedDuration && (
          <span className="font-mono text-[10px]">{formattedDuration}</span>
        )}
        <Badge variant={cfg.variant} className="gap-1 rounded-full text-[10px]">
          {cfg.icon}
          {cfg.label}
        </Badge>
        <ChevronDownIcon className="size-3.5 transition-transform group-data-[open]:rotate-180" />
      </div>
    </CollapsibleTrigger>
  )
}

export type ToolContentProps = ComponentProps<typeof CollapsibleContent> & {
  toolName?: string
}

export const ToolContent = ({
  className,
  toolName,
  children,
  ...props
}: ToolContentProps) => (
  <CollapsibleContent
    className={cn("border-t border-border/40 px-3 py-2.5 text-xs", className)}
    {...props}
  >
    {toolName && (
      <div className="mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>Tool:</span>
        <code className="rounded bg-muted px-1 py-0.5 font-mono">
          {toolName}
        </code>
      </div>
    )}
    {children}
  </CollapsibleContent>
)

export type ToolInputProps = ComponentProps<"div"> & {
  input?: Record<string, unknown>
}

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => {
  if (!input || Object.keys(input).length === 0) return null

  return (
    <div className={cn("space-y-1.5", className)} {...props}>
      <h4 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        Parameters
      </h4>
      <CodeBlock
        code={JSON.stringify(input, null, 2)}
        language="json"
        className="text-[11px]"
      />
    </div>
  )
}

export type ToolOutputProps = ComponentProps<"div"> & {
  output?: Record<string, unknown>
  errorText?: string
}

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  if (!output && !errorText) return null

  return (
    <div className={cn("mt-2.5 space-y-1.5", className)} {...props}>
      <h4 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {errorText ? "Error" : "Result"}
      </h4>
      {errorText ? (
        <div className="rounded-lg bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
          {errorText}
        </div>
      ) : (
        <CodeBlock
          code={JSON.stringify(output, null, 2)}
          language="json"
          className="text-[11px]"
        />
      )}
    </div>
  )
}
