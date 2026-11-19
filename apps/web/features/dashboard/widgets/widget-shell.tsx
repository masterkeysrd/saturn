import type { ElementType, ReactNode } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, Sparkles } from "lucide-react"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { openAIDrawer } from "@/features/ai/lib/drawer-events"
import { cn } from "@/lib/utils"

export interface DashboardWidgetCardProps {
  title: string
  icon: ElementType
  badge?: ReactNode
  aiPrompt?: string
  viewAllTo?: string
  viewAllLabel?: string
  isLoading?: boolean
  loadingSkeleton?: ReactNode
  className?: string
  children: ReactNode
}

export function DashboardWidgetCard({
  title,
  icon: Icon,
  badge,
  aiPrompt,
  viewAllTo,
  viewAllLabel = "View all",
  isLoading = false,
  loadingSkeleton,
  className,
  children,
}: DashboardWidgetCardProps) {
  return (
    <Card
      size="sm"
      className={cn(
        "group/widget flex h-full flex-col gap-3 rounded-xl border-border/70 bg-card p-4",
        className
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-primary" />
          <CardTitle className="truncate text-[15px] font-semibold tracking-tight">
            {title}
          </CardTitle>
          {badge}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {aiPrompt && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() =>
                      openAIDrawer({ prompt: aiPrompt, autoSend: true })
                    }
                    className="cursor-pointer rounded-md text-muted-foreground opacity-60 transition-opacity hover:text-foreground focus-visible:opacity-100 md:opacity-0 md:group-hover/widget:opacity-100"
                    aria-label={`Ask AI about ${title}`}
                  >
                    <Sparkles className="size-3.5 text-brand-secondary" />
                  </Button>
                }
              />
              <TooltipContent side="top">
                Ask Copilot about {title}
              </TooltipContent>
            </Tooltip>
          )}
          {viewAllTo && (
            <Link
              to={viewAllTo}
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <span>{viewAllLabel}</span>
              <ArrowRight className="size-3" />
            </Link>
          )}
        </div>
      </header>

      <CardContent className="flex flex-1 flex-col p-0">
        {isLoading
          ? loadingSkeleton || (
              <div className="space-y-2.5">
                <Skeleton className="h-6 w-2/5 rounded-md" />
                <Skeleton className="h-4 w-full rounded-md" />
                <Skeleton className="h-4 w-4/5 rounded-md" />
              </div>
            )
          : children}
      </CardContent>
    </Card>
  )
}
