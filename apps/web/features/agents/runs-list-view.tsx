import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  useListAgentsQuery,
  useListAgentRunsQuery,
  type AgentRun,
} from "@/gen/saturn/platform/agent/v1/agent"
import { PageLayout } from "@/components/ui/page-layout"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { History, Terminal, Play, Copy, ArrowRight } from "lucide-react"

export function AgentRunsListView() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlAgentId = searchParams.get("agentId") || ""

  const { data: agentsData } = useListAgentsQuery(
    {},
    { staleTime: 60000, refetchOnWindowFocus: false }
  )
  const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null)

  const logAgentId =
    urlAgentId ||
    (agentsData?.agents && agentsData.agents.length > 0
      ? agentsData.agents[0].id
      : "")

  const handleAgentChange = (id: string | null) => {
    const finalId = id || ""
    setSearchParams(finalId ? { agentId: finalId } : {}, { replace: true })
  }

  // Logs query
  const { data: runsData, isLoading } = useListAgentRunsQuery(
    { agentId: logAgentId },
    {
      enabled: !!logAgentId,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    }
  )

  const selectedAgent = agentsData?.agents.find((a) => a.id === logAgentId)

  return (
    <PageLayout
      title="Agent Execution History"
      description="Audit raw model inputs, structured transaction extractions, cost statistics, and logs."
      icon={History}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 border-b border-border/20 pb-6">
          <div className="flex items-center gap-3">
            <Label
              htmlFor="log-select"
              className="shrink-0 text-sm font-semibold select-none"
            >
              Target Agent:
            </Label>
            <Select value={logAgentId} onValueChange={handleAgentChange}>
              <SelectTrigger
                id="log-select"
                className="!h-11 w-full max-w-sm rounded-xl border-border/60 bg-background/50"
              >
                <SelectValue placeholder="Select an agent to inspect...">
                  {selectedAgent
                    ? selectedAgent.name
                    : "Select an agent to inspect..."}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl border border-border/50 bg-card/90 shadow-xl backdrop-blur-xl">
                {agentsData?.agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="max-w-4xl space-y-2">
          {runsData?.runs.map((r) => (
            <div
              key={r.id}
              onClick={() => setSelectedRun(r)}
              className="group flex cursor-pointer items-center justify-between rounded-2xl border border-border/30 bg-card/45 p-3.5 transition-all duration-300 select-none hover:border-primary/25 hover:bg-card/75 hover:shadow-lg"
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                    r.status === "SUCCESS"
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                      : "border-destructive/20 bg-destructive/10 text-destructive"
                  }`}
                >
                  <History className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs leading-tight font-bold text-foreground">
                    {new Date(r.createTime).toLocaleString()}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                    Trace ID: {r.id}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
                  {r.tokensUsed} tokens
                </span>
                <span
                  className={`rounded-lg border px-2 py-0.5 text-[9px] font-extrabold tracking-wider ${
                    r.status === "SUCCESS"
                      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                      : "border-destructive/25 bg-destructive/10 text-destructive"
                  }`}
                >
                  {r.status}
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground/60 transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="p-10 text-center font-sans text-muted-foreground">
              Loading execution run logs...
            </div>
          )}
          {(!logAgentId || runsData?.runs.length === 0) && !isLoading && (
            <div className="col-span-full rounded-3xl border border-dashed border-border/30 bg-card/10 px-4 py-14 text-center font-sans text-muted-foreground select-none">
              <History className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
              <h4 className="text-sm font-bold text-foreground">
                No Run Records Found
              </h4>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                Select an active agent instance or trigger processing to record
                execution logs.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Detailed Execution Audit Drawer */}
      <Sheet
        open={!!selectedRun}
        onOpenChange={(open) => !open && setSelectedRun(null)}
      >
        <SheetContent className="no-scrollbar w-full overflow-y-auto rounded-none border-none bg-card/95 p-0 shadow-2xl backdrop-blur-2xl sm:max-w-[700px] sm:rounded-l-3xl sm:border-l sm:border-border/30">
          <SheetHeader className="border-b border-border/20 pb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${
                    selectedRun?.status === "SUCCESS"
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                      : "border-destructive/20 bg-destructive/10 text-destructive"
                  }`}
                >
                  <History className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <SheetTitle className="text-base font-bold text-foreground">
                    Execution Audit Trace
                  </SheetTitle>
                  <SheetDescription className="font-mono text-xs text-muted-foreground">
                    ID: {selectedRun?.id} •{" "}
                    {selectedRun
                      ? new Date(selectedRun.createTime).toLocaleString()
                      : ""}
                  </SheetDescription>
                </div>
              </div>
              {selectedRun && (
                <span
                  className={`rounded-xl border px-3 py-1 text-[10px] font-extrabold select-none ${
                    selectedRun.status === "SUCCESS"
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                      : "border-destructive/20 bg-destructive/10 text-destructive"
                  }`}
                >
                  {selectedRun.status}
                </span>
              )}
            </div>
          </SheetHeader>

          {selectedRun && (
            <div className="space-y-6 px-6 pt-4 pb-6">
              <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border/10 bg-background/30 p-4 font-mono text-[11px] text-muted-foreground">
                <div>
                  <span className="mb-0.5 block font-sans font-bold text-foreground">
                    Token Footprint
                  </span>
                  {selectedRun.tokensUsed} tokens
                </div>
                <div>
                  <span className="mb-0.5 block font-sans font-bold text-foreground">
                    Execution Time
                  </span>
                  {new Date(selectedRun.createTime).toLocaleTimeString()}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-foreground/80 uppercase select-none">
                    <Terminal className="h-3.5 w-3.5 text-muted-foreground" />{" "}
                    Raw Input Context
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 cursor-pointer rounded-lg border border-border/60 bg-transparent px-3 text-xs font-semibold text-muted-foreground hover:bg-muted/50"
                    onClick={() =>
                      navigator.clipboard.writeText(selectedRun.inputRaw)
                    }
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy Input
                  </Button>
                </div>
                <pre className="max-h-56 overflow-y-auto rounded-2xl border border-border/60 bg-background/80 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-200 select-all">
                  {selectedRun.inputRaw}
                </pre>
              </div>

              {selectedRun.outputRaw && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-primary uppercase select-none">
                      <Play className="h-3.5 w-3.5 text-primary" /> Extracted
                      Output (JSON)
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 cursor-pointer rounded-lg border border-border/60 bg-transparent px-3 text-xs font-semibold text-primary hover:bg-muted/50"
                      onClick={() =>
                        navigator.clipboard.writeText(selectedRun.outputRaw)
                      }
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5 text-primary" />
                      Copy Output
                    </Button>
                  </div>
                  <pre className="max-h-96 overflow-y-auto rounded-2xl border border-border/60 bg-background/85 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-100 select-all">
                    {selectedRun.outputRaw}
                  </pre>
                </div>
              )}

              {selectedRun.errorMessage && (
                <div className="space-y-2 border-t border-destructive/20 pt-4">
                  <div className="text-xs font-bold tracking-wider text-destructive uppercase select-none">
                    Error Log Message
                  </div>
                  <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 font-mono text-xs leading-relaxed text-destructive select-all">
                    {selectedRun.errorMessage}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </PageLayout>
  )
}
