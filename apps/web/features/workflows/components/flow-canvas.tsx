import { useMemo, useState } from "react"
import { useI18n, useTimezone } from "@saturn/hooks"
import type {
  Catalog_Step,
  FlowRun,
  FlowRun_StepRun,
  Flow_StepNode,
  Flow_Trigger,
} from "@saturn/api/gen/saturn/platform/workflow/v1/workflow"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { StepIcon } from "./step-icon"
import { getLocalizedCronSummary } from "./cron-label"
import {
  getStepVisualTheme,
  STEP_CATEGORY_KEYS,
  summarizeStep,
} from "./step-utils"
import {
  Plus,
  Zap,
  Webhook,
  Clock,
  Play,
  Database,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  CheckCircle2,
  XCircle,
  Filter,
  Settings2,
  GitBranch,
  Repeat,
} from "lucide-react"

export type SelectedCanvasNode =
  | { kind: "flow" }
  | { kind: "trigger"; index: number }
  | { kind: "step"; stepId: string }

export type InsertTarget =
  | { kind: "root"; index: number }
  | { kind: "case"; switchId: string; caseIndex: number; index: number }
  | { kind: "default"; switchId: string; index: number }
  | { kind: "loop"; loopId: string; index: number }

interface FlowCanvasProps {
  flowName: string
  triggers: Flow_Trigger[]
  steps: Flow_StepNode[]
  stepDescriptors: Catalog_Step[]
  selectedNode: SelectedCanvasNode
  lastRun: FlowRun | null
  onSelectNode: (node: SelectedCanvasNode) => void
  onAddTrigger: (type: string) => void
  onInsertStep: (type: string, target: InsertTarget) => void
  onMoveStep: (stepId: string, dir: -1 | 1) => void
  onDuplicateStep: (stepId: string) => void
  onRemoveStep: (stepId: string) => void
  onAddSwitchCase: (switchId: string) => void
}

function StepInsertEdge({
  stepDescriptors,
  onInsert,
  label,
  showEndArrow = true,
}: {
  stepDescriptors: Catalog_Step[]
  onInsert: (type: string) => void
  label?: string
  showEndArrow?: boolean
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const fallbackStepOptions = useMemo<Catalog_Step[]>(
    () => [
      {
        type: "llm.generate",
        owner: "platform",
        category: "ai",
        displayName: t("workflows.step.llmGenerate"),
        description: t("workflows.step.llmGenerateDescription"),
      },
      {
        type: "filter",
        owner: "platform",
        category: "logic",
        displayName: t("workflows.step.filter"),
        description: t("workflows.step.filterDescription"),
      },
      {
        type: "switch",
        owner: "platform",
        category: "logic",
        displayName: t("workflows.step.switchBranch"),
        description: t("workflows.step.switchDescription"),
      },
      {
        type: "for_each",
        owner: "platform",
        category: "logic",
        displayName: t("workflows.step.forEachLoop"),
        description: t("workflows.step.forEachDescription"),
      },
      {
        type: "transform",
        owner: "platform",
        category: "flow",
        displayName: t("workflows.step.transform"),
        description: t("workflows.step.transformDescription"),
      },
      {
        type: "output",
        owner: "platform",
        category: "flow",
        displayName: t("workflows.step.returnOutput"),
        description: t("workflows.step.outputDescription"),
      },
    ],
    [t]
  )

  const options =
    stepDescriptors.length > 0 ? stepDescriptors : fallbackStepOptions
  const filtered = options.filter((d) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      (d.displayName ?? "").toLowerCase().includes(q) ||
      (d.type ?? "").toLowerCase().includes(q) ||
      (d.owner ?? "").toLowerCase().includes(q)
    )
  })

  return (
    <div className="flex flex-col items-center">
      <div className="h-4 w-0.5 bg-muted-foreground/50" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="group flex h-6 cursor-pointer items-center gap-1 rounded-full border border-muted-foreground/40 bg-card px-2 text-[11px] font-semibold text-foreground/80 shadow-2xs transition-colors hover:border-primary hover:text-primary"
              title={t("workflows.canvas.insertHere")}
              aria-label={label || t("workflows.canvas.insertStep")}
            />
          }
        >
          <Plus className="h-3.5 w-3.5" />
          {label && <span>{label}</span>}
        </PopoverTrigger>
        <PopoverContent className="w-72 rounded-2xl p-2" align="center">
          <div className="space-y-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("workflows.canvas.searchSteps")}
              className="h-8 rounded-lg text-xs"
            />
            <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {filtered.map((d) => {
                const type = d.type ?? ""
                const vTheme = getStepVisualTheme(type, d.owner)
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      onInsert(type)
                      setOpen(false)
                      setSearch("")
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-muted"
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${vTheme.badgeClass}`}
                    >
                      <StepIcon type={type} className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-foreground">
                        {d.displayName || type}
                      </div>
                      <div className="truncate font-mono text-[10px] text-muted-foreground">
                        {type}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <div className="h-3.5 w-0.5 bg-muted-foreground/50" />
      {showEndArrow && (
        <div
          aria-hidden="true"
          className="h-0 w-0 border-x-4 border-t-[5px] border-x-transparent border-t-muted-foreground/65"
        />
      )}
    </div>
  )
}

function TriggerIcon({ type }: { type: string }) {
  switch (type) {
    case "event":
      return <Zap className="h-3.5 w-3.5" />
    case "webhook":
      return <Webhook className="h-3.5 w-3.5" />
    case "schedule":
      return <Clock className="h-3.5 w-3.5" />
    default:
      return <Play className="h-3.5 w-3.5" />
  }
}

export function FlowCanvas({
  flowName,
  triggers,
  steps,
  stepDescriptors,
  selectedNode,
  lastRun,
  onSelectNode,
  onAddTrigger,
  onInsertStep,
  onMoveStep,
  onDuplicateStep,
  onRemoveStep,
  onAddSwitchCase,
}: FlowCanvasProps) {
  const { t } = useI18n()
  const tz = useTimezone()
  const [addTrigOpen, setAddTrigOpen] = useState(false)

  const stepRunMap = new Map<string, FlowRun_StepRun>()
  for (const sr of lastRun?.stepRuns ?? []) {
    if (sr.stepId) {
      stepRunMap.set(sr.stepId, sr)
    }
  }

  const renderStepNode = (
    step: Flow_StepNode,
    index: number,
    siblingCount: number
  ) => {
    const descriptor = stepDescriptors.find((d) => d.type === step.type)
    const vTheme = getStepVisualTheme(step.type, descriptor?.owner)
    const isSelected =
      selectedNode.kind === "step" && selectedNode.stepId === step.id
    const sourceCount = Object.keys(step.sources ?? {}).length
    const sr = stepRunMap.get(step.id)

    const switchLanes =
      step.type === "switch"
        ? [
            ...(step.cases ?? []).map((sc, cIdx) => ({
              kind: "case" as const,
              name: sc.name || `branch_${cIdx + 1}`,
              condition: sc.condition || "true",
              steps: sc.steps ?? [],
              caseIndex: cIdx,
            })),
            {
              kind: "default" as const,
              name: t("workflows.canvas.defaultBranch"),
              condition: "else",
              steps: step.default ?? [],
              caseIndex: -1,
            },
          ]
        : []

    return (
      <div key={`${step.id}-${index}`} className="flex flex-col items-center">
        {/* Step Node Card (+ anchored Add Branch button when switch) */}
        <div className="relative flex flex-col items-center">
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelectNode({ kind: "step", stepId: step.id })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onSelectNode({ kind: "step", stepId: step.id })
              }
            }}
            className={`group relative w-[300px] cursor-pointer rounded-xl border bg-card p-3.5 shadow-2xs transition-colors sm:w-[320px] ${
              isSelected
                ? "border-primary ring-2 ring-primary/30"
                : `${vTheme.borderClass} hover:border-foreground/30`
            }`}
          >
            {/* Quick Hover Actions */}
            <div
              className="absolute -top-3 right-3 hidden items-center gap-0.5 rounded-lg border border-border bg-card px-1 py-0.5 shadow-sm group-hover:flex"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                disabled={index === 0}
                onClick={() => onMoveStep(step.id, -1)}
                className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                title={t("workflows.canvas.moveUp")}
              >
                <ArrowUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                disabled={index === siblingCount - 1}
                onClick={() => onMoveStep(step.id, 1)}
                className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                title={t("workflows.canvas.moveDown")}
              >
                <ArrowDown className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => onDuplicateStep(step.id)}
                className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
                title={t("workflows.canvas.duplicateStep")}
              >
                <Copy className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => onRemoveStep(step.id)}
                className="cursor-pointer rounded p-1 text-muted-foreground hover:text-destructive"
                title={t("workflows.canvas.deleteStep")}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>

            <div className="flex items-start gap-3">
              <div
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${vTheme.badgeClass}`}
              >
                <StepIcon type={step.type} />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-foreground">
                    {step.name || descriptor?.displayName || step.id}
                  </span>
                  <span
                    className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${vTheme.badgeClass}`}
                  >
                    {t(STEP_CATEGORY_KEYS[vTheme.categoryKey])}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                  <span className="truncate">{step.id}</span>
                  <span>·</span>
                  <span className="truncate">{step.type}</span>
                </div>

                <p className="truncate pt-0.5 text-[11px] text-muted-foreground">
                  {summarizeStep(step, t)}
                </p>

                {(sourceCount > 0 || sr) && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {sourceCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                        <Database className="h-2.5 w-2.5 text-primary" />
                        {sourceCount} source{sourceCount === 1 ? "" : "s"}
                      </span>
                    )}
                    {sr && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                          sr.status === "completed"
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : sr.status === "failed"
                              ? "bg-destructive/15 text-destructive"
                              : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {sr.status === "completed" ? (
                          <CheckCircle2 className="h-2.5 w-2.5" />
                        ) : sr.status === "failed" ? (
                          <XCircle className="h-2.5 w-2.5" />
                        ) : (
                          <Filter className="h-2.5 w-2.5" />
                        )}
                        {sr.status}
                        {sr.metadata?.duration_ms !== undefined
                          ? ` (${String(sr.metadata.duration_ms)}ms)`
                          : ""}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {step.type === "switch" && (
              <span
                aria-hidden="true"
                className="absolute -bottom-1 left-1/2 z-10 size-2 -translate-x-1/2 rounded-full border-2 border-amber-500 bg-card"
              />
            )}
          </div>

          {step.type === "switch" && (
            <div className="mt-2 sm:absolute sm:top-1/2 sm:left-full sm:mt-0 sm:ml-2.5 sm:-translate-y-1/2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onAddSwitchCase(step.id)}
                className="h-8 gap-1 rounded-lg border-dashed bg-card text-xs whitespace-nowrap shadow-2xs"
              >
                <Plus className="size-3.5" />
                {t("workflows.canvas.addBranch")}
              </Button>
            </div>
          )}
        </div>

        {/* True DAG Fan-Out / Fan-In Branch Lanes for `switch` */}
        {step.type === "switch" && switchLanes.length > 0 && (
          <div
            data-testid={`switch-branches-${step.id}`}
            className="flex flex-col items-center"
          >
            {/* Top stem + absolutely anchored split junction dot (zero flex gap) */}
            <div className="relative h-4 w-0.5 bg-muted-foreground/55">
              {switchLanes.length > 1 && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -bottom-1 left-1/2 z-10 size-2 -translate-x-1/2 rounded-full bg-muted-foreground ring-2 ring-background"
                />
              )}
            </div>

            {/* Side-by-side non-wrapping branch columns (zero outer horizontal padding so rails touch edge-to-edge) */}
            <div className="flex flex-nowrap items-stretch justify-center">
              {switchLanes.map((lane, laneIdx) => {
                const isFirstLane = laneIdx === 0
                const isLastLane = laneIdx === switchLanes.length - 1
                const hasMultiLanes = switchLanes.length > 1
                const isCase = lane.kind === "case"

                return (
                  <div
                    key={`${lane.kind}-${lane.name}-${laneIdx}`}
                    className="relative flex flex-col items-center self-stretch"
                  >
                    {/* Top Fan-Out Bus (`╭───┴───╮`) — spans 100% of column width */}
                    {hasMultiLanes ? (
                      <div
                        aria-hidden="true"
                        className="relative h-5 w-full shrink-0"
                      >
                        {isFirstLane ? (
                          <div className="absolute top-0 right-0 left-[calc(50%-1px)] h-5 rounded-tl-lg border-t-2 border-l-2 border-muted-foreground/55" />
                        ) : isLastLane ? (
                          <div className="absolute top-0 right-[calc(50%-1px)] left-0 h-5 rounded-tr-lg border-t-2 border-r-2 border-muted-foreground/55" />
                        ) : (
                          <>
                            <div className="absolute inset-x-0 top-0 border-t-2 border-muted-foreground/55" />
                            <div className="mx-auto h-5 w-0.5 bg-muted-foreground/55" />
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="h-4 w-0.5 shrink-0 bg-muted-foreground/55" />
                    )}

                    {/* Inner padded card & steps column */}
                    <div className="flex flex-1 flex-col items-center px-3">
                      <div
                        aria-hidden="true"
                        className="h-0 w-0 shrink-0 border-x-4 border-t-[5px] border-x-transparent border-t-muted-foreground/65"
                      />

                      {/* Branch Condition Pill Card */}
                      <button
                        type="button"
                        onClick={() =>
                          onSelectNode({ kind: "step", stepId: step.id })
                        }
                        className={`flex w-[256px] shrink-0 cursor-pointer flex-col gap-1.5 rounded-xl border px-3 py-2 text-left shadow-2xs transition-colors ${
                          isCase
                            ? "border-amber-500/40 bg-card hover:border-amber-500/75"
                            : "border-dashed border-border bg-card/85 hover:border-foreground/30"
                        }`}
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span
                            className={`inline-flex min-w-0 items-center gap-1.5 truncate text-xs font-semibold ${
                              isCase
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            <GitBranch className="size-3.5 shrink-0" />
                            <span className="truncate">{lane.name}</span>
                          </span>
                          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {isCase ? `if` : `else`}
                          </span>
                        </div>
                        <code
                          title={lane.condition}
                          className="block w-full truncate rounded-md bg-muted/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
                          {isCase
                            ? lane.condition
                            : t("workflows.canvas.fallbackCondition")}
                        </code>
                      </button>

                      {/* First Insert Edge inside Branch */}
                      <StepInsertEdge
                        stepDescriptors={stepDescriptors}
                        showEndArrow={lane.steps.length > 0}
                        onInsert={(t) =>
                          onInsertStep(
                            t,
                            isCase
                              ? {
                                  kind: "case",
                                  switchId: step.id,
                                  caseIndex: lane.caseIndex,
                                  index: 0,
                                }
                              : {
                                  kind: "default",
                                  switchId: step.id,
                                  index: 0,
                                }
                          )
                        }
                      />

                      {/* Steps inside Branch */}
                      {lane.steps.map((sub, subIdx) => (
                        <div
                          key={`${sub.id}-${subIdx}`}
                          className="flex flex-col items-center"
                        >
                          {renderStepNode(sub, subIdx, lane.steps.length)}
                          <StepInsertEdge
                            stepDescriptors={stepDescriptors}
                            showEndArrow={subIdx < lane.steps.length - 1}
                            onInsert={(t) =>
                              onInsertStep(
                                t,
                                isCase
                                  ? {
                                      kind: "case",
                                      switchId: step.id,
                                      caseIndex: lane.caseIndex,
                                      index: subIdx + 1,
                                    }
                                  : {
                                      kind: "default",
                                      switchId: step.id,
                                      index: subIdx + 1,
                                    }
                              )
                            }
                          />
                        </div>
                      ))}

                      {/* Auto-stretching continuation wire so uneven branches reach the merge bus cleanly */}
                      <div
                        aria-hidden="true"
                        className="min-h-2 w-0.5 flex-1 bg-muted-foreground/50"
                      />
                    </div>

                    {/* Bottom Fan-In Merge Bus (`╰───┬───╯`) — spans 100% of column width */}
                    {hasMultiLanes && (
                      <div
                        aria-hidden="true"
                        className="relative h-5 w-full shrink-0"
                      >
                        {isFirstLane ? (
                          <div className="absolute right-0 bottom-0 left-[calc(50%-1px)] h-5 rounded-bl-lg border-b-2 border-l-2 border-muted-foreground/55" />
                        ) : isLastLane ? (
                          <div className="absolute right-[calc(50%-1px)] bottom-0 left-0 h-5 rounded-br-lg border-r-2 border-b-2 border-muted-foreground/55" />
                        ) : (
                          <>
                            <div className="mx-auto h-5 w-0.5 bg-muted-foreground/55" />
                            <div className="absolute inset-x-0 bottom-0 border-b-2 border-muted-foreground/55" />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Bottom merge junction dot */}
            {switchLanes.length > 1 && (
              <div className="relative h-0 w-0.5">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-1 left-1/2 z-10 size-2 -translate-x-1/2 rounded-full bg-muted-foreground ring-2 ring-background"
                />
              </div>
            )}
          </div>
        )}

        {/* Visual Container Frame for `for_each` */}
        {step.type === "for_each" && (
          <div className="mt-0 flex flex-col items-center">
            <div className="h-5 w-0.5 bg-muted-foreground/55" />
            <div className="flex min-w-[330px] flex-col items-center rounded-xl border border-dashed border-amber-500/45 bg-card/50 px-5 py-4">
              <div className="mb-1 inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                <Repeat className="size-3.5" />
                <span>
                  Loop each{" "}
                  <code className="font-mono">
                    {String(step.inputs?.item_alias || "item")}
                  </code>
                </span>
              </div>

              <StepInsertEdge
                stepDescriptors={stepDescriptors}
                showEndArrow={(step.steps ?? []).length > 0}
                onInsert={(t) =>
                  onInsertStep(t, {
                    kind: "loop",
                    loopId: step.id,
                    index: 0,
                  })
                }
              />

              {(step.steps ?? []).map((sub, subIdx) => (
                <div
                  key={`${sub.id}-${subIdx}`}
                  className="flex flex-col items-center"
                >
                  {renderStepNode(sub, subIdx, (step.steps ?? []).length)}
                  <StepInsertEdge
                    stepDescriptors={stepDescriptors}
                    showEndArrow={subIdx < (step.steps ?? []).length - 1}
                    onInsert={(t) =>
                      onInsertStep(t, {
                        kind: "loop",
                        loopId: step.id,
                        index: subIdx + 1,
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="relative min-h-[420px] flex-1 overflow-auto bg-muted/20 p-6 lg:h-full lg:min-h-0"
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgba(148, 163, 184, 0.22) 1px, transparent 0)",
        backgroundSize: "20px 20px",
      }}
    >
      {/* Top Flow Header Node */}
      <div className="mx-auto flex min-w-fit flex-col items-center pb-12">
        <button
          type="button"
          onClick={() => onSelectNode({ kind: "flow" })}
          className={`mb-4 flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold shadow-xs transition-all ${
            selectedNode.kind === "flow"
              ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/25"
              : "border-border/60 bg-background/90 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span>
            {t("workflows.canvas.flowSettingsPill", {
              name: flowName || t("workflows.inspector.untitled"),
            })}
          </span>
        </button>

        {/* Triggers Stage (centered on main spine with fan-in merge bus into Step 1) */}
        <div className="relative flex flex-col items-center">
          {triggers.length > 0 ? (
            <div
              data-testid="triggers-fan-in-row"
              className="flex flex-nowrap items-stretch justify-center"
            >
              {triggers.map((trig, idx) => {
                const isSelected =
                  selectedNode.kind === "trigger" && selectedNode.index === idx
                const isFirst = idx === 0
                const isLast = idx === triggers.length - 1
                const hasFanIn = triggers.length > 1
                const subtitle =
                  trig.type === "event"
                    ? trig.config?.topic || t("workflows.canvas.selectTopic")
                    : trig.type === "schedule"
                      ? trig.config?.cron
                        ? getLocalizedCronSummary(
                            trig.config.cron,
                            tz.timezone,
                            t
                          )
                        : t("workflows.canvas.schedule")
                      : trig.type === "webhook"
                        ? trig.id
                          ? `/${trig.id.slice(0, 12)}…:webhook`
                          : t("workflows.canvas.webhookUnsaved")
                        : t("workflows.canvas.manual")

                return (
                  <div
                    key={trig.id ?? `trig-${idx}`}
                    className="relative flex flex-col items-center"
                  >
                    <div className="px-2">
                      <button
                        type="button"
                        onClick={() =>
                          onSelectNode({ kind: "trigger", index: idx })
                        }
                        className={`relative flex w-[220px] cursor-pointer items-center gap-2.5 rounded-xl border bg-card px-3.5 py-2.5 text-left shadow-2xs transition-colors ${
                          isSelected
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-emerald-500/45 hover:border-emerald-500/75"
                        }`}
                      >
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                          <TriggerIcon type={trig.type} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`size-1.5 shrink-0 rounded-full ${trig.isEnabled ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                            />
                            <span className="truncate text-xs font-semibold text-foreground">
                              {trig.name}
                            </span>
                          </div>
                          <div className="truncate font-mono text-[10px] text-muted-foreground">
                            {subtitle}
                          </div>
                        </div>
                        {/* Trigger outlet port dot */}
                        <span
                          aria-hidden="true"
                          className="absolute -bottom-1 left-1/2 z-10 size-2 -translate-x-1/2 rounded-full border-2 border-emerald-500 bg-card"
                        />
                      </button>
                    </div>

                    {hasFanIn && (
                      <div
                        data-testid="trigger-fan-in-connector"
                        aria-hidden="true"
                        className="relative h-6 w-full shrink-0"
                      >
                        {isFirst ? (
                          <div className="absolute right-0 bottom-0 left-[calc(50%-1px)] h-6 rounded-bl-lg border-b-2 border-l-2 border-muted-foreground/55" />
                        ) : isLast ? (
                          <div className="absolute right-[calc(50%-1px)] bottom-0 left-0 h-6 rounded-br-lg border-r-2 border-b-2 border-muted-foreground/55" />
                        ) : (
                          <>
                            <div className="mx-auto h-6 w-0.5 bg-muted-foreground/55" />
                            <div className="absolute inset-x-0 bottom-0 border-b-2 border-muted-foreground/55" />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : null}

          {triggers.length > 1 && (
            <div className="relative h-0 w-0.5">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-1 left-1/2 z-10 size-2 -translate-x-1/2 rounded-full bg-muted-foreground ring-2 ring-background"
              />
            </div>
          )}

          <div
            className={
              triggers.length > 0
                ? "mt-2 sm:absolute sm:top-1 sm:left-full sm:mt-0 sm:ml-2"
                : ""
            }
          >
            <Popover open={addTrigOpen} onOpenChange={setAddTrigOpen}>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 rounded-xl border-dashed bg-background/80 text-xs whitespace-nowrap"
                  />
                }
              >
                <Plus className="h-3.5 w-3.5" />
                {t("workflows.canvas.addTrigger")}
              </PopoverTrigger>
              <PopoverContent className="w-48 rounded-xl p-1.5" align="center">
                {(["event", "webhook", "schedule", "manual"] as const).map(
                  (type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        onAddTrigger(type)
                        setAddTrigOpen(false)
                      }}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium capitalize hover:bg-muted"
                    >
                      <TriggerIcon type={type} />
                      <span>
                        {t("workflows.canvas.triggerOption", { type })}
                      </span>
                    </button>
                  )
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Connector from Triggers into Step 0 */}
        <StepInsertEdge
          stepDescriptors={stepDescriptors}
          onInsert={(type) => onInsertStep(type, { kind: "root", index: 0 })}
          label={
            steps.length === 0 ? t("workflows.canvas.addFirstStep") : undefined
          }
        />

        {/* Vertical Step Sequence */}
        {steps.map((step, idx) => (
          <div key={`${step.id}-${idx}`} className="flex flex-col items-center">
            {renderStepNode(step, idx, steps.length)}
            <StepInsertEdge
              stepDescriptors={stepDescriptors}
              onInsert={(type) =>
                onInsertStep(type, { kind: "root", index: idx + 1 })
              }
            />
          </div>
        ))}

        {/* Terminal End Pill */}
        <div className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
          {t("workflows.canvas.endOfFlow")}
        </div>
      </div>
    </div>
  )
}
