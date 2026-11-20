import {
  formatToolDuration,
  type ToolDescriptor,
  type ToolDomain,
} from "@saturn/core"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { ToolDomainIcon } from "@/components/ai-elements/tool"
import { CheckCircleIcon, ChevronDownIcon } from "lucide-react"
import { useI18n } from "@saturn/hooks"
import type { ReactNode } from "react"

export interface ToolChainGroupItem {
  key: string
  descriptor: ToolDescriptor
  durationMs?: number
  renderTool: () => ReactNode
}

interface ToolChainGroupProps {
  items: ToolChainGroupItem[]
  defaultOpen?: boolean
}

function shortenChainLabel(label: string): string {
  return label.replace(/^List\s+/i, "").trim() || label
}

export function ToolChainGroup({
  items,
  defaultOpen = false,
}: ToolChainGroupProps) {
  const { t } = useI18n()
  const uniqueDomains: ToolDomain[] = []
  for (const item of items) {
    if (!uniqueDomains.includes(item.descriptor.domain)) {
      uniqueDomains.push(item.descriptor.domain)
    }
    if (uniqueDomains.length >= 4) break
  }

  const totalDurationMs = items.reduce(
    (sum, item) => sum + (item.durationMs ?? 0),
    0
  )
  const formattedDuration = formatToolDuration(
    totalDurationMs > 0 ? totalDurationMs : undefined
  )

  const summaryLabels = items
    .slice(0, 3)
    .map((item) => shortenChainLabel(item.descriptor.label))
  const summaryText =
    items.length > 3
      ? `${summaryLabels.join(" · ")} · +${items.length - 3}`
      : summaryLabels.join(" · ")

  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="group/chain not-prose mb-2 w-full rounded-xl border border-border/60 bg-muted/20 transition-colors"
    >
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between gap-2.5 px-3 py-2 text-left text-xs">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex shrink-0 items-center -space-x-1">
            {uniqueDomains.map((domain) => (
              <ToolDomainIcon
                key={domain}
                domain={domain}
                className="ring-1 ring-background"
              />
            ))}
          </div>

          <span className="shrink-0 font-medium text-foreground">
            {t("ai.chain.usedTools", { n: items.length })}
          </span>

          <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">
            · {summaryText}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
          {formattedDuration && (
            <span className="font-mono text-[10px]">{formattedDuration}</span>
          )}
          <Badge variant="secondary" className="gap-1 rounded-full text-[10px]">
            <CheckCircleIcon className="size-3 text-emerald-500" />
            {t("ai.chain.done", { n: items.length })}
          </Badge>
          <ChevronDownIcon className="size-3.5 transition-transform group-data-[open]/chain:rotate-180" />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="divide-y divide-border/40 border-t border-border/40">
        {items.map((item) => (
          <div key={item.key}>{item.renderTool()}</div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}
