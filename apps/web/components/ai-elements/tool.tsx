import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import {
  extractToolErrorMessage,
  formatCurrencyCents,
  formatToolDuration,
  humanizeFieldLabel,
  isCentsFieldKey,
  isDateOnlyLike,
  isEmptyToolParam,
  isIsoTimestampLike,
  isPlainRecord,
  prettifyJsonValue,
  stripCentsSuffix,
  unwrapToolResult,
  type ToolDomain,
} from "@saturn/core"
import { useTimezone } from "@saturn/hooks"
import {
  AlertCircleIcon,
  BotIcon,
  Building2Icon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  Code2Icon,
  Loader2Icon,
  MailIcon,
  PlugIcon,
  WalletIcon,
  WorkflowIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react"
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react"
import { CodeBlock } from "./code-block"

export type ToolState =
  "running" | "completed" | "error" | "awaiting_approval" | "rejected"

interface ToolContentContextValue {
  showRaw: boolean
}

const ToolContentContext = createContext<ToolContentContextValue>({
  showRaw: false,
})

const useToolContentRaw = () => useContext(ToolContentContext).showRaw

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

export const ToolDomainIcon = ({
  domain = "general",
  className,
}: {
  domain?: ToolDomain
  className?: string
}) => {
  const DomainIcon = DOMAIN_ICONS[domain] ?? WrenchIcon
  const iconTone = DOMAIN_ICON_STYLES[domain] ?? DOMAIN_ICON_STYLES.general
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-md",
        iconTone,
        className
      )}
    >
      <DomainIcon className="size-3" />
    </span>
  )
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
  showRawToggle?: boolean
}

export const ToolContent = ({
  className,
  toolName,
  showRawToggle = true,
  children,
  ...props
}: ToolContentProps) => {
  const [showRaw, setShowRaw] = useState(false)
  const ctxValue = useMemo(() => ({ showRaw }), [showRaw])

  return (
    <ToolContentContext.Provider value={ctxValue}>
      <CollapsibleContent
        className={cn(
          "border-t border-border/40 px-3 py-2.5 text-xs",
          className
        )}
        {...props}
      >
        {(toolName || showRawToggle) && (
          <div className="mb-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
            {toolName ? (
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0">Tool:</span>
                <code className="truncate rounded bg-muted px-1 py-0.5 font-mono">
                  {toolName}
                </code>
              </div>
            ) : (
              <span />
            )}
            {showRawToggle && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setShowRaw((prev) => !prev)}
                aria-label="Toggle raw JSON"
                aria-pressed={showRaw}
                className="h-5 shrink-0 cursor-pointer gap-1 rounded px-1.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
              >
                <Code2Icon className="size-3" />
                {"{ } Raw"}
              </Button>
            )}
          </div>
        )}
        {children}
      </CollapsibleContent>
    </ToolContentContext.Provider>
  )
}

function formatSmartScalar(
  key: string,
  value: unknown,
  tzFormat: (
    date: Date | string | number,
    opts?: Intl.DateTimeFormatOptions
  ) => string,
  sibling?: Record<string, unknown>
): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "number") {
    if (isCentsFieldKey(key)) {
      const currency =
        typeof sibling?.currency === "string" ? sibling.currency : undefined
      return formatCurrencyCents(value, currency)
    }
    return value.toLocaleString()
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (isDateOnlyLike(trimmed)) {
      return tzFormat(trimmed, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    }
    if (isIsoTimestampLike(trimmed)) {
      return tzFormat(trimmed, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    }
    return trimmed
  }
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        typeof v === "string" || typeof v === "number"
          ? String(v)
          : JSON.stringify(v)
      )
      .join(", ")
  }
  if (isPlainRecord(value)) {
    return Object.entries(value)
      .filter(([, v]) => !isEmptyToolParam(v))
      .map(
        ([k, v]) =>
          `${humanizeFieldLabel(k)}: ${formatSmartScalar(k, v, tzFormat, value)}`
      )
      .join(" · ")
  }
  return String(value)
}

export type ToolInputProps = ComponentProps<"div"> & {
  input?: Record<string, unknown>
}

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => {
  const showRaw = useToolContentRaw()
  const tz = useTimezone()

  if (!input || Object.keys(input).length === 0) return null

  if (showRaw) {
    return (
      <div className={cn("space-y-1.5", className)} {...props}>
        <h4 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Parameters
        </h4>
        <CodeBlock
          code={prettifyJsonValue(input)}
          language="json"
          className="rounded-lg border-border/40 text-[11px]"
        />
      </div>
    )
  }

  const nonEmptyEntries = Object.entries(input).filter(
    ([, v]) => !isEmptyToolParam(v)
  )
  if (nonEmptyEntries.length === 0) return null

  return (
    <div className={cn("space-y-1.5", className)} {...props}>
      <h4 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        Parameters
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {nonEmptyEntries.map(([key, value]) => {
          const label = humanizeFieldLabel(
            isCentsFieldKey(key) ? stripCentsSuffix(key) : key
          )
          const formatted = formatSmartScalar(key, value, tz.format, input)
          const isLong = formatted.length > 48
          if (isLong) {
            return (
              <div
                key={key}
                className="w-full border-t border-border/40 pt-1 text-[11px]"
              >
                <span className="font-medium text-muted-foreground">
                  {label}:{" "}
                </span>
                <span className="break-words text-foreground">{formatted}</span>
              </div>
            )
          }
          return (
            <span
              key={key}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[11px]"
            >
              <span className="shrink-0 text-muted-foreground">{label}:</span>
              <span className="truncate font-medium text-foreground">
                {formatted}
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

const PREFERRED_COLUMN_ORDER = [
  "name",
  "title",
  "subject",
  "label",
  "vendor_name",
  "vendor",
  "description",
  "status",
  "type",
  "formatted_amount",
  "formatted_balance",
  "amount_cents",
  "date",
  "id",
]

function pickArrayDisplayColumns(items: Record<string, unknown>[]): string[] {
  const keySet = new Set<string>()
  for (const item of items.slice(0, 6)) {
    for (const [k, v] of Object.entries(item)) {
      if (
        !isEmptyToolParam(v) &&
        !isPlainRecord(v) &&
        !(Array.isArray(v) && v.some((x) => isPlainRecord(x)))
      ) {
        keySet.add(k)
      }
    }
  }
  const allKeys = Array.from(keySet)
  allKeys.sort((a, b) => {
    const idxA = PREFERRED_COLUMN_ORDER.indexOf(a)
    const idxB = PREFERRED_COLUMN_ORDER.indexOf(b)
    if (idxA !== -1 && idxB !== -1) return idxA - idxB
    if (idxA !== -1) return -1
    if (idxB !== -1) return 1
    return 0
  })
  return allKeys.slice(0, 4)
}

function findPrimaryObjectArray(
  record: Record<string, unknown>
): { key: string; items: Record<string, unknown>[] } | undefined {
  for (const [key, value] of Object.entries(record)) {
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((item) => isPlainRecord(item))
    ) {
      return { key, items: value }
    }
  }
  return undefined
}

function GenericOutputFallback({
  output,
}: {
  output: Record<string, unknown>
}) {
  const tz = useTimezone()
  const keys = Object.keys(output)

  if (keys.length === 1 && typeof output.text === "string") {
    return (
      <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground">
        {output.text}
      </p>
    )
  }

  const primaryArray = findPrimaryObjectArray(output)
  if (primaryArray) {
    const { items } = primaryArray
    const cols = pickArrayDisplayColumns(items)
    const visibleItems = items.slice(0, 6)
    const remaining = items.length - visibleItems.length

    if (cols.length >= 2) {
      return (
        <div className="space-y-1.5">
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border/50 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {cols.map((col) => {
                    const isRight =
                      isCentsFieldKey(col) ||
                      col.startsWith("formatted_") ||
                      typeof visibleItems[0]?.[col] === "number"
                    return (
                      <th
                        key={col}
                        className={cn(
                          "px-2 py-1.5 whitespace-nowrap",
                          isRight && "text-right"
                        )}
                      >
                        {humanizeFieldLabel(
                          isCentsFieldKey(col) ? stripCentsSuffix(col) : col
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/35">
                {visibleItems.map((item, idx) => (
                  <tr key={idx} className="transition-colors hover:bg-muted/30">
                    {cols.map((col, colIdx) => {
                      const rawVal = item[col]
                      const isRight =
                        isCentsFieldKey(col) ||
                        col.startsWith("formatted_") ||
                        typeof rawVal === "number"
                      return (
                        <td
                          key={col}
                          className={cn(
                            "max-w-[200px] truncate px-2 py-1.5 align-top tabular-nums",
                            colIdx === 0
                              ? "font-medium text-foreground"
                              : "text-muted-foreground",
                            isRight &&
                              "text-right font-medium whitespace-nowrap text-foreground"
                          )}
                        >
                          {isEmptyToolParam(rawVal)
                            ? "—"
                            : formatSmartScalar(col, rawVal, tz.format, item)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {remaining > 0 && (
            <div className="px-1 text-[11px] text-muted-foreground">
              +{remaining} more
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="divide-y divide-border/40">
        {visibleItems.map((item, idx) => {
          const primaryKey = cols[0]
          const primaryText = primaryKey
            ? formatSmartScalar(primaryKey, item[primaryKey], tz.format, item)
            : `Item ${idx + 1}`
          return (
            <div key={idx} className="py-1.5 text-xs">
              <div className="truncate font-medium text-foreground">
                {primaryText}
              </div>
            </div>
          )
        })}
        {remaining > 0 && (
          <div className="pt-1.5 text-[11px] text-muted-foreground">
            +{remaining} more
          </div>
        )}
      </div>
    )
  }

  const nonEmptyEntries = Object.entries(output).filter(
    ([, v]) => !isEmptyToolParam(v)
  )
  if (nonEmptyEntries.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Completed with no output fields.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
      {nonEmptyEntries.map(([key, value]) => (
        <div
          key={key}
          className="flex items-baseline justify-between gap-2 border-b border-border/30 py-1 text-xs"
        >
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {humanizeFieldLabel(
              isCentsFieldKey(key) ? stripCentsSuffix(key) : key
            )}
          </span>
          <span className="min-w-0 text-right font-medium break-words text-foreground">
            {formatSmartScalar(key, value, tz.format, output)}
          </span>
        </div>
      ))}
    </div>
  )
}

export type ToolOutputProps = ComponentProps<"div"> & {
  output?: Record<string, unknown>
  rawOutput?: Record<string, unknown>
  errorText?: string
  renderCustomOutput?: (
    unwrapped: Record<string, unknown>,
    fallback: ReactNode
  ) => ReactNode
}

export const ToolOutput = ({
  className,
  output,
  rawOutput,
  errorText,
  renderCustomOutput,
  ...props
}: ToolOutputProps) => {
  const showRaw = useToolContentRaw()

  if (!output && !rawOutput && !errorText) return null

  const unwrapped = unwrapToolResult(output ?? rawOutput)

  if (showRaw) {
    const rawPayload = rawOutput ?? output
    const code = rawPayload ? prettifyJsonValue(rawPayload) : (errorText ?? "")
    return (
      <div className={cn("mt-2.5 space-y-1.5", className)} {...props}>
        <h4 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          {errorText ? "Error" : "Result"}
        </h4>
        <CodeBlock
          code={code}
          language="json"
          className="rounded-lg border-border/40 text-[11px]"
        />
      </div>
    )
  }

  if (errorText) {
    const humanError =
      extractToolErrorMessage(rawOutput ?? output, errorText) ?? errorText
    return (
      <div className={cn("mt-2.5 space-y-1.5", className)} {...props}>
        <h4 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Error
        </h4>
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 break-words">{humanError}</span>
        </div>
      </div>
    )
  }

  if (!unwrapped) return null

  const fallbackNode = <GenericOutputFallback output={unwrapped} />
  const contentNode = renderCustomOutput
    ? renderCustomOutput(unwrapped, fallbackNode)
    : fallbackNode

  return (
    <div className={cn("mt-2.5 space-y-1.5", className)} {...props}>
      <h4 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        Result
      </h4>
      {contentNode}
    </div>
  )
}
