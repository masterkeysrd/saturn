import { useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useI18n, useTimezone } from "@saturn/hooks"
import { useRegisterCopilotView } from "@saturn/hooks/ai"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import {
  useListFlowsQuery,
  useListFlowRunsQuery,
  useGetFlowRunQuery,
} from "@saturn/api/gen/saturn/platform/workflow/v1/workflow"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { PageLayout } from "@/components/ui/page-layout"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  History,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Filter,
  OctagonX,
  Sparkles,
} from "lucide-react"
import { openAIDrawer } from "@/features/ai/lib/drawer-events"
import { CodeBlock } from "@/components/ai-elements/code-block"
import { prettifyJsonValue } from "@saturn/core"

const STATUS_OPTIONS = [
  "all",
  "completed",
  "failed",
  "running",
  "pending",
  "filtered",
  "stopped",
] as const

function statusBadge(status: string) {
  switch (status) {
    case "completed":
      return {
        icon: CheckCircle2,
        cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
      }
    case "failed":
      return {
        icon: XCircle,
        cls: "bg-destructive/10 text-destructive border-destructive/30",
      }
    case "filtered":
      return {
        icon: Filter,
        cls: "bg-amber-500/10 text-amber-500 border-amber-500/30",
      }
    case "stopped":
      return {
        icon: OctagonX,
        cls: "bg-muted text-muted-foreground border-border/40",
      }
    default:
      return {
        icon: Clock,
        cls: "bg-primary/10 text-primary border-primary/30",
      }
  }
}

export function WorkflowRunsView() {
  const { t, language } = useI18n()
  const tz = useTimezone()
  const navigate = useNavigate()
  const { runId } = useParams<{ runId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { spaceId } = useActiveSpaceContext()

  useRegisterCopilotView({
    viewId: "workflows.runs",
    title: t("workflows.runs.copilotTitle"),
    suggestions: [
      t("workflows.runs.suggestions.failures"),
      t("workflows.runs.suggestions.slow"),
      t("workflows.runs.suggestions.optimize"),
    ],
  })

  const flowIdParam = searchParams.get("flowId") ?? ""
  const statusParam = searchParams.get("status") ?? "all"

  const [selectedRunId, setSelectedRunId] = useState<string | null>(
    runId ?? null
  )
  const activeRunId = runId ?? selectedRunId

  const { data: flowsData } = useListFlowsQuery({})
  const flows = flowsData?.flows ?? []

  const { data: runsData, isLoading: runsLoading } = useListFlowRunsQuery({
    flowId: flowIdParam || undefined,
    status: statusParam !== "all" ? statusParam : undefined,
    pageSize: 50,
    pageToken: "",
  })
  const runs = runsData?.runs ?? []

  const { data: detailRun, isLoading: detailLoading } = useGetFlowRunQuery(
    { id: activeRunId ?? "" },
    { enabled: Boolean(activeRunId) }
  )

  const handleSelectRun = (id: string) => {
    setSelectedRunId(id)
    if (spaceId) {
      const qs = searchParams.toString()
      navigate(`/space/${spaceId}/workflows/runs/${id}${qs ? `?${qs}` : ""}`)
    }
  }

  return (
    <PageLayout
      title={t("workflows.runs.title")}
      description={t("workflows.runs.description")}
      icon={History}
      actions={
        spaceId && (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link to={`/space/${spaceId}/workflows`} />}
            className="gap-1.5 rounded-xl text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("workflows.runs.backToStudio")}
          </Button>
        )
      }
    >
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/50 bg-card/60 p-4">
        <div className="w-64">
          <Select
            value={flowIdParam || "all"}
            onValueChange={(val) => {
              const next = new URLSearchParams(searchParams)
              if (!val || val === "all") {
                next.delete("flowId")
              } else {
                next.set("flowId", val)
              }
              setSearchParams(next)
            }}
          >
            <SelectTrigger
              className="h-9 rounded-xl text-xs"
              aria-label={t("workflows.runs.filterByWorkflow")}
            >
              <SelectValue placeholder={t("workflows.runs.allWorkflows")}>
                {flowIdParam
                  ? flows.find((f) => f.id === flowIdParam)?.name || flowIdParam
                  : t("workflows.runs.allWorkflows")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all" className="text-xs">
                {t("workflows.runs.allWorkflows")}
              </SelectItem>
              {flows.map((f) => (
                <SelectItem key={f.id} value={f.id ?? ""} className="text-xs">
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-44">
          <Select
            value={statusParam}
            onValueChange={(val) => {
              const next = new URLSearchParams(searchParams)
              if (!val || val === "all") {
                next.delete("status")
              } else {
                next.set("status", val)
              }
              setSearchParams(next)
            }}
          >
            <SelectTrigger
              className="h-9 rounded-xl text-xs"
              aria-label={t("workflows.runs.filterByStatus")}
            >
              <SelectValue>
                {statusParam === "all"
                  ? t("workflows.runs.allStatuses")
                  : getLocalizedEnumLabel(
                      "workflow",
                      "runStatus",
                      statusParam,
                      language
                    )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {s === "all"
                    ? t("workflows.runs.allStatuses")
                    : getLocalizedEnumLabel(
                        "workflow",
                        "runStatus",
                        s,
                        language
                      )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Runs List */}
        <div className="space-y-2 lg:col-span-5">
          {runsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : runs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/50 p-10 text-center text-xs text-muted-foreground">
              {t("workflows.runs.emptyRuns")}
            </div>
          ) : (
            runs.map((run) => {
              const badge = statusBadge(run.status ?? "pending")
              const BadgeIcon = badge.icon
              const isSelected = run.id === activeRunId
              const durationMs = run.metadata?.duration_ms
              const tokensUsed = run.metadata?.tokens_used

              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => handleSelectRun(run.id ?? "")}
                  className={`flex w-full cursor-pointer flex-col gap-2 rounded-2xl border p-4 text-left transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border/50 bg-card/50 hover:bg-card"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold text-foreground">
                      {run.flowName || run.flowId}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${badge.cls}`}
                    >
                      <BadgeIcon className="h-3 w-3" />
                      {getLocalizedEnumLabel(
                        "workflow",
                        "runStatus",
                        run.status ?? "",
                        language
                      )}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="font-mono">{run.id}</span>
                    <span>
                      {run.createTime
                        ? tz.format(run.createTime, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>v{run.flowVersion}</span>
                    {durationMs !== undefined && (
                      <span>{String(durationMs)} ms</span>
                    )}
                    {tokensUsed !== undefined && Number(tokensUsed) > 0 && (
                      <span>
                        {String(tokensUsed)} {t("workflows.runs.tokens")}
                      </span>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Run & Step Trace Inspector */}
        <div className="lg:col-span-7">
          {!activeRunId ? (
            <div className="rounded-2xl border border-dashed border-border/50 p-12 text-center text-xs text-muted-foreground">
              {t("workflows.runs.selectRun")}
            </div>
          ) : detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !detailRun ? (
            <div className="rounded-2xl border border-destructive/30 p-8 text-center text-xs text-destructive">
              {t("workflows.runs.notFound")}
            </div>
          ) : (
            <div className="space-y-4 rounded-2xl border border-border/50 bg-card/60 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/40 pb-4">
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    {detailRun.flowName || detailRun.flowId}
                  </h3>
                  <p className="font-mono text-xs text-muted-foreground">
                    {detailRun.id} • v{detailRun.flowVersion} •{" "}
                    {t("workflows.runs.attempt")} {detailRun.attempts}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>
                    {t("workflows.runs.started")}{" "}
                    {detailRun.startTime
                      ? tz.format(detailRun.startTime, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })
                      : "—"}
                  </div>
                  {detailRun.metadata?.duration_ms !== undefined && (
                    <div>
                      {t("workflows.runs.duration")}{" "}
                      {String(detailRun.metadata.duration_ms)} ms
                    </div>
                  )}
                </div>
              </div>

              {detailRun.error?.message && (
                <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  <div className="font-mono">
                    <strong>
                      {detailRun.error.stepId
                        ? t("workflows.runs.stepFailed", {
                            step: detailRun.error.stepId,
                          }) + " "
                        : t("workflows.runs.runFailed") + " "}
                    </strong>
                    {detailRun.error.message}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      openAIDrawer({
                        prompt: t("workflows.runs.explainPrompt", {
                          id: detailRun.id ?? "",
                          name: detailRun.flowName || detailRun.flowId || "",
                          error: detailRun.error?.message ?? "",
                        }),
                        autoSend: true,
                      })
                    }
                    className="h-7 cursor-pointer gap-1.5 rounded-full border-destructive/40 bg-background/80 text-[11px] text-foreground hover:bg-background"
                  >
                    <Sparkles className="h-3 w-3 text-primary" />
                    {t("workflows.runs.explainWithAI")}
                  </Button>
                </div>
              )}

              {/* Step Timeline */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                  {t("workflows.runs.stepTimeline", {
                    count: detailRun.stepRuns?.length ?? 0,
                  })}
                </h4>
                {(detailRun.stepRuns ?? []).map((sr) => {
                  const sBadge = statusBadge(sr.status ?? "pending")
                  const SIcon = sBadge.icon
                  const srDuration = sr.metadata?.duration_ms
                  const srTokens = sr.metadata?.tokens_used
                  const srSources = sr.metadata?.sources as
                    Record<string, Record<string, unknown>> | undefined

                  return (
                    <div
                      key={sr.id || sr.executionKey}
                      className="space-y-2 rounded-xl border border-border/40 bg-background/50 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-foreground">
                            {sr.executionKey}
                          </span>
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {getLocalizedEnumLabel(
                              "workflow",
                              "stepType",
                              sr.stepType ?? "",
                              language
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {srDuration !== undefined && (
                            <span>{String(srDuration)} ms</span>
                          )}
                          {srTokens !== undefined && Number(srTokens) > 0 && (
                            <span>{String(srTokens)} tokens</span>
                          )}
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${sBadge.cls}`}
                          >
                            <SIcon className="h-3 w-3" />
                            {getLocalizedEnumLabel(
                              "workflow",
                              "runStatus",
                              sr.status ?? "pending",
                              language
                            )}
                          </span>
                        </div>
                      </div>

                      {srSources && Object.keys(srSources).length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(srSources).map(([alias, info]) => (
                            <span
                              key={alias}
                              className="rounded-md border border-border/40 bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                            >
                              {alias}: {String(info.loader ?? "")} (
                              {info.count !== undefined
                                ? Number(info.count) === 1
                                  ? t("workflows.runs.rowsOne", {
                                      count: Number(info.count),
                                    })
                                  : t("workflows.runs.rowsOther", {
                                      count: Number(info.count),
                                    })
                                : info.hit
                                  ? t("workflows.runs.cacheHit")
                                  : t("workflows.runs.cacheMiss")}
                              )
                            </span>
                          ))}
                        </div>
                      )}

                      {sr.error?.message && (
                        <p className="font-mono text-xs text-destructive">
                          {sr.error.message}
                        </p>
                      )}

                      {sr.output && (
                        <CodeBlock
                          code={prettifyJsonValue(sr.output)}
                          language="json"
                          className="max-h-60 overflow-auto"
                        />
                      )}
                    </div>
                  )
                })}
              </div>

              {detailRun.output && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                    {t("workflows.runs.terminalOutput")}
                  </h4>
                  <CodeBlock
                    code={prettifyJsonValue(detailRun.output)}
                    language="json"
                    className="max-h-60 overflow-auto"
                  />
                </div>
              )}

              {detailRun.input && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                    {t("workflows.runs.normalizedInput")}
                  </h4>
                  <CodeBlock
                    code={prettifyJsonValue(detailRun.input)}
                    language="json"
                    className="max-h-60 overflow-auto"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  )
}
