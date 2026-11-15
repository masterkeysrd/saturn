import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import {
  useListFlowsQuery,
  useEnableFlowMutation,
  useDisableFlowMutation,
  useResetFlowMutation,
  useDeleteFlowMutation,
  useGenerateFlowMutation,
  type Flow,
} from "@saturn/api/gen/saturn/platform/workflow/v1/workflow"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { PageLayout } from "@/components/ui/page-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import { toast } from "@/components/ui/toast"
import { StepIcon } from "./components/step-icon"
import { getStepVisualTheme } from "./components/step-utils"
import {
  Workflow,
  Sparkles,
  Plus,
  History,
  RotateCcw,
  Trash2,
  Copy,
  Pencil,
  Loader2,
  ShieldCheck,
  ArrowRight,
  Zap,
} from "lucide-react"

function RunSparkline({ counts }: { counts?: number[] }) {
  const nums = (counts ?? []).map((c) => Number(c) || 0)
  if (nums.length === 0) return null
  const max = Math.max(...nums, 1)
  return (
    <div className="flex h-5 items-end gap-0.5" aria-label="7-day run activity">
      {nums.map((n, i) => (
        <div
          key={i}
          className="w-1.5 rounded-t bg-primary/60"
          style={{
            height: `${Math.max(15, Math.round((n / max) * 100))}%`,
          }}
          title={`${n} runs`}
        />
      ))}
    </div>
  )
}

export function WorkflowsListView() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { spaceId } = useActiveSpaceContext()

  const { data: flowsData, isLoading } = useListFlowsQuery({})
  const flows = flowsData?.flows ?? []

  const invalidateFlows = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/v1/platform/workflows"] })

  const enableMutation = useEnableFlowMutation({ onSuccess: invalidateFlows })
  const disableMutation = useDisableFlowMutation({ onSuccess: invalidateFlows })
  const resetMutation = useResetFlowMutation({ onSuccess: invalidateFlows })
  const deleteMutation = useDeleteFlowMutation({ onSuccess: invalidateFlows })
  const generateMutation = useGenerateFlowMutation()

  const [aiPrompt, setAiPrompt] = useState("")
  const [resetTarget, setResetTarget] = useState<Flow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Flow | null>(null)

  const systemFlows = flows.filter((f) => f.isSystem)
  const customFlows = flows.filter((f) => !f.isSystem)

  const handleToggleEnabled = async (flow: Flow, nextEnabled: boolean) => {
    if (!flow.id) return
    try {
      if (nextEnabled) {
        await enableMutation.mutateAsync({ id: flow.id, req: { id: flow.id } })
      } else {
        await disableMutation.mutateAsync({ id: flow.id, req: { id: flow.id } })
      }
    } catch (err) {
      toast.add({
        title: "Failed to update workflow status",
        description: err instanceof Error ? err.message : "Unknown error",
        type: "error",
      })
    }
  }

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    const prompt = aiPrompt.trim()
    if (!prompt || !spaceId) return
    try {
      const draftFlow = await generateMutation.mutateAsync({ prompt })
      navigate(`/space/${spaceId}/workflows/new`, {
        state: { draftFlow },
      })
    } catch (err) {
      toast.add({
        title: "Failed to generate workflow",
        description: err instanceof Error ? err.message : "Unknown error",
        type: "error",
      })
    }
  }

  const handleDuplicate = (flow: Flow) => {
    if (!spaceId) return
    const cloned: Flow = {
      ...flow,
      id: undefined,
      systemKey: undefined,
      isSystem: false,
      name: `${flow.name} (Copy)`,
      triggers: (flow.triggers ?? []).map((t) => ({
        ...t,
        id: undefined,
        flowId: undefined,
      })),
    }
    navigate(`/space/${spaceId}/workflows/new`, {
      state: { draftFlow: cloned },
    })
  }

  const handleConfirmReset = async () => {
    if (!resetTarget?.id) return
    try {
      await resetMutation.mutateAsync({
        id: resetTarget.id,
        req: { id: resetTarget.id },
      })
      toast.add({
        title: "System Workflow Reset",
        description: `${resetTarget.name} restored to factory defaults.`,
        type: "success",
      })
      setResetTarget(null)
    } catch (err) {
      toast.add({
        title: "Reset failed",
        description: err instanceof Error ? err.message : "Unknown error",
        type: "error",
      })
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget?.id) return
    try {
      await deleteMutation.mutateAsync({
        id: deleteTarget.id,
        req: { id: deleteTarget.id },
      })
      toast.add({
        title: "Workflow Deleted",
        description: `${deleteTarget.name} has been deleted.`,
        type: "success",
      })
      setDeleteTarget(null)
    } catch (err) {
      toast.add({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unknown error",
        type: "error",
      })
    }
  }

  const renderFlowCard = (flow: Flow) => {
    const total7d = Number(flow.stats?.totalRuns7d ?? 0)
    const completed7d = Number(flow.stats?.completedRuns7d ?? 0)
    const failed7d = Number(flow.stats?.failedRuns7d ?? 0)

    return (
      <Card
        key={flow.id ?? flow.name}
        className="flex flex-col justify-between rounded-2xl border-border/50 bg-card/60"
      >
        <CardHeader className="space-y-2 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base font-bold">
                  {flow.name}
                </CardTitle>
                {flow.isSystem && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary uppercase">
                    <ShieldCheck className="h-3 w-3" />
                    Built-in
                  </span>
                )}
              </div>
              <CardDescription className="line-clamp-2 text-xs">
                {flow.description || "No description provided."}
              </CardDescription>
            </div>
            <Switch
              checked={flow.isEnabled}
              onCheckedChange={(checked) =>
                handleToggleEnabled(flow, Boolean(checked))
              }
              aria-label={`Toggle ${flow.name}`}
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pb-3">
          {/* Mini Visual Pipeline Preview */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/40 bg-background/40 px-2.5 py-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-500 uppercase">
              <Zap className="h-2.5 w-2.5" />
              {flow.triggers?.[0]?.type || "manual"}
            </span>
            {(flow.steps ?? []).slice(0, 4).map((step, sIdx) => {
              const vTheme = getStepVisualTheme(step.type)
              return (
                <div
                  key={`${step.id}-${sIdx}`}
                  className="flex items-center gap-1"
                >
                  <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                  <span
                    className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${vTheme.badgeClass}`}
                    title={step.name || step.id}
                  >
                    <StepIcon type={step.type} className="h-2.5 w-2.5" />
                    <span className="max-w-[78px] truncate">
                      {step.name || step.id}
                    </span>
                  </span>
                </div>
              )
            })}
            {(flow.steps?.length ?? 0) > 4 && (
              <span className="text-[10px] font-semibold text-muted-foreground">
                +{(flow.steps?.length ?? 0) - 4} more
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="rounded-md bg-muted px-2 py-0.5 font-medium">
              {flow.triggers?.length ?? 0} trigger
              {(flow.triggers?.length ?? 0) === 1 ? "" : "s"}
            </span>
            <span className="rounded-md bg-muted px-2 py-0.5 font-medium">
              {flow.steps?.length ?? 0} step
              {(flow.steps?.length ?? 0) === 1 ? "" : "s"}
            </span>
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono">
              v{flow.version ?? 1}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-xs">
            <div className="flex items-center gap-3 text-muted-foreground">
              <span>
                <strong className="text-foreground">{total7d}</strong> runs (7d)
              </span>
              {completed7d > 0 && (
                <span className="text-emerald-500">{completed7d} ok</span>
              )}
              {failed7d > 0 && (
                <span className="text-destructive">{failed7d} failed</span>
              )}
            </div>
            <RunSparkline counts={flow.stats?.dailyCounts7d} />
          </div>
        </CardContent>

        <CardFooter className="flex items-center justify-between gap-2 border-t border-border/40 pt-3">
          <div className="flex items-center gap-1.5">
            {spaceId && flow.id && (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link to={`/space/${spaceId}/workflows/${flow.id}`} />}
                className="h-8 gap-1.5 rounded-xl text-xs"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDuplicate(flow)}
              className="h-8 gap-1.5 rounded-xl text-xs"
              title="Duplicate workflow"
            >
              <Copy className="h-3.5 w-3.5" />
              Duplicate
            </Button>
          </div>

          {flow.isSystem ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setResetTarget(flow)}
              className="h-8 gap-1.5 rounded-xl text-xs text-muted-foreground"
              title="Reset to factory defaults"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTarget(flow)}
              className="h-8 gap-1.5 rounded-xl text-xs text-muted-foreground hover:text-destructive"
              title="Delete workflow"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          )}
        </CardFooter>
      </Card>
    )
  }

  return (
    <PageLayout
      title="Workflows Studio"
      description="Automate workspace events, webhooks, schedules, and AI pipelines."
      icon={Workflow}
      actions={
        <div className="flex items-center gap-2">
          {spaceId && (
            <>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link to={`/space/${spaceId}/workflows/runs`} />}
                className="gap-1.5 rounded-xl text-xs"
              >
                <History className="h-4 w-4" />
                Run History
              </Button>
              <Button
                nativeButton={false}
                render={<Link to={`/space/${spaceId}/workflows/new`} />}
                className="gap-1.5 rounded-xl text-xs"
              >
                <Plus className="h-4 w-4" />
                New Workflow
              </Button>
            </>
          )}
        </div>
      }
    >
      {/* Build with AI Prompt Bar */}
      <form
        onSubmit={handleGenerate}
        className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="sm:hidden">
            <p className="text-xs font-bold text-foreground">Build with AI</p>
          </div>
        </div>
        <Input
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          placeholder="Build with AI: e.g. When a scheduled bill is created, upsert a primary calendar reminder..."
          aria-label="Build workflow with AI prompt"
          className="h-10 flex-1 rounded-xl bg-background/80 text-xs"
        />
        <Button
          type="submit"
          disabled={generateMutation.isPending || !aiPrompt.trim()}
          className="h-10 gap-1.5 rounded-xl px-4 text-xs font-semibold"
        >
          {generateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Build with AI
        </Button>
      </form>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
                System Workflows ({systemFlows.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {systemFlows.map(renderFlowCard)}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
                Custom Workflows ({customFlows.length})
              </h2>
            </div>
            {customFlows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/50 p-10 text-center text-xs text-muted-foreground">
                No custom workflows yet. Create one manually or describe an
                automation in the AI bar above.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {customFlows.map(renderFlowCard)}
              </div>
            )}
          </section>
        </div>
      )}

      {/* System Flow Reset Confirmation */}
      <AlertDialog
        open={Boolean(resetTarget)}
        onOpenChange={(open) => !open && setResetTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset System Workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              Restores <strong>{resetTarget?.name}</strong> back to its factory
              blueprint steps, triggers, and configuration. Your workflow ID and
              historical runs are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReset}>
              Reset Workflow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Custom Flow Delete Confirmation */}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently deletes <strong>{deleteTarget?.name}</strong> and its
              triggers. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              Delete Workflow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  )
}
