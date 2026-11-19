import { useState } from "react"
import { useTimezone } from "@saturn/hooks"
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
          title="Execution Runs"
          description="Unified audit trail of chat turns, autonomous agent runs, workflows, and MCP invocations."
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
                  <SelectValue placeholder="All kinds">
                    {kindFilter || "All kinds"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All kinds</SelectItem>
                  <SelectItem value="chat_turn">chat_turn</SelectItem>
                  <SelectItem value="agent_run">agent_run</SelectItem>
                  <SelectItem value="generate">generate</SelectItem>
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
                  <SelectValue placeholder="All sources">
                    {sourceFilter || "All sources"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All sources</SelectItem>
                  <SelectItem value="chat">chat</SelectItem>
                  <SelectItem value="workflow">workflow</SelectItem>
                  <SelectItem value="mcp">mcp</SelectItem>
                  <SelectItem value="api">api</SelectItem>
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
                <EmptyTitle>No execution runs recorded</EmptyTitle>
                <EmptyDescription>
                  Runs appear here automatically when you chat, run workflows,
                  or invoke agents via /mcp.
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
                          {r.status}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {r.kind}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {r.source}
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
                        {r.metrics?.tokens?.total ?? 0} tok ·{" "}
                        {r.metrics?.latencyMs ?? 0}ms
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
                      Previous
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
                      Next
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
