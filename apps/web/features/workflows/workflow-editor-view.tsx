import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import {
  collectWorkflowStepIds,
  createDefaultWorkflowStep,
  createEmptyWorkflowDraft,
} from "@saturn/core"
import { FlowSchema } from "@saturn/schemas"
import {
  useGetFlowQuery,
  useGetCatalogQuery,
  useCreateFlowMutation,
  useUpdateFlowMutation,
  useResetFlowMutation,
  type Flow,
  type FlowRun,
  type Flow_StepNode,
  type Flow_Trigger,
} from "@saturn/api/gen/saturn/platform/workflow/v1/workflow"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { PageLayout } from "@/components/ui/page-layout"
import { Button } from "@/components/ui/button"
import {
  FlowCanvas,
  type InsertTarget,
  type SelectedCanvasNode,
} from "./components/flow-canvas"
import { NodeInspectorPanel } from "./components/node-inspector-panel"
import {
  findStepById,
  insertStepInTree,
  moveStepById,
  removeStepById,
  updateStepById,
} from "./components/step-utils"
import { TestRunDrawer } from "./components/test-run-drawer"
import { toast } from "@/components/ui/toast"
import {
  ArrowLeft,
  Save,
  FlaskConical,
  RotateCcw,
  History,
  Loader2,
  Workflow,
  Settings2,
} from "lucide-react"

export function WorkflowEditorView() {
  const { flowId } = useParams<{ flowId: string }>()
  const isNew = !flowId || flowId === "new"
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { spaceId } = useActiveSpaceContext()

  const draftFromState = (location.state as { draftFlow?: Flow } | null)
    ?.draftFlow

  const { data: loadedFlow, isLoading: flowLoading } = useGetFlowQuery(
    { id: flowId ?? "" },
    { enabled: !isNew }
  )
  const { data: catalog } = useGetCatalogQuery({})

  const [draftOverride, setDraftOverride] = useState<Flow | null>(() =>
    draftFromState ? draftFromState : null
  )
  const [fallbackDraft] = useState<Flow>(() => createEmptyWorkflowDraft())
  const draft =
    draftOverride ?? (!isNew && loadedFlow ? loadedFlow : fallbackDraft)
  const setDraft = (next: Flow) => setDraftOverride(next)

  const [selectedNode, setSelectedNode] = useState<SelectedCanvasNode>({
    kind: "flow",
  })
  const [testOpen, setTestOpen] = useState(false)
  const [lastRun, setLastRun] = useState<FlowRun | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const scopeKey = `${spaceId}:${flowId ?? "new"}`
  const prevScopeKeyRef = useRef(scopeKey)
  useEffect(() => {
    if (prevScopeKeyRef.current !== scopeKey) {
      prevScopeKeyRef.current = scopeKey
      setDraftOverride(draftFromState ? draftFromState : null)
      setSelectedNode({ kind: "flow" })
      setTestOpen(false)
      setLastRun(null)
      setValidationError(null)
    }
  }, [scopeKey, draftFromState])

  const invalidateWorkflows = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["/api/v1/platform/workflows"],
    })
    if (flowId && !isNew) {
      await queryClient.invalidateQueries({
        queryKey: [`/api/v1/platform/workflows/${flowId}`],
      })
    }
  }

  const createMutation = useCreateFlowMutation({
    onSuccess: invalidateWorkflows,
  })
  const updateMutation = useUpdateFlowMutation({
    onSuccess: invalidateWorkflows,
  })
  const resetMutation = useResetFlowMutation({
    onSuccess: async (resetFlow) => {
      setDraftOverride(resetFlow)
      setSelectedNode({ kind: "flow" })
      await invalidateWorkflows()
    },
  })

  const topics = useMemo(
    () => catalog?.triggerTopics ?? [],
    [catalog?.triggerTopics]
  )
  const stepDescriptors = catalog?.steps ?? []
  const loaderDescriptors = catalog?.loaders ?? []

  const firstEventTriggerTopic = useMemo(() => {
    const evTrig = (draft.triggers ?? []).find((t) => t.type === "event")
    if (!evTrig?.config?.topic) return undefined
    return topics.find((t) => t.topic === evTrig.config?.topic)
  }, [draft.triggers, topics])

  const handleSave = async () => {
    setValidationError(null)
    const parsed = FlowSchema.safeParse({
      name: draft.name,
      description: draft.description ?? "",
      isEnabled: draft.isEnabled,
      config: draft.config,
      inputSchema: draft.inputSchema,
      triggers: draft.triggers ?? [],
      steps: draft.steps ?? [],
    })
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      setValidationError(
        `${firstIssue?.path.join(".") || "flow"}: ${firstIssue?.message || "Invalid workflow"}`
      )
      return
    }

    try {
      if (isNew) {
        const created = await createMutation.mutateAsync({
          flow: draft,
        })
        toast.add({
          title: "Workflow Created",
          description: `${created.name} saved successfully.`,
          type: "success",
        })
        if (spaceId && created.id) {
          navigate(`/space/${spaceId}/workflows/${created.id}`, {
            replace: true,
          })
        }
      } else if (draft.id) {
        const updated = await updateMutation.mutateAsync({
          id: draft.id,
          req: {
            id: draft.id,
            flow: draft,
            updateMask: {
              paths: [
                "name",
                "description",
                "config",
                "input_schema",
                "triggers",
                "steps",
                "is_enabled",
              ],
            },
          },
        })
        setDraft(updated)
        toast.add({
          title: "Workflow Saved",
          description: `${updated.name} (v${updated.version ?? 1}) updated.`,
          type: "success",
        })
      }
    } catch (err) {
      toast.add({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        type: "error",
      })
    }
  }

  const handleResetSystemFlow = async () => {
    if (!draft.id || !draft.isSystem) return
    try {
      await resetMutation.mutateAsync({
        id: draft.id,
        req: { id: draft.id },
      })
      toast.add({
        title: "Reset Complete",
        description: "System workflow restored to factory defaults.",
        type: "success",
      })
    } catch (err) {
      toast.add({
        title: "Reset failed",
        description: err instanceof Error ? err.message : "Unknown error",
        type: "error",
      })
    }
  }

  const handleAddTrigger = (type: string) => {
    const newTrig: Flow_Trigger = {
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} Trigger`,
      type,
      config:
        type === "event"
          ? { topic: topics[0]?.topic ?? "" }
          : type === "schedule"
            ? { cron: "0 9 * * *" }
            : {},
      isEnabled: true,
    }
    const nextTriggers = [...(draft.triggers ?? []), newTrig]
    setDraft({ ...draft, triggers: nextTriggers })
    setSelectedNode({ kind: "trigger", index: nextTriggers.length - 1 })
  }

  const handleInsertStep = (type: string, target: InsertTarget) => {
    const existingIds = collectWorkflowStepIds(draft.steps ?? [])
    const newStep = createDefaultWorkflowStep(type, existingIds)
    setDraft({
      ...draft,
      steps: insertStepInTree(draft.steps ?? [], newStep, target),
    })
    setSelectedNode({ kind: "step", stepId: newStep.id })
  }

  const cloneStepTree = (
    step: Flow_StepNode,
    usedIds: Set<string>,
    isRoot = false
  ): Flow_StepNode => {
    const fresh = createDefaultWorkflowStep(
      step.type ?? "llm.generate",
      usedIds
    )
    if (fresh.id) usedIds.add(fresh.id)
    const clonedInputs = JSON.parse(
      JSON.stringify(step.inputs ?? {})
    ) as Record<string, unknown>
    const clonedSources = JSON.parse(
      JSON.stringify(step.sources ?? {})
    ) as Flow_StepNode["sources"]

    return {
      ...fresh,
      name: isRoot ? `${step.name || step.id} Copy` : step.name,
      onError: step.onError,
      model: step.model ? { ...step.model } : undefined,
      inputs: clonedInputs,
      sources: clonedSources,
      cases: (step.cases ?? []).map((sc) => ({
        ...sc,
        steps: (sc.steps ?? []).map((sub) => cloneStepTree(sub, usedIds)),
      })),
      default: (step.default ?? []).map((sub) => cloneStepTree(sub, usedIds)),
      steps: (step.steps ?? []).map((sub) => cloneStepTree(sub, usedIds)),
    }
  }

  const handleDuplicateStep = (stepId: string) => {
    const orig = findStepById(draft.steps ?? [], stepId)
    if (!orig) return
    const usedIds = new Set(collectWorkflowStepIds(draft.steps ?? []))
    const cloned = cloneStepTree(orig, usedIds, true)

    const rootIdx = (draft.steps ?? []).findIndex((s) => s.id === stepId)
    const target: InsertTarget =
      rootIdx !== -1
        ? { kind: "root", index: rootIdx + 1 }
        : { kind: "root", index: (draft.steps ?? []).length }
    setDraft({
      ...draft,
      steps: insertStepInTree(draft.steps ?? [], cloned, target),
    })
    setSelectedNode({ kind: "step", stepId: cloned.id })
  }

  const handleAddSwitchCase = (switchId: string) => {
    const sw = findStepById(draft.steps ?? [], switchId)
    if (!sw) return
    const nextSw: Flow_StepNode = {
      ...sw,
      cases: [
        ...(sw.cases ?? []),
        {
          name: `branch_${(sw.cases?.length ?? 0) + 1}`,
          condition: "true",
          steps: [],
        },
      ],
    }
    setDraft({
      ...draft,
      steps: updateStepById(draft.steps ?? [], switchId, nextSw),
    })
  }

  if (!isNew && flowLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <PageLayout
      title={isNew ? "New Workflow" : draft.name || "Workflow Editor"}
      description={
        draft.isSystem
          ? `System blueprint (${draft.systemKey}) • v${draft.version ?? 1}`
          : "Visual workflow canvas — click any trigger or step node to inspect and configure."
      }
      icon={Workflow}
      className="max-w-none"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {spaceId && (
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link to={`/space/${spaceId}/workflows`} />}
              className="gap-1.5 rounded-xl text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
          )}
          <Button
            type="button"
            variant={selectedNode.kind === "flow" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setSelectedNode({ kind: "flow" })}
            className="gap-1.5 rounded-xl text-xs"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Flow Settings
          </Button>
          {!isNew && spaceId && draft.id && (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <Link
                  to={`/space/${spaceId}/workflows/runs?flowId=${draft.id}`}
                />
              }
              className="gap-1.5 rounded-xl text-xs"
            >
              <History className="h-3.5 w-3.5" />
              Runs
            </Button>
          )}
          {draft.isSystem && draft.id && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetSystemFlow}
              disabled={resetMutation.isPending}
              className="gap-1.5 rounded-xl text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Default
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTestOpen(true)}
            className="gap-1.5 rounded-xl text-xs"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Test &amp; Run
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="gap-1.5 rounded-xl text-xs"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save Workflow
          </Button>
        </div>
      }
    >
      {validationError && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive">
          {validationError}
        </div>
      )}

      {/* Split Studio: Visual Dot-Grid Canvas + Right Inspector Panel */}
      <div className="grid grid-cols-1 gap-4 lg:h-[calc(100vh-12.5rem)] lg:min-h-[600px] lg:grid-cols-12">
        <div className="flex min-h-[480px] flex-col lg:col-span-7 xl:col-span-8">
          <FlowCanvas
            flowName={draft.name}
            triggers={draft.triggers ?? []}
            steps={draft.steps ?? []}
            stepDescriptors={stepDescriptors}
            selectedNode={selectedNode}
            lastRun={lastRun}
            onSelectNode={setSelectedNode}
            onAddTrigger={handleAddTrigger}
            onInsertStep={handleInsertStep}
            onMoveStep={(stepId, dir) =>
              setDraft({
                ...draft,
                steps: moveStepById(draft.steps ?? [], stepId, dir),
              })
            }
            onDuplicateStep={handleDuplicateStep}
            onRemoveStep={(stepId) => {
              setDraft({
                ...draft,
                steps: removeStepById(draft.steps ?? [], stepId),
              })
              if (
                selectedNode.kind === "step" &&
                selectedNode.stepId === stepId
              ) {
                setSelectedNode({ kind: "flow" })
              }
            }}
            onAddSwitchCase={handleAddSwitchCase}
          />
        </div>

        <div className="min-h-[480px] lg:col-span-5 lg:min-h-0 xl:col-span-4">
          <NodeInspectorPanel
            draft={draft}
            selectedNode={selectedNode}
            topics={topics}
            stepDescriptors={stepDescriptors}
            loaderDescriptors={loaderDescriptors}
            firstEventTriggerTopic={firstEventTriggerTopic}
            lastRun={lastRun}
            onSelectFlow={() => setSelectedNode({ kind: "flow" })}
            onUpdateFlow={setDraft}
            onUpdateTrigger={(idx, nextTrig) =>
              setDraft({
                ...draft,
                triggers: (draft.triggers ?? []).map((t, i) =>
                  i === idx ? nextTrig : t
                ),
              })
            }
            onRemoveTrigger={(idx) => {
              setDraft({
                ...draft,
                triggers: (draft.triggers ?? []).filter((_, i) => i !== idx),
              })
              setSelectedNode({ kind: "flow" })
            }}
            onUpdateStep={(nextStep, previousId) => {
              const targetId = previousId ?? nextStep.id
              setDraft({
                ...draft,
                steps: updateStepById(draft.steps ?? [], targetId, nextStep),
              })
              if (
                previousId &&
                previousId !== nextStep.id &&
                selectedNode.kind === "step" &&
                selectedNode.stepId === previousId
              ) {
                setSelectedNode({ kind: "step", stepId: nextStep.id })
              }
            }}
            onRemoveStep={(stepId) => {
              setDraft({
                ...draft,
                steps: removeStepById(draft.steps ?? [], stepId),
              })
              setSelectedNode({ kind: "flow" })
            }}
          />
        </div>
      </div>

      <TestRunDrawer
        open={testOpen}
        onOpenChange={setTestOpen}
        flow={draft}
        onRunComplete={setLastRun}
      />
    </PageLayout>
  )
}
