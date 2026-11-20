import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import {
  buildCopilotEntityKey,
  collectWorkflowStepIds,
  createDefaultWorkflowStep,
  createEmptyWorkflowDraft,
} from "@saturn/core"
import { useI18n } from "@saturn/hooks"
import { useRegisterCopilotView } from "@saturn/hooks/ai"
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
import { StudioCanvasPage } from "@/components/ui/page-shells"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Kbd } from "@/components/ui/kbd"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { normalizeFlowSnapshot } from "./workflow-templates"
import { toast } from "@/components/ui/toast"
import {
  ArrowLeft,
  Save,
  FlaskConical,
  RotateCcw,
  History,
  Loader2,
  Settings2,
  X,
} from "lucide-react"

export function WorkflowEditorView() {
  const { flowId } = useParams<{ flowId: string }>()
  const isNew = !flowId || flowId === "new"
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { spaceId } = useActiveSpaceContext()
  const { t } = useI18n()

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
  const [savedBaselineOverride, setSavedBaselineOverride] =
    useState<Flow | null>(null)
  const [fallbackDraft] = useState<Flow>(() => createEmptyWorkflowDraft())

  const baselineFlow = !isNew
    ? (savedBaselineOverride ?? loadedFlow ?? null)
    : null

  const draft =
    draftOverride ??
    (!isNew
      ? (savedBaselineOverride ?? loadedFlow ?? fallbackDraft)
      : fallbackDraft)

  const setDraft = useCallback((next: Flow) => {
    setDraftOverride(next)
  }, [])

  const isDirty = useMemo(() => {
    if (isNew) {
      if (draftFromState) {
        return savedBaselineOverride === null
      }
      return (
        normalizeFlowSnapshot(draft) !== normalizeFlowSnapshot(fallbackDraft)
      )
    }
    if (!baselineFlow) return false
    if (draftOverride === null) return false
    return (
      normalizeFlowSnapshot(draftOverride) !==
      normalizeFlowSnapshot(baselineFlow)
    )
  }, [
    isNew,
    draftFromState,
    savedBaselineOverride,
    draft,
    fallbackDraft,
    baselineFlow,
    draftOverride,
  ])

  useRegisterCopilotView({
    viewId: "workflows.editor",
    title: t("workflows.editor.copilotTitle"),
    activeEntity: {
      key: buildCopilotEntityKey("workflow", draft.id || "new"),
      kind: "workflow",
      id: draft.id || "new",
      label: draft.name || t("workflows.editor.untitled"),
      summary: {
        isEnabled: Boolean(draft.isEnabled),
        stepCount: draft.steps?.length ?? 0,
        triggerCount: draft.triggers?.length ?? 0,
      },
    },
    suggestions: [
      t("workflows.editor.suggestions.edgeCases"),
      t("workflows.editor.suggestions.explainSteps"),
      t("workflows.editor.suggestions.errorHandling"),
    ],
  })

  const [selectedNode, setSelectedNode] = useState<SelectedCanvasNode>({
    kind: "flow",
  })
  const [mobilePane, setMobilePane] = useState<"canvas" | "inspector">("canvas")
  const [testOpen, setTestOpen] = useState(false)
  const [lastRun, setLastRun] = useState<FlowRun | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [pendingNavPath, setPendingNavPath] = useState<string | null>(null)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  const scopeKey = `${spaceId}:${flowId ?? "new"}`
  const [prevScopeKey, setPrevScopeKey] = useState(scopeKey)
  if (prevScopeKey !== scopeKey) {
    setPrevScopeKey(scopeKey)
    setDraftOverride(draftFromState ? draftFromState : null)
    setSavedBaselineOverride(null)
    setSelectedNode({ kind: "flow" })
    setMobilePane("canvas")
    setTestOpen(false)
    setLastRun(null)
    setValidationError(null)
    setPendingNavPath(null)
    setResetDialogOpen(false)
  }

  const [prevLoadedFlow, setPrevLoadedFlow] = useState(loadedFlow)
  if (prevLoadedFlow !== loadedFlow) {
    setPrevLoadedFlow(loadedFlow)
    setSavedBaselineOverride(null)
  }

  const invalidateWorkflows = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ["/api/v1/platform/workflows"],
    })
    if (flowId && !isNew) {
      await queryClient.invalidateQueries({
        queryKey: [`/api/v1/platform/workflows/${flowId}`],
      })
    }
  }, [queryClient, flowId, isNew])

  const createMutation = useCreateFlowMutation({
    onSuccess: invalidateWorkflows,
  })
  const updateMutation = useUpdateFlowMutation({
    onSuccess: invalidateWorkflows,
  })
  const resetMutation = useResetFlowMutation({
    onSuccess: async (resetFlow) => {
      setSavedBaselineOverride(resetFlow)
      setDraftOverride(null)
      setSelectedNode({ kind: "flow" })
      setResetDialogOpen(false)
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

  const isSaving = createMutation.isPending || updateMutation.isPending

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (isSaving) return false
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
        `${firstIssue?.path.join(".") || "flow"}: ${firstIssue?.message || t("workflows.editor.invalidWorkflow")}`
      )
      return false
    }

    try {
      if (isNew) {
        const created = await createMutation.mutateAsync({
          flow: draft,
        })
        setSavedBaselineOverride(created)
        setDraftOverride(null)
        toast.add({
          title: t("workflows.editor.createdTitle"),
          description: t("workflows.editor.createdDescription", {
            name: created.name ?? "",
          }),
          type: "success",
        })
        if (spaceId && created.id) {
          navigate(`/space/${spaceId}/workflows/${created.id}`, {
            replace: true,
          })
        }
        return true
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
        setSavedBaselineOverride(updated)
        setDraftOverride(null)
        toast.add({
          title: t("workflows.editor.savedTitle"),
          description: t("workflows.editor.savedDescription", {
            name: updated.name ?? "",
            version: updated.version ?? 1,
          }),
          type: "success",
        })
        return true
      }
      return false
    } catch (err) {
      toast.add({
        title: t("workflows.editor.saveFailed"),
        description:
          err instanceof Error ? err.message : t("workflows.unknownError"),
        type: "error",
      })
      return false
    }
  }, [
    isSaving,
    draft,
    isNew,
    createMutation,
    spaceId,
    navigate,
    updateMutation,
    t,
  ])

  const handleSaveRef = useRef(handleSave)
  useEffect(() => {
    handleSaveRef.current = handleSave
  }, [handleSave])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "s"
      ) {
        e.preventDefault()
        void handleSaveRef.current()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    if (!isDirty) return
    const onDocumentClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return
      }
      const target = e.target
      if (!(target instanceof Element)) return
      const anchor = target.closest("a[href]")
      if (!anchor) return
      if (
        anchor.getAttribute("target") === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return
      }
      const rawHref = anchor.getAttribute("href")
      if (!rawHref || rawHref.startsWith("#")) return
      let url: URL
      try {
        url = new URL(
          anchor instanceof HTMLAnchorElement ? anchor.href : rawHref,
          window.location.href
        )
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      const nextPath = `${url.pathname}${url.search}${url.hash}`
      const currentPath = `${location.pathname}${location.search}${location.hash}`
      if (nextPath === currentPath) return
      e.preventDefault()
      e.stopPropagation()
      setPendingNavPath(nextPath)
    }
    document.addEventListener("click", onDocumentClick, true)
    return () => document.removeEventListener("click", onDocumentClick, true)
  }, [isDirty, location.pathname, location.search, location.hash])

  const requestNavigation = useCallback(
    (targetPath: string) => {
      if (isDirty) {
        setPendingNavPath(targetPath)
        return
      }
      navigate(targetPath)
    },
    [isDirty, navigate]
  )

  const handleDiscardAndLeave = () => {
    const target = pendingNavPath
    setPendingNavPath(null)
    if (target) {
      navigate(target)
    }
  }

  const handleSaveAndLeave = async () => {
    const target = pendingNavPath
    const ok = await handleSave()
    if (ok && target) {
      setPendingNavPath(null)
      navigate(target)
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
        title: t("workflows.editor.resetCompleteTitle"),
        description: t("workflows.editor.resetCompleteDescription"),
        type: "success",
      })
    } catch (err) {
      toast.add({
        title: t("workflows.resetFailed"),
        description:
          err instanceof Error ? err.message : t("workflows.unknownError"),
        type: "error",
      })
    }
  }

  const handleAddTrigger = (type: string) => {
    const newTrig: Flow_Trigger = {
      name: t("workflows.editor.triggerName", {
        type: type.charAt(0).toUpperCase() + type.slice(1),
      }),
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
      name: isRoot
        ? `${step.name || step.id} ${t("workflows.editor.copySuffix")}`
        : step.name,
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

  return (
    <>
      <StudioCanvasPage
        title={
          isNew
            ? t("workflows.newWorkflow")
            : draft.name || t("workflows.editor.copilotTitle")
        }
        mobilePane={mobilePane}
        onMobilePaneChange={setMobilePane}
        leading={
          <div className="flex min-w-0 items-center gap-2">
            {spaceId && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("workflows.editor.backAria")}
                  onClick={() =>
                    requestNavigation(`/space/${spaceId}/workflows`)
                  }
                  className="h-7 shrink-0 gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-3.5" />
                  <span className="hidden sm:inline">{t("nav.workflows")}</span>
                </Button>
                <span
                  aria-hidden="true"
                  className="h-4 w-px shrink-0 bg-border"
                />
              </>
            )}
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={t("workflows.editor.untitled")}
              aria-label={t("workflows.editor.nameAria")}
              className="h-7 w-full max-w-[260px] min-w-[110px] truncate rounded-md border border-transparent bg-transparent px-2 text-sm font-semibold text-foreground transition-colors outline-none hover:border-border hover:bg-control focus:border-ring focus:bg-control focus:ring-2 focus:ring-ring/40"
            />
            {draft.isSystem && (
              <Badge variant="info" className="hidden shrink-0 sm:inline-flex">
                {t("workflows.tabSystem")}
              </Badge>
            )}
          </div>
        }
        status={
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <Switch
                size="sm"
                aria-label={t("workflows.editor.activeAria")}
                checked={Boolean(draft.isEnabled)}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, isEnabled: Boolean(checked) })
                }
              />
              <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
                {draft.isEnabled
                  ? t("common.active")
                  : t("workflows.editor.paused")}
              </span>
            </div>
            {isDirty ? (
              <Badge
                variant="warning"
                dot
                data-testid="workflow-unsaved-badge"
                className="shrink-0"
              >
                {t("common.unsaved")}
              </Badge>
            ) : (
              !isNew && (
                <span className="hidden text-xs whitespace-nowrap text-muted-foreground md:inline">
                  {t("workflows.editor.savedVersion", {
                    version: draft.version ?? 1,
                  })}
                </span>
              )
            )}
          </div>
        }
        actions={
          <>
            <Button
              type="button"
              variant={selectedNode.kind === "flow" ? "secondary" : "outline"}
              size="sm"
              onClick={() => {
                setSelectedNode({ kind: "flow" })
                setMobilePane("inspector")
              }}
              className="h-8 gap-1.5 rounded-lg text-xs"
            >
              <Settings2 className="size-3.5" />
              <span className="hidden xl:inline">
                {t("workflows.editor.flowSettings")}
              </span>
            </Button>
            {!isNew && spaceId && draft.id && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  requestNavigation(
                    `/space/${spaceId}/workflows/runs?flowId=${draft.id}`
                  )
                }
                className="h-8 gap-1.5 rounded-lg text-xs"
              >
                <History className="size-3.5" />
                <span className="hidden lg:inline">
                  {t("workflows.editor.runs")}
                </span>
              </Button>
            )}
            {draft.isSystem && draft.id && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setResetDialogOpen(true)}
                disabled={resetMutation.isPending}
                className="h-8 gap-1.5 rounded-lg text-xs"
              >
                <RotateCcw className="size-3.5" />
                <span className="hidden xl:inline">
                  {t("workflows.editor.resetDefault")}
                </span>
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTestOpen(true)}
              className="h-8 gap-1.5 rounded-lg text-xs"
            >
              <FlaskConical className="size-3.5" />
              <span className="hidden md:inline">
                {t("workflows.editor.testRun")}
              </span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSave()}
              disabled={isSaving}
              aria-label={t("workflows.editor.saveAria")}
              className="h-8 gap-1.5 rounded-lg text-xs"
            >
              {isSaving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              <span>{t("common.save")}</span>
              <Kbd className="hidden bg-primary-foreground/15 text-primary-foreground sm:inline-flex">
                ⌘S
              </Kbd>
            </Button>
          </>
        }
        banner={
          validationError && (
            <div
              role="alert"
              className="flex shrink-0 items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive"
            >
              <span className="min-w-0 truncate">{validationError}</span>
              <button
                type="button"
                onClick={() => setValidationError(null)}
                aria-label={t("workflows.editor.dismissValidation")}
                className="shrink-0 cursor-pointer rounded-md p-0.5 text-destructive/80 hover:bg-destructive/15 hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )
        }
        inspector={
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
        }
      >
        <FlowCanvas
          flowName={draft.name}
          triggers={draft.triggers ?? []}
          steps={draft.steps ?? []}
          stepDescriptors={stepDescriptors}
          selectedNode={selectedNode}
          lastRun={lastRun}
          onSelectNode={(node) => {
            setSelectedNode(node)
            setMobilePane("inspector")
          }}
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
      </StudioCanvasPage>

      <TestRunDrawer
        open={testOpen}
        onOpenChange={setTestOpen}
        flow={draft}
        onRunComplete={setLastRun}
      />

      {/* Unsaved Changes Navigation Guard */}
      <AlertDialog
        open={pendingNavPath !== null}
        onOpenChange={(open) => {
          if (!open) setPendingNavPath(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workflows.editor.guard.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workflows.editor.guard.descriptionStart")}{" "}
              <strong>
                {draft.name || t("workflows.editor.guard.thisWorkflow")}
              </strong>
              {t("workflows.editor.guard.descriptionEnd")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("workflows.editor.guard.keepEditing")}
            </AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={handleDiscardAndLeave}
            >
              {t("workflows.editor.guard.discard")}
            </Button>
            <Button
              type="button"
              onClick={() => void handleSaveAndLeave()}
              disabled={isSaving}
            >
              {isSaving && <Loader2 className="size-3.5 animate-spin" />}
              {t("workflows.editor.guard.saveAndLeave")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* System Flow Reset Confirmation */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workflows.resetDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workflows.resetDialog.descriptionStart")}{" "}
              <strong>{draft.name}</strong>{" "}
              {t("workflows.resetDialog.descriptionEnd")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleResetSystemFlow()}
              disabled={resetMutation.isPending}
            >
              {t("workflows.resetDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
