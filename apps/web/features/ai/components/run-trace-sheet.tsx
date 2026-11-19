import { useTimezone } from "@saturn/hooks"
import { useGetRunQuery } from "@saturn/api/saturn/platform/ai/v1/ai"
import { WorkspaceInspectorPanel } from "@/components/ui/inspector-panel"
import { Badge } from "@/components/ui/badge"
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning"
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolState,
} from "@/components/ai-elements/tool"

interface RunTraceSheetProps {
  runId: string | null
  onOpenChange: (open: boolean) => void
}

function stepStatusToToolState(status?: string): ToolState {
  switch (status) {
    case "failed":
      return "error"
    case "awaiting_approval":
      return "awaiting_approval"
    case "rejected":
      return "rejected"
    default:
      return "completed"
  }
}

export function RunTraceSheet({ runId, onOpenChange }: RunTraceSheetProps) {
  const tz = useTimezone()
  const { data: run, isLoading } = useGetRunQuery(
    { id: runId ?? "" },
    { enabled: Boolean(runId) }
  )

  return (
    <WorkspaceInspectorPanel
      open={Boolean(runId)}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <span>Execution Trace</span>
          {run?.status && (
            <Badge
              variant={
                run.status === "failed"
                  ? "destructive"
                  : run.status === "completed"
                    ? "secondary"
                    : "outline"
              }
              className="text-[11px]"
            >
              {run.status}
            </Badge>
          )}
        </span>
      }
      description={<span className="font-mono text-xs">{runId}</span>}
    >
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl bg-muted/40"
              />
            ))}
          </div>
        ) : run ? (
          <>
            <div className="space-y-2 text-xs">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{run.kind}</Badge>
                <Badge variant="secondary">{run.source}</Badge>
                {run.agentName && (
                  <Badge variant="outline">{run.agentName}</Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 text-muted-foreground tabular-nums">
                <div>
                  Started:{" "}
                  {run.startTime
                    ? tz.format(run.startTime, {
                        dateStyle: "short",
                        timeStyle: "medium",
                      })
                    : "—"}
                </div>
                <div>Latency: {run.metrics?.latencyMs ?? "0"} ms</div>
                <div>Tokens: {run.metrics?.tokens?.total ?? 0}</div>
                <div>
                  Est. Cost: ${(run.metrics?.estimatedCostUsd ?? 0).toFixed(5)}
                </div>
              </div>
            </div>

            {run.input?.prompt && (
              <div className="space-y-1.5 border-t border-border/40 pt-4">
                <div className="text-xs font-medium text-muted-foreground">
                  Prompt
                </div>
                <p className="rounded-xl bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                  {run.input.prompt}
                </p>
              </div>
            )}

            {(run.steps ?? []).length > 0 && (
              <div className="space-y-2 border-t border-border/40 pt-4">
                <div className="text-xs font-medium text-muted-foreground">
                  Steps ({run.steps?.length})
                </div>
                {run.steps?.map((step) => {
                  if (step.kind === "llm") {
                    const outText =
                      typeof step.output?.text === "string"
                        ? step.output.text
                        : JSON.stringify(step.output ?? {}, null, 2)
                    return (
                      <Reasoning key={step.id ?? step.seq} defaultOpen={false}>
                        <ReasoningTrigger
                          getThinkingMessage={() =>
                            `Step ${step.seq}: LLM (${step.name}) · ${step.metrics?.durationMs ?? 0}ms`
                          }
                        />
                        <ReasoningContent>{outText}</ReasoningContent>
                      </Reasoning>
                    )
                  }
                  return (
                    <Tool
                      key={step.id ?? step.seq}
                      defaultOpen={step.status === "failed"}
                    >
                      <ToolHeader
                        toolName={`${step.seq}. ${step.name}`}
                        state={stepStatusToToolState(step.status)}
                        durationMs={Number(step.metrics?.durationMs ?? 0)}
                      />
                      <ToolContent>
                        <ToolInput input={step.input} />
                        <ToolOutput
                          output={step.output}
                          errorText={step.error?.message}
                        />
                      </ToolContent>
                    </Tool>
                  )
                })}
              </div>
            )}

            {run.output?.text && (
              <div className="space-y-1.5 border-t border-border/40 pt-4">
                <div className="text-xs font-medium text-muted-foreground">
                  Final Output
                </div>
                <p className="rounded-xl bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                  {run.output.text}
                </p>
              </div>
            )}

            {run.error?.message && (
              <div className="border-t border-border/40 pt-4">
                <div className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
                  {run.error.message}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </WorkspaceInspectorPanel>
  )
}

export { RunTraceSheet as RunTraceInspector }
