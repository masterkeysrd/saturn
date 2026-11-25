import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useTestFlowMutation,
  useExecuteFlowMutation,
  type Flow,
  type FlowRun,
} from "@saturn/api/gen/saturn/platform/workflow/v1/workflow"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Play,
  FlaskConical,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import { useI18n } from "@saturn/hooks"
import { prettifyJsonValue } from "@saturn/core"
import { CodeBlock } from "@/components/ai-elements/code-block"

interface TestRunDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  flow: Flow
  onRunComplete?: (run: FlowRun) => void
}

export function TestRunDrawer({
  open,
  onOpenChange,
  flow,
  onRunComplete,
}: TestRunDrawerProps) {
  const { t } = useI18n()
  const [inputJson, setInputJson] = useState("{}")
  const [triggerJson, setTriggerJson] = useState("{}")
  const [parseError, setParseError] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<FlowRun | null>(null)

  const queryClient = useQueryClient()
  const testMutation = useTestFlowMutation()
  const executeMutation = useExecuteFlowMutation()

  const parseRecord = (
    raw: string,
    label: string
  ): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(raw.trim() || "{}")
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setParseError(t("workflows.testRun.jsonObjectError", { label }))
        return null
      }
      return parsed as Record<string, unknown>
    } catch (err) {
      setParseError(
        `${label}: ${err instanceof Error ? err.message : t("workflows.testRun.invalidJson")}`
      )
      return null
    }
  }

  const handleTest = async () => {
    setParseError(null)
    const input = parseRecord(inputJson, t("workflows.testRun.labelInputJson"))
    if (!input) return
    const triggerData = parseRecord(
      triggerJson,
      t("workflows.testRun.labelTriggerJson")
    )
    if (!triggerData) return

    try {
      const run = await testMutation.mutateAsync({
        flow,
        input,
        triggerData,
        artifacts: [],
      })
      setLastRun(run)
      onRunComplete?.(run)
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : t("workflows.testRun.testFailed")
      )
    }
  }

  const handleExecuteLive = async () => {
    if (!flow.id) return
    setParseError(null)
    const input = parseRecord(inputJson, t("workflows.testRun.labelInputJson"))
    if (!input) return

    try {
      const run = await executeMutation.mutateAsync({
        id: flow.id,
        req: {
          id: flow.id,
          input,
          artifacts: [],
          async: false,
        },
      })
      setLastRun(run)
      onRunComplete?.(run)
      await queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          q.queryKey[0].startsWith("/api/v1/platform/workflows"),
      })
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : t("workflows.testRun.liveFailed")
      )
    }
  }

  const isRunning = testMutation.isPending || executeMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(88svh,46rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold">
            <FlaskConical className="h-4 w-4 text-primary" />
            {t("workflows.testRun.title")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("workflows.testRun.descriptionStart")} <code>:test</code>{" "}
            {t("workflows.testRun.descriptionEnd")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">
              {t("workflows.testRun.inputPayload")}
            </Label>
            <Textarea
              value={inputJson}
              onChange={(e) => setInputJson(e.target.value)}
              rows={4}
              className="rounded-xl font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">
              {t("workflows.testRun.triggerEnvelope")}
            </Label>
            <Textarea
              value={triggerJson}
              onChange={(e) => setTriggerJson(e.target.value)}
              rows={3}
              className="rounded-xl font-mono text-xs"
            />
          </div>

          {parseError && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {parseError}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={handleTest}
              disabled={isRunning}
              className="gap-1.5 rounded-xl text-xs"
            >
              {testMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FlaskConical className="h-3.5 w-3.5" />
              )}
              {t("workflows.testRun.runDryTest")}
            </Button>
            {flow.id && (
              <Button
                type="button"
                variant="outline"
                onClick={handleExecuteLive}
                disabled={isRunning}
                className="gap-1.5 rounded-xl text-xs"
              >
                {executeMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {t("workflows.testRun.executeSaved")}
              </Button>
            )}
          </div>

          {lastRun && (
            <div className="space-y-3 border-t border-border/40 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase">
                  {t("workflows.testRun.resultStatus")} {lastRun.status}
                </span>
                {lastRun.status === "completed" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : lastRun.status === "failed" ? (
                  <XCircle className="h-4 w-4 text-destructive" />
                ) : null}
              </div>

              {lastRun.error?.message && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 font-mono text-xs text-destructive">
                  {lastRun.error.stepId ? `[${lastRun.error.stepId}] ` : ""}
                  {lastRun.error.message}
                </div>
              )}

              {lastRun.stepRuns && lastRun.stepRuns.length > 0 && (
                <div className="space-y-2 border-t border-border/40 pt-3">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t("workflows.testRun.stepOutputs")}
                  </span>
                  <div className="divide-y divide-border/40">
                    {lastRun.stepRuns.map((sr) => (
                      <div
                        key={sr.executionKey}
                        className="space-y-1.5 py-2.5 first:pt-0 last:pb-0"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-semibold">
                            {sr.executionKey} ({sr.stepType})
                          </span>
                          <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold uppercase">
                            {sr.status}
                          </span>
                        </div>
                        {sr.output && (
                          <CodeBlock
                            code={prettifyJsonValue(sr.output)}
                            language="json"
                            className="max-h-60 overflow-auto"
                          />
                        )}
                        {sr.error?.message && (
                          <p className="font-mono text-[11px] text-destructive">
                            {sr.error.message}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {lastRun.output && (
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t("workflows.testRun.terminalOutput")}
                  </span>
                  <CodeBlock
                    code={prettifyJsonValue(lastRun.output)}
                    language="json"
                    className="max-h-60 overflow-auto"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
