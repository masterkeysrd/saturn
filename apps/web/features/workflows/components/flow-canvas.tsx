import { useState } from "react"
import { useTimezone } from "@saturn/hooks"
import { summarizeCron } from "@saturn/core"
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
import { getStepVisualTheme, summarizeStep } from "./step-utils"
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
  Sparkles,
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

const FALLBACK_STEP_OPTIONS: Catalog_Step[] = [
  {
    type: "llm.generate",
    owner: "platform",
    category: "ai",
    displayName: "LLM Generate",
    description: "Run structured or freeform AI inference",
  },
  {
    type: "filter",
    owner: "platform",
    category: "logic",
    displayName: "Filter",
    description: "Skip workflow if CEL condition is false",
  },
  {
    type: "switch",
    owner: "platform",
    category: "logic",
    displayName: "Switch Branch",
    description: "Route execution down conditional branches",
  },
  {
    type: "for_each",
    owner: "platform",
    category: "logic",
    displayName: "For Each Loop",
    description: "Iterate over an array expression",
  },
  {
    type: "transform",
    owner: "platform",
    category: "flow",
    displayName: "Transform",
    description: "Map variables into a structured object",
  },
  {
    type: "output",
    owner: "platform",
    category: "flow",
    displayName: "Return Output",
    description: "Terminate flow and return payload",
  },
]

function StepInsertEdge({
  stepDescriptors,
  onInsert,
  label,
}: {
  stepDescriptors: Catalog_Step[]
  onInsert: (type: string) => void
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const options =
    stepDescriptors.length > 0 ? stepDescriptors : FALLBACK_STEP_OPTIONS
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
      <div className="h-4 w-px bg-border/80" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="group flex h-6 cursor-pointer items-center gap-1 rounded-full border border-border/70 bg-background px-2 text-[11px] font-semibold text-muted-foreground shadow-xs transition-all hover:scale-105 hover:border-primary hover:text-primary"
              title="Insert step here"
              aria-label={label || "Insert step"}
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
              placeholder="Search steps (AI, finance, mail...)"
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
      <div className="h-4 w-px bg-border/80" />
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

    return (
      <div key={`${step.id}-${index}`} className="flex flex-col items-center">
        {/* Step Node Card */}
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
          className={`group relative w-full max-w-[360px] min-w-[270px] cursor-pointer rounded-2xl border bg-card/95 p-3.5 shadow-sm backdrop-blur-sm transition-all hover:shadow-md ${
            isSelected
              ? "border-primary ring-2 ring-primary/30"
              : `${vTheme.borderClass} hover:border-foreground/30`
          }`}
        >
          {/* Quick Hover Actions */}
          <div
            className="absolute -top-3 right-3 hidden items-center gap-0.5 rounded-full border border-border/60 bg-background/95 px-1.5 py-0.5 shadow-sm group-hover:flex"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              disabled={index === 0}
              onClick={() => onMoveStep(step.id, -1)}
              className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
              title="Move up"
            >
              <ArrowUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              disabled={index === siblingCount - 1}
              onClick={() => onMoveStep(step.id, 1)}
              className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
              title="Move down"
            >
              <ArrowDown className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => onDuplicateStep(step.id)}
              className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
              title="Duplicate step"
            >
              <Copy className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => onRemoveStep(step.id)}
              className="cursor-pointer rounded p-1 text-muted-foreground hover:text-destructive"
              title="Delete step"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>

          <div className="flex items-start gap-3">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${vTheme.badgeClass}`}
            >
              <StepIcon type={step.type} />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-bold text-foreground">
                  {step.name || descriptor?.displayName || step.id}
                </span>
                <span
                  className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${vTheme.badgeClass}`}
                >
                  {vTheme.categoryLabel}
                </span>
              </div>

              <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                <span className="truncate">{step.id}</span>
                <span>•</span>
                <span className="truncate">{step.type}</span>
              </div>

              <p className="truncate pt-0.5 text-[11px] text-muted-foreground">
                {summarizeStep(step)}
              </p>

              {(sourceCount > 0 || sr) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {sourceCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                      <Database className="h-2.5 w-2.5 text-primary" />
                      {sourceCount} source{sourceCount === 1 ? "" : "s"}
                    </span>
                  )}
                  {sr && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                        sr.status === "completed"
                          ? "bg-emerald-500/15 text-emerald-500"
                          : sr.status === "failed"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-amber-500/15 text-amber-500"
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
        </div>

        {/* Visual Branch Lanes for `switch` */}
        {step.type === "switch" && (
          <div className="mt-0 flex flex-col items-center">
            <div className="h-4 w-px bg-amber-500/50" />
            <div className="relative flex flex-wrap items-start justify-center gap-5 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
              {(step.cases ?? []).map((sc, cIdx) => (
                <div
                  key={`${sc.name}-${cIdx}`}
                  className="flex min-w-[275px] flex-col items-center rounded-xl border border-border/50 bg-background/60 p-3"
                >
                  <div className="mb-2 flex w-full items-center justify-between gap-2 border-b border-border/40 pb-2">
                    <span className="font-mono text-xs font-bold text-amber-400">
                      {sc.name}
                    </span>
                    <code className="max-w-[160px] truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {sc.condition}
                    </code>
                  </div>

                  <StepInsertEdge
                    stepDescriptors={stepDescriptors}
                    onInsert={(t) =>
                      onInsertStep(t, {
                        kind: "case",
                        switchId: step.id,
                        caseIndex: cIdx,
                        index: 0,
                      })
                    }
                  />

                  {(sc.steps ?? []).map((sub, subIdx) => (
                    <div
                      key={`${sub.id}-${subIdx}`}
                      className="flex flex-col items-center"
                    >
                      {renderStepNode(sub, subIdx, (sc.steps ?? []).length)}
                      <StepInsertEdge
                        stepDescriptors={stepDescriptors}
                        onInsert={(t) =>
                          onInsertStep(t, {
                            kind: "case",
                            switchId: step.id,
                            caseIndex: cIdx,
                            index: subIdx + 1,
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              ))}

              <div className="flex flex-col items-center justify-center self-stretch">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onAddSwitchCase(step.id)}
                  className="h-8 gap-1 rounded-xl border-dashed text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Branch
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Visual Container Frame for `for_each` */}
        {step.type === "for_each" && (
          <div className="mt-0 flex flex-col items-center">
            <div className="h-4 w-px bg-amber-500/50" />
            <div className="flex min-w-[320px] flex-col items-center rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-amber-400">
                <Sparkles className="h-3 w-3" />
                LOOP BODY ({String(step.inputs?.item_alias || "item")})
              </div>

              <StepInsertEdge
                stepDescriptors={stepDescriptors}
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
      className="relative flex-1 overflow-auto rounded-2xl border border-border/50 bg-muted/20 p-6"
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
          <span>{flowName || "Untitled Workflow"} — Flow Settings</span>
        </button>

        {/* Triggers Stage */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {triggers.map((trig, idx) => {
            const isSelected =
              selectedNode.kind === "trigger" && selectedNode.index === idx
            const subtitle =
              trig.type === "event"
                ? trig.config?.topic || "Select topic"
                : trig.type === "schedule"
                  ? trig.config?.cron
                    ? summarizeCron(trig.config.cron, tz.timezone)
                    : "Schedule"
                  : trig.type === "webhook"
                    ? trig.id
                      ? `/${trig.id.slice(0, 12)}…:webhook`
                      : "Webhook (unsaved)"
                    : "Callable / Manual"

            return (
              <button
                key={trig.id ?? `trig-${idx}`}
                type="button"
                onClick={() => onSelectNode({ kind: "trigger", index: idx })}
                className={`flex min-w-[190px] cursor-pointer items-center gap-2.5 rounded-2xl border bg-card/95 px-3.5 py-2.5 text-left shadow-sm transition-all hover:shadow-md ${
                  isSelected
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-emerald-500/30 hover:border-emerald-500/60"
                }`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-500">
                  <TriggerIcon type={trig.type} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${trig.isEnabled ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                    />
                    <span className="truncate text-xs font-bold text-foreground">
                      {trig.name}
                    </span>
                  </div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground">
                    {subtitle}
                  </div>
                </div>
              </button>
            )
          })}

          <Popover open={addTrigOpen} onOpenChange={setAddTrigOpen}>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1.5 rounded-2xl border-dashed bg-background/80 text-xs"
                />
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add Trigger
            </PopoverTrigger>
            <PopoverContent className="w-48 rounded-2xl p-1.5" align="center">
              {(["event", "webhook", "schedule", "manual"] as const).map(
                (type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      onAddTrigger(type)
                      setAddTrigOpen(false)
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-medium capitalize hover:bg-muted"
                  >
                    <TriggerIcon type={type} />
                    <span>{type} trigger</span>
                  </button>
                )
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* Connector from Triggers into Step 0 */}
        <StepInsertEdge
          stepDescriptors={stepDescriptors}
          onInsert={(type) => onInsertStep(type, { kind: "root", index: 0 })}
          label={steps.length === 0 ? "Add First Step" : undefined}
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
          End of Flow
        </div>
      </div>
    </div>
  )
}
