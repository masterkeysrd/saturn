import { Link } from "react-router-dom"
import { Workflow } from "lucide-react"
import { useListFlowRunsQuery } from "@saturn/api/gen/saturn/platform/workflow/v1/workflow"
import { useTimezone } from "@saturn/hooks"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { DashboardWidgetCard } from "./widget-shell"

function getRunStatusBadge(status?: string): {
  variant: "success" | "destructive" | "info" | "warning" | "neutral"
  label: string
} {
  switch (status) {
    case "completed":
      return { variant: "success", label: "Completed" }
    case "failed":
      return { variant: "destructive", label: "Failed" }
    case "running":
      return { variant: "info", label: "Running" }
    case "waiting":
    case "pending":
      return {
        variant: "warning",
        label: status === "waiting" ? "Waiting" : "Pending",
      }
    case "filtered":
      return { variant: "neutral", label: "Filtered" }
    case "stopped":
    case "cancelled":
      return {
        variant: "neutral",
        label: status === "stopped" ? "Stopped" : "Cancelled",
      }
    default:
      return { variant: "neutral", label: status || "Unknown" }
  }
}

export function WorkflowRunsWidget() {
  const { spaceId } = useActiveSpaceContext()
  const tz = useTimezone()

  const { data: runsData, isLoading } = useListFlowRunsQuery(
    { pageSize: 5, pageToken: "" },
    { enabled: Boolean(spaceId), retry: false }
  )

  const runs = runsData?.runs ?? []
  const failedCount = runs.filter((r) => r.status === "failed").length

  return (
    <DashboardWidgetCard
      title="Workflow Runs"
      icon={Workflow}
      badge={
        !isLoading && failedCount > 0 ? (
          <Badge variant="destructive" dot>
            {failedCount} failed
          </Badge>
        ) : undefined
      }
      aiPrompt="Inspect my recent workflow runs and explain any failures or bottlenecks"
      viewAllTo={spaceId ? `/space/${spaceId}/workflows/runs` : undefined}
      viewAllLabel="Run History"
      isLoading={isLoading}
      loadingSkeleton={
        <div className="space-y-2.5">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      }
    >
      {runs.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center gap-2 py-2">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Workflow className="size-4" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                No workflow runs yet
              </p>
              <p className="text-xs text-muted-foreground">
                Create an event-driven workflow to automate finance, mail, and
                AI.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {runs.map((run) => {
            const statusInfo = getRunStatusBadge(run.status)
            const timestamp = run.startTime || run.createTime
            return (
              <Link
                key={run.id}
                to={`/space/${spaceId}/workflows/runs/${run.id}`}
                className="flex items-center justify-between gap-3 py-2.5 transition-colors first:pt-0 last:pb-0 hover:text-primary"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-medium text-foreground">
                    {run.flowName || "Untitled Workflow"}
                  </p>
                  {timestamp && (
                    <p className="font-mono text-xs text-muted-foreground tabular-nums">
                      {tz.formatDate(timestamp, {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      · {tz.formatTime(timestamp)}
                    </p>
                  )}
                </div>
                <Badge variant={statusInfo.variant} dot>
                  {statusInfo.label}
                </Badge>
              </Link>
            )
          })}
        </div>
      )}
    </DashboardWidgetCard>
  )
}
