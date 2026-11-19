import { useState } from "react"
import { useListAgentsQuery } from "@saturn/api/gen/saturn/platform/ai/v1/ai"
import {
  discoverVariablesAtStep,
  type WorkflowStepRef,
  type WorkflowVariable,
} from "@saturn/core"
import type {
  Catalog_Loader,
  Catalog_Step,
  Catalog_TriggerTopic,
  Flow,
  FlowRun,
  Flow_SourceBinding,
  Flow_StepNode,
  Flow_Trigger,
} from "@saturn/api/gen/saturn/platform/workflow/v1/workflow"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { ModelConfigEditor } from "./model-config-editor"
import { SchemaFieldsEditor } from "./schema-fields-editor"
import { TriggerEditorCard } from "./trigger-editor-card"
import { VariablePickerInput } from "./variable-picker-input"
import { StepIcon } from "./step-icon"
import { findStepById } from "./step-utils"
import type { SelectedCanvasNode } from "./flow-canvas"
import {
  Plus,
  Trash2,
  Settings2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

interface NodeInspectorPanelProps {
  draft: Flow
  selectedNode: SelectedCanvasNode
  topics: Catalog_TriggerTopic[]
  stepDescriptors: Catalog_Step[]
  loaderDescriptors: Catalog_Loader[]
  firstEventTriggerTopic?: Catalog_TriggerTopic
  lastRun: FlowRun | null
  onSelectFlow: () => void
  onUpdateFlow: (next: Flow) => void
  onUpdateTrigger: (index: number, next: Flow_Trigger) => void
  onRemoveTrigger: (index: number) => void
  onUpdateStep: (step: Flow_StepNode, previousId?: string) => void
  onRemoveStep: (stepId: string) => void
}

function getSchemaProperties(
  schema?: Record<string, unknown>
): Array<[string, Record<string, unknown>]> {
  if (!schema || typeof schema.properties !== "object" || !schema.properties) {
    return []
  }
  return Object.entries(schema.properties as Record<string, unknown>).map(
    ([k, v]) => [
      k,
      v && typeof v === "object" ? (v as Record<string, unknown>) : {},
    ]
  )
}

function SchemaFieldControl({
  name,
  schema,
  value,
  variables,
  onChange,
}: {
  name: string
  schema: Record<string, unknown>
  value: unknown
  variables: WorkflowVariable[]
  onChange: (next: unknown) => void
}) {
  const fieldType = typeof schema.type === "string" ? schema.type : "string"
  const description =
    typeof schema.description === "string" ? schema.description : undefined
  const enumVals = Array.isArray(schema.enum)
    ? schema.enum.filter((x): x is string => typeof x === "string")
    : []

  const isExprString = typeof value === "string" && value.includes("{{")
  const [exprMode, setExprMode] = useState(isExprString)

  const strValue =
    typeof value === "string"
      ? value
      : value !== undefined
        ? JSON.stringify(value)
        : ""

  if (!exprMode && fieldType === "boolean") {
    return (
      <div className="flex items-center justify-between gap-2 py-1">
        <div className="min-w-0 flex-1">
          <Label className="text-xs font-semibold text-foreground">
            {name}
          </Label>
          {description && (
            <p className="text-[11px] text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExprMode(true)}
            className="cursor-pointer rounded px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Switch to CEL expression"
          >
            fx
          </button>
          <Switch
            checked={Boolean(value)}
            onCheckedChange={(checked) => onChange(Boolean(checked))}
          />
        </div>
      </div>
    )
  }

  if (!exprMode && enumVals.length > 0) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-muted-foreground">
            {name}
          </Label>
          <button
            type="button"
            onClick={() => setExprMode(true)}
            className="cursor-pointer rounded px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Switch to CEL expression"
          >
            fx
          </button>
        </div>
        <Select
          value={strValue}
          onValueChange={(val) => onChange(val ?? undefined)}
        >
          <SelectTrigger className="h-9 rounded-xl text-xs">
            <SelectValue placeholder={`Select ${name}`}>
              {strValue || `Select ${name}`}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {enumVals.map((opt) => (
              <SelectItem key={opt} value={opt} className="text-xs">
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {description && (
          <p className="text-[11px] text-muted-foreground">{description}</p>
        )}
      </div>
    )
  }

  if (!exprMode && (fieldType === "number" || fieldType === "integer")) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-muted-foreground">
            {name}
          </Label>
          <button
            type="button"
            onClick={() => setExprMode(true)}
            className="cursor-pointer rounded px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Switch to CEL expression"
          >
            fx
          </button>
        </div>
        <Input
          type="number"
          value={typeof value === "number" ? value : strValue}
          onChange={(e) => {
            if (e.target.value === "") {
              onChange(undefined)
              return
            }
            const parsed = Number(e.target.value)
            onChange(Number.isNaN(parsed) ? e.target.value : parsed)
          }}
          placeholder={description || "0"}
          className="h-9 rounded-xl font-mono text-xs"
        />
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold text-muted-foreground">
          {name}
        </Label>
        {(fieldType === "boolean" ||
          fieldType === "number" ||
          fieldType === "integer" ||
          enumVals.length > 0) && (
          <button
            type="button"
            onClick={() => setExprMode(false)}
            className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-muted"
          >
            Typed input
          </button>
        )}
      </div>
      <VariablePickerInput
        value={strValue}
        onChange={(nextVal) => onChange(nextVal || undefined)}
        variables={variables}
        placeholder={description || `{{ input.${name} }}`}
      />
    </div>
  )
}

export function NodeInspectorPanel({
  draft,
  selectedNode,
  topics,
  stepDescriptors,
  loaderDescriptors,
  firstEventTriggerTopic,
  lastRun,
  onSelectFlow,
  onUpdateFlow,
  onUpdateTrigger,
  onRemoveTrigger,
  onUpdateStep,
  onRemoveStep,
}: NodeInspectorPanelProps) {
  const [stepAdvancedOpen, setStepAdvancedOpen] = useState(false)
  const [flowAdvancedOpen, setFlowAdvancedOpen] = useState(false)
  const { data: agentsData } = useListAgentsQuery({})
  const agents = agentsData?.agents ?? []

  if (selectedNode.kind === "trigger") {
    const trig = (draft.triggers ?? [])[selectedNode.index]
    if (!trig) return null

    return (
      <div className="flex h-full flex-col p-4">
        <div className="mb-4 flex items-center justify-between border-b border-border/40 pb-3">
          <div>
            <span className="text-[10px] font-bold tracking-wider text-emerald-500 uppercase">
              Trigger • {trig.type}
            </span>
            <h3 className="text-sm font-bold text-foreground">{trig.name}</h3>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSelectFlow}
            className="h-7 gap-1 rounded-lg text-xs"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Flow Settings
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          <TriggerEditorCard
            trigger={trig}
            index={selectedNode.index}
            topics={topics}
            onChange={(next) => onUpdateTrigger(selectedNode.index, next)}
            onRemove={() => onRemoveTrigger(selectedNode.index)}
          />
        </div>
      </div>
    )
  }

  if (selectedNode.kind === "step") {
    const step = findStepById(draft.steps ?? [], selectedNode.stepId)
    if (!step) return null

    const descriptor = stepDescriptors.find((d) => d.type === step.type)
    const stepDescMap = Object.fromEntries(
      stepDescriptors.map((d) => [
        d.type ?? "",
        { outputSchema: d.outputSchema },
      ])
    )
    const loaderDescMap = Object.fromEntries(
      loaderDescriptors.map((l) => [
        l.name ?? "",
        { outputSchema: l.outputSchema },
      ])
    )
    const availableVars = discoverVariablesAtStep({
      steps: (draft.steps ?? []) as unknown as WorkflowStepRef[],
      targetStepId: step.id,
      inputSchema: draft.inputSchema,
      triggerPayloadSchema: firstEventTriggerTopic?.payloadSchema,
      stepDescriptors: stepDescMap,
      loaderDescriptors: loaderDescMap,
    })

    const inputs = step.inputs ?? {}
    const updateInput = (key: string, val: unknown) => {
      const next = { ...inputs }
      if (val === undefined || val === "") delete next[key]
      else next[key] = val
      onUpdateStep({ ...step, inputs: next })
    }

    const descriptorProps = getSchemaProperties(descriptor?.inputsSchema)
    const stepRun = (lastRun?.stepRuns ?? []).find(
      (sr) => sr.stepId === step.id
    )
    const sourceEntries = Object.entries(step.sources ?? {})

    const handleAddSource = () => {
      let alias = "data"
      let n = 1
      while ((step.sources ?? {})[alias]) alias = `data_${n++}`
      const nextSources: Record<string, Flow_SourceBinding> = {
        ...(step.sources ?? {}),
        [alias]: {
          loader: loaderDescriptors[0]?.name ?? "finance.accounts",
          params: {},
          required: false,
        },
      }
      onUpdateStep({ ...step, sources: nextSources })
    }

    return (
      <div className="flex h-full flex-col p-4">
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-border/40 pb-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <StepIcon type={step.type} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-foreground">
                {step.name || descriptor?.displayName || step.id}
              </div>
              <div className="truncate font-mono text-[10px] text-muted-foreground">
                {step.type}
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onRemoveStep(step.id)}
            className="text-muted-foreground hover:text-destructive"
            title="Delete step"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <Tabs defaultValue="config" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="grid w-full grid-cols-3 rounded-xl">
            <TabsTrigger value="config" className="rounded-lg text-xs">
              Config
            </TabsTrigger>
            <TabsTrigger value="sources" className="rounded-lg text-xs">
              Sources ({sourceEntries.length})
            </TabsTrigger>
            <TabsTrigger value="output" className="rounded-lg text-xs">
              Output
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="config"
            className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1"
          >
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">
                Step Name
              </Label>
              <Input
                value={step.name ?? ""}
                onChange={(e) =>
                  onUpdateStep({ ...step, name: e.target.value })
                }
                className="h-9 rounded-xl text-xs font-semibold"
              />
            </div>

            {(step.type === "llm.generate" || step.type === "ai.agent_run") && (
              <div className="space-y-4 border-t border-border/40 pt-4">
                {step.type === "ai.agent_run" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">
                      Target Agent
                    </Label>
                    <Select
                      value={String(inputs.agent_id ?? "")}
                      onValueChange={(val) =>
                        updateInput("agent_id", val ?? "")
                      }
                    >
                      <SelectTrigger className="h-9 rounded-xl text-xs">
                        <SelectValue placeholder="Choose an agent">
                          {agents.find((a) => a.id === inputs.agent_id)?.name ||
                            String(inputs.agent_id || "Choose an agent")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {agents.map((a) => (
                          <SelectItem
                            key={a.id}
                            value={a.id ?? ""}
                            className="text-xs"
                          >
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Prompt Template
                  </Label>
                  <VariablePickerInput
                    value={String(inputs.prompt ?? "")}
                    onChange={(val) => updateInput("prompt", val)}
                    variables={availableVars}
                    multiline
                    rows={4}
                  />
                </div>

                <ModelConfigEditor
                  value={step.model}
                  onChange={(model) => onUpdateStep({ ...step, model })}
                  defaultLabel="Inherit Flow Default"
                />

                <div className="border-t border-border/40 pt-4">
                  <SchemaFieldsEditor
                    label="Structured Output Schema"
                    value={
                      inputs.output_schema &&
                      typeof inputs.output_schema === "object"
                        ? (inputs.output_schema as Record<string, unknown>)
                        : undefined
                    }
                    onChange={(schema) => updateInput("output_schema", schema)}
                  />
                </div>
              </div>
            )}

            {step.type === "filter" && (
              <div className="space-y-4 border-t border-border/40 pt-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    CEL Condition
                  </Label>
                  <VariablePickerInput
                    value={String(inputs.condition ?? "")}
                    onChange={(val) => updateInput("condition", val)}
                    variables={availableVars}
                    rawMode
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Skip Reason
                  </Label>
                  <Input
                    value={String(inputs.reason ?? "")}
                    onChange={(e) => updateInput("reason", e.target.value)}
                    className="h-9 rounded-xl text-xs"
                  />
                </div>
              </div>
            )}

            {step.type === "switch" && (
              <div className="space-y-3 border-t border-border/40 pt-4">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Branch Cases
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      onUpdateStep({
                        ...step,
                        cases: [
                          ...(step.cases ?? []),
                          {
                            name: `case_${(step.cases?.length ?? 0) + 1}`,
                            condition: "true",
                            steps: [],
                          },
                        ],
                      })
                    }
                    className="h-7 gap-1 rounded-lg px-2 text-xs text-primary"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Case
                  </Button>
                </div>

                {(step.cases ?? []).map((sc, cIdx) => (
                  <div
                    key={`${sc.name}-${cIdx}`}
                    className="space-y-2 border-l-2 border-amber-500/40 pl-3"
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        value={sc.name}
                        onChange={(e) =>
                          onUpdateStep({
                            ...step,
                            cases: (step.cases ?? []).map((c, i) =>
                              i === cIdx ? { ...c, name: e.target.value } : c
                            ),
                          })
                        }
                        className="h-8 flex-1 rounded-lg font-mono text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          onUpdateStep({
                            ...step,
                            cases: (step.cases ?? []).filter(
                              (_, i) => i !== cIdx
                            ),
                          })
                        }
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <VariablePickerInput
                      value={sc.condition}
                      onChange={(cond) =>
                        onUpdateStep({
                          ...step,
                          cases: (step.cases ?? []).map((c, i) =>
                            i === cIdx ? { ...c, condition: cond } : c
                          ),
                        })
                      }
                      variables={availableVars}
                      rawMode
                    />
                  </div>
                ))}
              </div>
            )}

            {step.type === "for_each" && (
              <div className="space-y-4 border-t border-border/40 pt-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Items Collection Expression
                  </Label>
                  <VariablePickerInput
                    value={String(inputs.items ?? "")}
                    onChange={(val) => updateInput("items", val)}
                    variables={availableVars}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Item Alias
                  </Label>
                  <Input
                    value={String(inputs.item_alias ?? "item")}
                    onChange={(e) => updateInput("item_alias", e.target.value)}
                    className="h-9 rounded-xl font-mono text-xs"
                  />
                </div>
              </div>
            )}

            {step.type === "output" && (
              <div className="space-y-1.5 border-t border-border/40 pt-4">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Output Expression / JSON
                </Label>
                <VariablePickerInput
                  value={
                    typeof inputs.value === "string"
                      ? inputs.value
                      : JSON.stringify(inputs.value ?? {}, null, 2)
                  }
                  onChange={(val) => {
                    const trimmed = val.trim()
                    if (trimmed.startsWith("{") && !trimmed.startsWith("{{")) {
                      try {
                        updateInput("value", JSON.parse(trimmed))
                        return
                      } catch {
                        // ignore until valid JSON
                      }
                    }
                    updateInput("value", val)
                  }}
                  variables={availableVars}
                  multiline
                  rows={5}
                />
              </div>
            )}

            {step.type === "stop" && (
              <div className="space-y-1.5 border-t border-border/40 pt-4">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Stop Reason
                </Label>
                <Input
                  value={String(inputs.reason ?? "")}
                  onChange={(e) => updateInput("reason", e.target.value)}
                  className="h-9 rounded-xl text-xs"
                />
              </div>
            )}

            {step.type === "document.extract_text" && (
              <div className="space-y-4 border-t border-border/40 pt-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Artifact Ref
                  </Label>
                  <VariablePickerInput
                    value={String(inputs.artifact_ref ?? "")}
                    onChange={(val) => updateInput("artifact_ref", val)}
                    variables={availableVars}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Passwords Expression
                  </Label>
                  <VariablePickerInput
                    value={String(inputs.passwords ?? "")}
                    onChange={(val) => updateInput("passwords", val)}
                    variables={availableVars}
                  />
                </div>
              </div>
            )}

            {![
              "llm.generate",
              "ai.agent_run",
              "filter",
              "switch",
              "for_each",
              "output",
              "stop",
              "document.extract_text",
            ].includes(step.type) && (
              <div className="space-y-4 border-t border-border/40 pt-4">
                {descriptorProps.length > 0
                  ? descriptorProps.map(([k, schemaObj]) => (
                      <SchemaFieldControl
                        key={k}
                        name={k}
                        schema={schemaObj}
                        value={inputs[k]}
                        variables={availableVars}
                        onChange={(nextVal) => updateInput(k, nextVal)}
                      />
                    ))
                  : Object.keys(inputs).map((k) => (
                      <SchemaFieldControl
                        key={k}
                        name={k}
                        schema={{ type: "string" }}
                        value={inputs[k]}
                        variables={availableVars}
                        onChange={(nextVal) => updateInput(k, nextVal)}
                      />
                    ))}
                {descriptorProps.length === 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      updateInput(`field_${Object.keys(inputs).length + 1}`, "")
                    }
                    className="h-7 gap-1 rounded-lg px-2 text-xs text-primary"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Field
                  </Button>
                )}
              </div>
            )}

            {/* Progressive Disclosure: Step Advanced Section */}
            <div className="border-t border-border/40 pt-3">
              <button
                type="button"
                onClick={() => setStepAdvancedOpen(!stepAdvancedOpen)}
                className="flex w-full cursor-pointer items-center justify-between py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <span>Advanced</span>
                {stepAdvancedOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>

              {stepAdvancedOpen && (
                <div className="mt-3 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">
                      Step ID (Referenced as steps.{step.id})
                    </Label>
                    <Input
                      value={step.id}
                      onChange={(e) =>
                        onUpdateStep({ ...step, id: e.target.value }, step.id)
                      }
                      className="h-9 rounded-xl font-mono text-xs"
                    />
                  </div>

                  {step.type === "llm.generate" && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          System Instruction
                        </Label>
                        <VariablePickerInput
                          value={String(inputs.system ?? "")}
                          onChange={(val) => updateInput("system", val)}
                          variables={availableVars}
                          multiline
                          rows={2}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          Documents Expression
                        </Label>
                        <VariablePickerInput
                          value={String(inputs.documents ?? "")}
                          onChange={(val) => updateInput("documents", val)}
                          variables={availableVars}
                          placeholder="{{ input.?documents.orValue([]) }}"
                        />
                      </div>
                    </>
                  )}

                  <label className="flex cursor-pointer items-center justify-between py-1 text-xs font-medium">
                    <span>Continue workflow on step failure</span>
                    <Switch
                      size="sm"
                      checked={step.onError === "continue"}
                      onCheckedChange={(checked) =>
                        onUpdateStep({
                          ...step,
                          onError: checked ? "continue" : "fail",
                        })
                      }
                    />
                  </label>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent
            value="sources"
            className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Hydrated into <code>sources.&lt;alias&gt;</code>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAddSource}
                className="h-7 gap-1 rounded-lg px-2 text-xs text-primary"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Source
              </Button>
            </div>

            {sourceEntries.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No data sources attached to this step.
              </p>
            ) : (
              <div className="divide-y divide-border/40">
                {sourceEntries.map(([alias, binding]) => {
                  const desc = loaderDescriptors.find(
                    (l) => l.name === binding.loader
                  )
                  const paramProps = getSchemaProperties(desc?.paramsSchema)
                  const params = binding.params ?? {}

                  return (
                    <div key={alias} className="space-y-3 py-4 first:pt-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-foreground">
                          sources.{alias}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            const next = { ...(step.sources ?? {}) }
                            delete next[alias]
                            onUpdateStep({ ...step, sources: next })
                          }}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <Select
                        value={binding.loader}
                        onValueChange={(loader) =>
                          onUpdateStep({
                            ...step,
                            sources: {
                              ...(step.sources ?? {}),
                              [alias]: {
                                ...binding,
                                loader: loader ?? binding.loader,
                              },
                            },
                          })
                        }
                      >
                        <SelectTrigger className="h-9 rounded-xl font-mono text-xs">
                          <SelectValue>{binding.loader}</SelectValue>
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {loaderDescriptors.map((l) => (
                            <SelectItem
                              key={l.name}
                              value={l.name ?? ""}
                              className="text-xs"
                            >
                              {l.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {paramProps.map(([pName, pSchema]) => (
                        <SchemaFieldControl
                          key={pName}
                          name={pName}
                          schema={pSchema}
                          value={params[pName]}
                          variables={availableVars}
                          onChange={(nextVal) => {
                            const nextParams = { ...params }
                            if (nextVal === undefined || nextVal === "") {
                              delete nextParams[pName]
                            } else {
                              nextParams[pName] = nextVal
                            }
                            onUpdateStep({
                              ...step,
                              sources: {
                                ...(step.sources ?? {}),
                                [alias]: { ...binding, params: nextParams },
                              },
                            })
                          }}
                        />
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="output"
            className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1"
          >
            {!stepRun ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Run <strong>Test &amp; Run</strong> to inspect live output for{" "}
                <code>steps.{step.id}</code>.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-border/40 pb-2 text-xs">
                  <span className="flex items-center gap-1.5 font-bold uppercase">
                    {stepRun.status === "completed" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    {stepRun.status}
                  </span>
                  {stepRun.metadata?.duration_ms !== undefined && (
                    <span className="font-mono text-muted-foreground">
                      {String(stepRun.metadata.duration_ms)} ms
                    </span>
                  )}
                </div>

                {stepRun.error?.message && (
                  <div className="rounded-xl bg-destructive/10 p-3 font-mono text-xs text-destructive">
                    {stepRun.error.message}
                  </div>
                )}

                {stepRun.output && (
                  <pre className="overflow-x-auto rounded-xl bg-muted/50 p-3 font-mono text-[11px]">
                    {JSON.stringify(stepRun.output, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    )
  }

  // Flow Settings Inspector (single-column, flat hairline dividers, progressive disclosure)
  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4 border-b border-border/40 pb-3">
        <span className="text-[11px] font-medium text-primary">
          Flow Settings
        </span>
        <h3 className="text-sm font-semibold text-foreground">
          {draft.name || "Untitled Workflow"}
        </h3>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">
            Description
          </Label>
          <Textarea
            value={draft.description ?? ""}
            onChange={(e) =>
              onUpdateFlow({ ...draft, description: e.target.value })
            }
            rows={2}
            placeholder="What does this workflow automate?"
            className="rounded-xl text-xs"
          />
        </div>

        <label className="flex cursor-pointer items-center justify-between py-1 text-xs font-semibold">
          <span>Workflow Enabled</span>
          <Switch
            checked={draft.isEnabled}
            onCheckedChange={(checked) =>
              onUpdateFlow({ ...draft, isEnabled: Boolean(checked) })
            }
          />
        </label>

        <div className="border-t border-border/40 pt-4">
          <ModelConfigEditor
            value={draft.config?.defaultModel}
            onChange={(defaultModel) =>
              onUpdateFlow({
                ...draft,
                config: { ...(draft.config ?? {}), defaultModel },
              })
            }
          />
        </div>

        <div className="border-t border-border/40 pt-3">
          <button
            type="button"
            onClick={() => setFlowAdvancedOpen(!flowAdvancedOpen)}
            className="flex w-full cursor-pointer items-center justify-between py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <span>Advanced (Execution &amp; Input Schema)</span>
            {flowAdvancedOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>

          {flowAdvancedOpen && (
            <div className="mt-3 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Timeout (seconds)
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.config?.timeoutSeconds ?? 0}
                  onChange={(e) =>
                    onUpdateFlow({
                      ...draft,
                      config: {
                        ...(draft.config ?? {}),
                        timeoutSeconds: Number(e.target.value) || undefined,
                      },
                    })
                  }
                  className="h-9 rounded-xl font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Max Retries
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={draft.config?.maxRetries ?? 0}
                  onChange={(e) =>
                    onUpdateFlow({
                      ...draft,
                      config: {
                        ...(draft.config ?? {}),
                        maxRetries: Number(e.target.value) || undefined,
                      },
                    })
                  }
                  className="h-9 rounded-xl font-mono text-xs"
                />
              </div>

              <div className="border-t border-border/40 pt-3">
                <SchemaFieldsEditor
                  label="Flow Input Schema (Optional)"
                  value={draft.inputSchema}
                  onChange={(inputSchema) =>
                    onUpdateFlow({ ...draft, inputSchema })
                  }
                  emptyText="Accepts arbitrary input JSON. Add fields for input.* autocomplete."
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
