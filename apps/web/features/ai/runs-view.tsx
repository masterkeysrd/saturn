import { useState } from "react"
import { useI18n, useTimezone } from "@saturn/hooks"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import { useListRunsQuery } from "@saturn/api/saturn/platform/ai/v1/ai"
import { PageLayout } from "@/components/ui/page-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { RunTraceSheet } from "./components/run-trace-sheet"
import { HistoryIcon } from "lucide-react"

export function RunsView() {
  const { t, language } = useI18n()
  const tz = useTimezone()
  const [sourceFilter, setSourceFilter] = useState<string>("")
  const [kindFilter, setKindFilter] = useState<string>("")
  const [pageToken, setPageToken] = useState("")
  const [prevPageTokens, setPrevPageTokens] = useState<string[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  const { data, isLoading } = useListRunsQuery({
    source: sourceFilter || undefined,
    kind: kindFilter || undefined,
    pageSize: 25,
    pageToken,
  })

  const runs = data?.runs ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="min-w-0 flex-1">
        <PageLayout
          title={t("ai.runs.title")}
          description={t("ai.runs.description")}
          actions={
            <div className="flex items-center gap-2">
              <Select
                value={kindFilter}
                onValueChange={(v) => {
                  setKindFilter(v ?? "")
                  setPageToken("")
                  setPrevPageTokens([])
                }}
              >
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder={t("ai.runs.allKinds")}>
                    {kindFilter
                      ? getLocalizedEnumLabel(
                          "ai",
                          "runKind",
                          kindFilter,
                          language
                        )
                      : t("ai.runs.allKinds")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t("ai.runs.allKinds")}</SelectItem>
                  <SelectItem value="chat_turn">
                    {getLocalizedEnumLabel(
                      "ai",
                      "runKind",
                      "chat_turn",
                      language
                    )}
                  </SelectItem>
                  <SelectItem value="agent_run">
                    {getLocalizedEnumLabel(
                      "ai",
                      "runKind",
                      "agent_run",
                      language
                    )}
                  </SelectItem>
                  <SelectItem value="generate">
                    {getLocalizedEnumLabel(
                      "ai",
                      "runKind",
                      "generate",
                      language
                    )}
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={sourceFilter}
                onValueChange={(v) => {
                  setSourceFilter(v ?? "")
                  setPageToken("")
                  setPrevPageTokens([])
                }}
              >
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder={t("ai.runs.allSources")}>
                    {sourceFilter
                      ? getLocalizedEnumLabel(
                          "ai",
                          "runSource",
                          sourceFilter,
                          language
                        )
                      : t("ai.runs.allSources")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t("ai.runs.allSources")}</SelectItem>
                  <SelectItem value="chat">
                    {getLocalizedEnumLabel("ai", "runSource", "chat", language)}
                  </SelectItem>
                  <SelectItem value="workflow">
                    {getLocalizedEnumLabel(
                      "ai",
                      "runSource",
                      "workflow",
                      language
                    )}
                  </SelectItem>
                  <SelectItem value="mcp">
                    {getLocalizedEnumLabel("ai", "runSource", "mcp", language)}
                  </SelectItem>
                  <SelectItem value="api">
                    {getLocalizedEnumLabel("ai", "runSource", "api", language)}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        >
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-xl bg-muted/40"
                />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <Empty className="border border-border/50">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HistoryIcon />
                </EmptyMedia>
                <EmptyTitle>{t("empty.aiRunsTitle")}</EmptyTitle>
                <EmptyDescription>
                  {t("empty.aiRunsDescription")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-3">
              <div className="divide-y divide-border/50 rounded-2xl border border-border/60 bg-card">
                {runs.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRunId(r.id ?? null)}
                    className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            r.status === "failed"
                              ? "destructive"
                              : r.status === "completed"
                                ? "secondary"
                                : "outline"
                          }
                          className="text-[10px]"
                        >
                          {getLocalizedEnumLabel(
                            "ai",
                            "runStatus",
                            r.status,
                            language
                          )}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {getLocalizedEnumLabel(
                            "ai",
                            "runKind",
                            r.kind,
                            language
                          )}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {getLocalizedEnumLabel(
                            "ai",
                            "runSource",
                            r.source,
                            language
                          )}
                        </Badge>
                        {r.agentName && (
                          <span className="text-xs font-medium">
                            {r.agentName}
                          </span>
                        )}
                      </div>
                      <p className="max-w-xl truncate text-xs text-muted-foreground">
                        {r.input?.prompt || r.id}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-0.5 text-right text-[11px] text-muted-foreground">
                      <span className="font-mono">
                        {t("ai.runs.tokensLatency", {
                          tokens: r.metrics?.tokens?.total ?? 0,
                          ms: r.metrics?.latencyMs ?? 0,
                        })}
                      </span>
                      <span>
                        {r.createTime
                          ? tz.format(r.createTime, {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {(prevPageTokens.length > 0 || data?.nextPageToken) && (
                <div className="flex items-center justify-center gap-2">
                  {prevPageTokens.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const prevToken =
                          prevPageTokens[prevPageTokens.length - 1] ?? ""
                        setPrevPageTokens((prev) => prev.slice(0, -1))
                        setPageToken(prevToken)
                      }}
                      className="cursor-pointer"
                    >
                      {t("ai.runs.previous")}
                    </Button>
                  )}
                  {data?.nextPageToken && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPrevPageTokens((prev) => [...prev, pageToken])
                        setPageToken(data.nextPageToken ?? "")
                      }}
                      className="cursor-pointer"
                    >
                      {t("ai.runs.next")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </PageLayout>
      </div>

      <RunTraceSheet
        runId={selectedRunId}
        onOpenChange={(open) => {
          if (!open) setSelectedRunId(null)
        }}
      />
    </div>
  )
}
