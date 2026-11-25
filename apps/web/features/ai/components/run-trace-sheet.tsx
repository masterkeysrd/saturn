import { useI18n, useTimezone } from "@saturn/hooks"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import { prettifyJsonValue } from "@saturn/core"
import { useGetRunQuery } from "@saturn/api/saturn/platform/ai/v1/ai"
import { WorkspaceInspectorPanel } from "@/components/ui/inspector-panel"
import { Badge } from "@/components/ui/badge"
import { CollapsibleContent } from "@/components/ui/collapsible"
import { CodeBlock } from "@/components/ai-elements/code-block"
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
  const { t, language } = useI18n()
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
          <span>{t("ai.trace.title")}</span>
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
              {getLocalizedEnumLabel("ai", "runStatus", run.status, language)}
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
                <Badge variant="outline">
                  {getLocalizedEnumLabel("ai", "runKind", run.kind, language)}
                </Badge>
                <Badge variant="secondary">
                  {getLocalizedEnumLabel(
                    "ai",
                    "runSource",
                    run.source,
                    language
                  )}
                </Badge>
                {run.agentName && (
                  <Badge variant="outline">{run.agentName}</Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 text-muted-foreground tabular-nums">
                <div>
                  {t("ai.trace.started")}{" "}
                  {run.startTime
                    ? tz.format(run.startTime, {
                        dateStyle: "short",
                        timeStyle: "medium",
                      })
                    : "—"}
                </div>
                <div>
                  {t("ai.trace.latency")} {run.metrics?.latencyMs ?? "0"} ms
                </div>
                <div>
                  {t("ai.trace.tokens")} {run.metrics?.tokens?.total ?? 0}
                </div>
                <div>
                  {t("ai.trace.estCost")} $
                  {(run.metrics?.estimatedCostUsd ?? 0).toFixed(5)}
                </div>
              </div>
            </div>

            {run.input?.prompt && (
              <div className="space-y-1.5 border-t border-border/40 pt-4">
                <div className="text-xs font-medium text-muted-foreground">
                  {t("ai.trace.prompt")}
                </div>
                <p className="rounded-xl bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                  {run.input.prompt}
                </p>
              </div>
            )}

            {(run.steps ?? []).length > 0 && (
              <div className="space-y-2 border-t border-border/40 pt-4">
                <div className="text-xs font-medium text-muted-foreground">
                  {t("ai.trace.steps", { n: run.steps?.length ?? 0 })}
                </div>
                {run.steps?.map((step) => {
                  if (step.kind === "llm") {
                    const outText =
                      typeof step.output?.text === "string"
                        ? step.output.text
                        : null
                    return (
                      <Reasoning key={step.id ?? step.seq} defaultOpen={false}>
                        <ReasoningTrigger
                          getThinkingMessage={() =>
                            `Step ${step.seq}: LLM (${step.name}) · ${step.metrics?.durationMs ?? 0}ms`
                          }
                        />
                        {outText !== null ? (
                          <ReasoningContent>{outText}</ReasoningContent>
                        ) : (
                          <CollapsibleContent className="border-t border-border/40 px-3 py-2.5 text-xs">
                            <CodeBlock
                              code={prettifyJsonValue(step.output ?? {})}
                              language="json"
                            />
                          </CollapsibleContent>
                        )}
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
                  {t("ai.trace.finalOutput")}
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
