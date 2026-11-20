import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { buildCopilotEntityKey } from "@saturn/core"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import { useI18n } from "@saturn/hooks"
import { useRegisterCopilotView } from "@saturn/hooks/ai"
import {
  useListFlowsQuery,
  useEnableFlowMutation,
  useDisableFlowMutation,
  useResetFlowMutation,
  useDeleteFlowMutation,
  useGenerateFlowMutation,
  type Flow,
  type Flow_StepNode,
} from "@saturn/api/gen/saturn/platform/workflow/v1/workflow"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { useUrlState } from "@/lib/use-url-state"
import { DocumentPage } from "@/components/ui/page-shells"
import { CopilotAttachButton } from "@/features/ai/components/copilot-attach-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  WORKFLOW_TEMPLATES,
  instantiateWorkflowTemplate,
  type WorkflowTemplateIcon,
} from "./workflow-templates"
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
  Receipt,
  CalendarClock,
  Sunrise,
  AlertTriangle,
  LayoutTemplate,
} from "lucide-react"

const WORKFLOW_TAB_DEFAULTS = {
  tab: "custom" as string,
}

type WorkflowListTab = "custom" | "system" | "templates"

function RunSparkline({
  counts,
  activityAria,
  runTitle,
}: {
  counts?: number[]
  activityAria: string
  runTitle: (count: number) => string
}) {
  const nums = (counts ?? []).map((c) => Number(c) || 0)
  if (nums.length === 0) return null
  const max = Math.max(...nums, 1)
  return (
    <div className="flex h-5 items-end gap-0.5" aria-label={activityAria}>
      {nums.map((n, i) => (
        <div
          key={i}
          className="w-1.5 rounded-t bg-primary/60"
          style={{
            height: `${Math.max(15, Math.round((n / max) * 100))}%`,
          }}
          title={runTitle(n)}
        />
      ))}
    </div>
  )
}

function TemplateIcon({ icon }: { icon: WorkflowTemplateIcon }) {
  switch (icon) {
    case "receipt":
      return <Receipt className="size-4" />
    case "calendar":
      return <CalendarClock className="size-4" />
    case "sunrise":
      return <Sunrise className="size-4" />
    case "alert":
      return <AlertTriangle className="size-4" />
  }
}

function flattenPipelinePreview(steps: Flow_StepNode[]): Flow_StepNode[] {
  const result: Flow_StepNode[] = []
  for (const step of steps) {
    result.push(step)
    if (step.cases && step.cases.length > 0 && step.cases[0].steps) {
      for (const nested of step.cases[0].steps) {
        result.push(nested)
      }
    }
  }
  return result
}

export function WorkflowsListView() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { spaceId } = useActiveSpaceContext()
  const { t, language } = useI18n()

  const templates = useMemo(
    () =>
      WORKFLOW_TEMPLATES.map((tpl) => ({
        ...tpl,
        name: t(`workflows.templates.${tpl.id}.name`),
        description: t(`workflows.templates.${tpl.id}.description`),
        category: t(`workflows.templates.${tpl.categoryKey}`),
      })),
    [t]
  )

  const { data: flowsData, isLoading } = useListFlowsQuery({})
  const flows = flowsData?.flows ?? []

  useRegisterCopilotView({
    viewId: "workflows.list",
    title: t("workflows.copilotTitle"),
    suggestions: [
      t("workflows.suggestions.receipts"),
      t("workflows.suggestions.systemActive"),
      t("workflows.suggestions.morningBriefing"),
    ],
  })

  const invalidateFlows = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/v1/platform/workflows"] })

  const enableMutation = useEnableFlowMutation({ onSuccess: invalidateFlows })
  const disableMutation = useDisableFlowMutation({ onSuccess: invalidateFlows })
  const resetMutation = useResetFlowMutation({ onSuccess: invalidateFlows })
  const deleteMutation = useDeleteFlowMutation({ onSuccess: invalidateFlows })
  const generateMutation = useGenerateFlowMutation()

  const [urlState, setUrlState] = useUrlState(WORKFLOW_TAB_DEFAULTS)
  const activeTab: WorkflowListTab =
    urlState.tab === "system" || urlState.tab === "templates"
      ? urlState.tab
      : "custom"

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
        title: t("workflows.toggleFailed"),
        description:
          err instanceof Error ? err.message : t("workflows.unknownError"),
        type: "error",
      })
    }
  }

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    const prompt = aiPrompt.trim()
    if (!prompt || !spaceId) return
    try {
      const draftFlow = await generateMutation.mutateAsync({
        prompt,
      })
      navigate(`/space/${spaceId}/workflows/new`, {
        state: { draftFlow },
      })
    } catch (err) {
      toast.add({
        title: t("workflows.generateFailed"),
        description:
          err instanceof Error ? err.message : t("workflows.unknownError"),
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
      name: `${flow.name} ${t("workflows.copySuffix")}`,
      triggers: (flow.triggers ?? []).map((trig) => ({
        ...trig,
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
        title: t("workflows.resetDoneTitle"),
        description: t("workflows.resetDoneDescription", {
          name: resetTarget.name ?? "",
        }),
        type: "success",
      })
      setResetTarget(null)
    } catch (err) {
      toast.add({
        title: t("workflows.resetFailed"),
        description:
          err instanceof Error ? err.message : t("workflows.unknownError"),
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
        title: t("workflows.deletedTitle"),
        description: t("workflows.deletedDescription", {
          name: deleteTarget.name ?? "",
        }),
        type: "success",
      })
      setDeleteTarget(null)
    } catch (err) {
      toast.add({
        title: t("workflows.deleteFailed"),
        description:
          err instanceof Error ? err.message : t("workflows.unknownError"),
        type: "error",
      })
    }
  }

  const renderFlowCard = (flow: Flow) => {
    const total7d = Number(flow.stats?.totalRuns7d ?? 0)
    const completed7d = Number(flow.stats?.completedRuns7d ?? 0)
    const failed7d = Number(flow.stats?.failedRuns7d ?? 0)
    const entityId = flow.id ?? flow.name

    return (
      <Card
        key={flow.id ?? flow.name}
        className="flex flex-col justify-between rounded-xl border-border/70 bg-card shadow-2xs"
      >
        <CardHeader className="space-y-2 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="truncate text-[15px] font-semibold">
                  {flow.name}
                </CardTitle>
                {flow.isSystem && (
                  <Badge variant="info" className="shrink-0">
                    <ShieldCheck className="size-3" />
                    {t("workflows.builtIn")}
                  </Badge>
                )}
              </div>
              <CardDescription className="line-clamp-2 text-xs">
                {flow.description || t("workflows.noDescription")}
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <CopilotAttachButton
                item={{
                  key: buildCopilotEntityKey("workflow", entityId),
                  kind: "workflow",
                  id: entityId,
                  label: flow.name,
                  summary: {
                    isSystem: Boolean(flow.isSystem),
                    isEnabled: Boolean(flow.isEnabled),
                    stepCount: flow.steps?.length ?? 0,
                  },
                }}
              />
              <Switch
                checked={flow.isEnabled}
                onCheckedChange={(checked) =>
                  handleToggleEnabled(flow, Boolean(checked))
                }
                aria-label={t("workflows.toggleAria", {
                  name: flow.name ?? "",
                })}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pb-3">
          {/* Mini Visual Pipeline Preview */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 text-[11px] font-medium text-success">
              <Zap className="size-2.5" />
              {getLocalizedEnumLabel(
                "workflow",
                "triggerType",
                flow.triggers?.[0]?.type || "manual",
                language
              )}
            </span>
            {(flow.steps ?? []).slice(0, 4).map((step, sIdx) => {
              const vTheme = getStepVisualTheme(step.type)
              return (
                <div
                  key={`${step.id}-${sIdx}`}
                  className="flex items-center gap-1"
                >
                  <ArrowRight className="size-3 text-muted-foreground/50" />
                  <span
                    className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${vTheme.badgeClass}`}
                    title={step.name || step.id}
                  >
                    <StepIcon type={step.type} className="size-2.5" />
                    <span className="max-w-[84px] truncate">
                      {step.name || step.id}
                    </span>
                  </span>
                </div>
              )
            })}
            {(flow.steps?.length ?? 0) > 4 && (
              <span className="text-[11px] font-medium text-muted-foreground">
                {t("workflows.moreSteps", {
                  count: (flow.steps?.length ?? 0) - 4,
                })}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums">
              {t(
                (flow.triggers?.length ?? 0) === 1
                  ? "workflows.triggerCountOne"
                  : "workflows.triggerCountOther",
                { count: flow.triggers?.length ?? 0 }
              )}
            </span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums">
              {t(
                (flow.steps?.length ?? 0) === 1
                  ? "workflows.stepCountOne"
                  : "workflows.stepCountOther",
                { count: flow.steps?.length ?? 0 }
              )}
            </span>
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] tabular-nums">
              v{flow.version ?? 1}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
            <div className="flex items-center gap-3 text-muted-foreground tabular-nums">
              <span>
                <strong className="font-semibold text-foreground">
                  {total7d}
                </strong>{" "}
                {t("workflows.runs7d")}
              </span>
              {completed7d > 0 && (
                <span className="text-success">
                  {completed7d} {t("workflows.runsOk")}
                </span>
              )}
              {failed7d > 0 && (
                <span className="text-destructive">
                  {failed7d} {t("workflows.runsFailed")}
                </span>
              )}
            </div>
            <RunSparkline
              counts={flow.stats?.dailyCounts7d}
              activityAria={t("workflows.sparklineAria")}
              runTitle={(n) => t("workflows.sparklineTitle", { count: n })}
            />
          </div>
        </CardContent>

        <CardFooter className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
          <div className="flex items-center gap-1.5">
            {spaceId && flow.id && (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link to={`/space/${spaceId}/workflows/${flow.id}`} />}
                className="h-8 gap-1.5 rounded-lg text-xs"
              >
                <Pencil className="size-3.5" />
                {t("common.edit")}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDuplicate(flow)}
              className="h-8 gap-1.5 rounded-lg text-xs"
              title={t("workflows.duplicateTitle")}
            >
              <Copy className="size-3.5" />
              {t("workflows.duplicate")}
            </Button>
          </div>

          {flow.isSystem ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setResetTarget(flow)}
              className="h-8 gap-1.5 rounded-lg text-xs text-muted-foreground"
              title={t("workflows.resetButtonTitle")}
            >
              <RotateCcw className="size-3.5" />
              {t("workflows.reset")}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTarget(flow)}
              className="h-8 gap-1.5 rounded-lg text-xs text-muted-foreground hover:text-destructive"
              title={t("workflows.deleteButtonTitle")}
            >
              <Trash2 className="size-3.5" />
              {t("common.delete")}
            </Button>
          )}
        </CardFooter>
      </Card>
    )
  }

  return (
    <DocumentPage
      title={t("workflows.title")}
      description={t("workflows.description")}
      icon={Workflow}
      maxWidth="xl"
      actions={
        <div className="flex items-center gap-2">
          {spaceId && (
            <>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link to={`/space/${spaceId}/workflows/runs`} />}
                className="gap-1.5 rounded-lg text-xs"
              >
                <History className="size-3.5" />
                {t("workflows.runHistory")}
              </Button>
              <Button
                size="sm"
                nativeButton={false}
                render={<Link to={`/space/${spaceId}/workflows/new`} />}
                className="gap-1.5 rounded-lg text-xs"
              >
                <Plus className="size-3.5" />
                {t("workflows.newWorkflow")}
              </Button>
            </>
          )}
        </div>
      }
    >
      {/* Build with AI Prompt Bar */}
      <form
        onSubmit={handleGenerate}
        className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs sm:flex-row sm:items-center"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-secondary/12 text-brand-secondary">
            <Sparkles className="size-4" />
          </div>
          <div className="sm:hidden">
            <p className="text-xs font-semibold text-foreground">
              {t("workflows.buildWithAI")}
            </p>
          </div>
        </div>
        <Input
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          placeholder={t("workflows.aiPlaceholder")}
          aria-label={t("workflows.aiAriaLabel")}
          className="h-9 flex-1 rounded-lg bg-control text-xs"
        />
        <Button
          type="submit"
          size="sm"
          disabled={generateMutation.isPending || !aiPrompt.trim()}
          className="h-9 gap-1.5 rounded-lg px-4 text-xs font-medium"
        >
          {generateMutation.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {t("workflows.buildWithAI")}
        </Button>
      </form>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={(val) =>
            setUrlState({
              tab: val === "system" || val === "templates" ? val : "custom",
            })
          }
          className="gap-5"
        >
          <TabsList variant="line" className="w-full justify-start">
            <TabsTrigger value="custom" className="flex-none">
              <span>{t("workflows.tabCustom")}</span>
              <Badge variant="neutral" className="tabular-nums">
                {customFlows.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="system" className="flex-none">
              <span>{t("workflows.tabSystem")}</span>
              <Badge variant="neutral" className="tabular-nums">
                {systemFlows.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex-none">
              <span>{t("workflows.tabTemplates")}</span>
              <Badge variant="neutral" className="tabular-nums">
                {WORKFLOW_TEMPLATES.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="custom">
            {customFlows.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-card/40 px-6 py-12 text-center">
                <div className="flex size-10 items-center justify-center rounded-xl border border-border/60 bg-muted/50 text-muted-foreground">
                  <Workflow className="size-5" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-foreground">
                  {t("workflows.emptyCustomTitle")}
                </h3>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  {t("workflows.emptyCustomDescription")}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setUrlState({ tab: "templates" })}
                    className="gap-1.5 rounded-lg text-xs"
                  >
                    <LayoutTemplate className="size-3.5" />
                    {t("workflows.browseTemplates")}
                  </Button>
                  {spaceId && (
                    <Button
                      size="sm"
                      nativeButton={false}
                      render={<Link to={`/space/${spaceId}/workflows/new`} />}
                      className="gap-1.5 rounded-lg text-xs"
                    >
                      <Plus className="size-3.5" />
                      {t("workflows.newBlankWorkflow")}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {customFlows.map(renderFlowCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="system">
            {systemFlows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 p-10 text-center text-xs text-muted-foreground">
                {t("workflows.emptySystem")}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {systemFlows.map(renderFlowCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="templates">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {templates.map((template) => {
                const previewSteps = flattenPipelinePreview(template.flow.steps)
                const triggerType = template.flow.triggers[0]?.type || "manual"
                return (
                  <Card
                    key={template.id}
                    className="flex flex-col justify-between rounded-xl border-border/70 bg-card shadow-2xs"
                  >
                    <CardHeader className="space-y-2 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/50 text-primary">
                            <TemplateIcon icon={template.icon} />
                          </div>
                          <div className="min-w-0 space-y-1">
                            <CardTitle className="truncate text-[15px] font-semibold">
                              {template.name}
                            </CardTitle>
                            <Badge variant="neutral">{template.category}</Badge>
                          </div>
                        </div>
                        {spaceId && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              navigate(`/space/${spaceId}/workflows/new`, {
                                state: {
                                  draftFlow:
                                    instantiateWorkflowTemplate(template),
                                },
                              })
                            }
                            className="h-8 shrink-0 gap-1 rounded-lg text-xs"
                          >
                            {t("workflows.useTemplate")}
                          </Button>
                        )}
                      </div>
                      <CardDescription className="text-xs">
                        {template.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2">
                        <span className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 text-[11px] font-medium text-success">
                          <Zap className="size-2.5" />
                          {getLocalizedEnumLabel(
                            "workflow",
                            "triggerType",
                            triggerType,
                            language
                          )}
                        </span>
                        {previewSteps.slice(0, 4).map((step, idx) => {
                          const vTheme = getStepVisualTheme(step.type)
                          return (
                            <div
                              key={`${step.id}-${idx}`}
                              className="flex items-center gap-1"
                            >
                              <ArrowRight className="size-3 text-muted-foreground/50" />
                              <span
                                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${vTheme.badgeClass}`}
                                title={step.name || step.id}
                              >
                                <StepIcon
                                  type={step.type}
                                  className="size-2.5"
                                />
                                <span className="max-w-[110px] truncate">
                                  {step.name || step.id}
                                </span>
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* System Flow Reset Confirmation */}
      <AlertDialog
        open={Boolean(resetTarget)}
        onOpenChange={(open) => !open && setResetTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workflows.resetDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workflows.resetDialog.descriptionStart")}{" "}
              <strong>{resetTarget?.name}</strong>{" "}
              {t("workflows.resetDialog.descriptionEnd")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReset}>
              {t("workflows.resetDialog.confirm")}
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
            <AlertDialogTitle>
              {t("workflows.deleteDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workflows.deleteDialog.descriptionStart")}{" "}
              <strong>{deleteTarget?.name}</strong>{" "}
              {t("workflows.deleteDialog.descriptionEnd")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              {t("workflows.deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DocumentPage>
  )
}
