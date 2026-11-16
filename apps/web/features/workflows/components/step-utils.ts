import type { Flow_StepNode } from "@saturn/api/gen/saturn/platform/workflow/v1/workflow"

export function findStepById(
  steps: Flow_StepNode[],
  targetId: string
): Flow_StepNode | undefined {
  for (const s of steps) {
    if (s.id === targetId) return s
    for (const sc of s.cases ?? []) {
      const found = findStepById(sc.steps ?? [], targetId)
      if (found) return found
    }
    if (s.default) {
      const found = findStepById(s.default, targetId)
      if (found) return found
    }
    if (s.steps) {
      const found = findStepById(s.steps, targetId)
      if (found) return found
    }
  }
  return undefined
}

export function updateStepById(
  steps: Flow_StepNode[],
  targetId: string,
  nextStep: Flow_StepNode
): Flow_StepNode[] {
  return steps.map((s) => {
    if (s.id === targetId) return nextStep
    let changed = false
    const nextCases = (s.cases ?? []).map((sc) => {
      const updated = updateStepById(sc.steps ?? [], targetId, nextStep)
      if (updated !== sc.steps) changed = true
      return { ...sc, steps: updated }
    })
    const nextDefault = s.default
      ? updateStepById(s.default, targetId, nextStep)
      : s.default
    if (nextDefault !== s.default) changed = true
    const nextInner = s.steps
      ? updateStepById(s.steps, targetId, nextStep)
      : s.steps
    if (nextInner !== s.steps) changed = true

    if (!changed) return s
    return {
      ...s,
      cases: nextCases,
      default: nextDefault ?? [],
      steps: nextInner ?? [],
    }
  })
}

export function removeStepById(
  steps: Flow_StepNode[],
  targetId: string
): Flow_StepNode[] {
  return steps
    .filter((s) => s.id !== targetId)
    .map((s) => ({
      ...s,
      cases: (s.cases ?? []).map((sc) => ({
        ...sc,
        steps: removeStepById(sc.steps ?? [], targetId),
      })),
      default: s.default ? removeStepById(s.default, targetId) : [],
      steps: s.steps ? removeStepById(s.steps, targetId) : [],
    }))
}

export function moveStepById(
  steps: Flow_StepNode[],
  targetId: string,
  dir: -1 | 1
): Flow_StepNode[] {
  const idx = steps.findIndex((s) => s.id === targetId)
  if (idx !== -1) {
    const dest = idx + dir
    if (dest < 0 || dest >= steps.length) return steps
    const copy = [...steps]
    const [removed] = copy.splice(idx, 1)
    copy.splice(dest, 0, removed)
    return copy
  }
  return steps.map((s) => ({
    ...s,
    cases: (s.cases ?? []).map((sc) => ({
      ...sc,
      steps: moveStepById(sc.steps ?? [], targetId, dir),
    })),
    default: s.default ? moveStepById(s.default, targetId, dir) : [],
    steps: s.steps ? moveStepById(s.steps, targetId, dir) : [],
  }))
}

export function insertStepInTree(
  steps: Flow_StepNode[],
  newStep: Flow_StepNode,
  target:
    | { kind: "root"; index: number }
    | { kind: "case"; switchId: string; caseIndex: number; index: number }
    | { kind: "default"; switchId: string; index: number }
    | { kind: "loop"; loopId: string; index: number }
): Flow_StepNode[] {
  if (target.kind === "root") {
    const copy = [...steps]
    copy.splice(target.index, 0, newStep)
    return copy
  }

  return steps.map((s) => {
    if (target.kind === "case" && s.id === target.switchId) {
      const cases = (s.cases ?? []).map((sc, idx) => {
        if (idx !== target.caseIndex) return sc
        const next = [...(sc.steps ?? [])]
        next.splice(target.index, 0, newStep)
        return { ...sc, steps: next }
      })
      return { ...s, cases }
    }
    if (target.kind === "default" && s.id === target.switchId) {
      const next = [...(s.default ?? [])]
      next.splice(target.index, 0, newStep)
      return { ...s, default: next }
    }
    if (target.kind === "loop" && s.id === target.loopId) {
      const next = [...(s.steps ?? [])]
      next.splice(target.index, 0, newStep)
      return { ...s, steps: next }
    }
    return {
      ...s,
      cases: (s.cases ?? []).map((sc) => ({
        ...sc,
        steps: insertStepInTree(sc.steps ?? [], newStep, target),
      })),
      default: s.default ? insertStepInTree(s.default, newStep, target) : [],
      steps: s.steps ? insertStepInTree(s.steps, newStep, target) : [],
    }
  })
}

export interface StepVisualTheme {
  badgeClass: string
  borderClass: string
  accentText: string
  categoryLabel: string
}

export function getStepVisualTheme(
  type: string,
  owner?: string
): StepVisualTheme {
  if (type === "llm.generate" || type === "ai.agent_run") {
    return {
      badgeClass: "bg-violet-500/15 text-violet-500 border-violet-500/30",
      borderClass: "border-violet-500/30",
      accentText: "text-violet-400",
      categoryLabel: "AI",
    }
  }
  if (type === "filter" || type === "switch" || type === "for_each") {
    return {
      badgeClass: "bg-amber-500/15 text-amber-500 border-amber-500/30",
      borderClass: "border-amber-500/30",
      accentText: "text-amber-400",
      categoryLabel: "Logic",
    }
  }
  if (type === "output" || type === "stop") {
    return {
      badgeClass: "bg-rose-500/15 text-rose-500 border-rose-500/30",
      borderClass: "border-rose-500/30",
      accentText: "text-rose-400",
      categoryLabel: type === "stop" ? "Halt" : "Output",
    }
  }
  if (owner === "finance" || type.startsWith("finance.")) {
    return {
      badgeClass: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
      borderClass: "border-emerald-500/30",
      accentText: "text-emerald-400",
      categoryLabel: "Finance",
    }
  }
  if (owner === "calendar" || type.startsWith("calendar.")) {
    return {
      badgeClass: "bg-sky-500/15 text-sky-500 border-sky-500/30",
      borderClass: "border-sky-500/30",
      accentText: "text-sky-400",
      categoryLabel: "Calendar",
    }
  }
  if (owner === "mail" || type.startsWith("mail.")) {
    return {
      badgeClass: "bg-indigo-500/15 text-indigo-500 border-indigo-500/30",
      borderClass: "border-indigo-500/30",
      accentText: "text-indigo-400",
      categoryLabel: "Mail",
    }
  }
  return {
    badgeClass: "bg-primary/15 text-primary border-primary/30",
    borderClass: "border-primary/30",
    accentText: "text-primary",
    categoryLabel: "Core",
  }
}

export function summarizeStep(step: Flow_StepNode): string {
  const inputs = step.inputs ?? {}
  switch (step.type) {
    case "llm.generate": {
      const model = step.model?.modelId
        ? `Model: ${step.model.modelId}`
        : step.model?.role
          ? `Role: ${step.model.role}`
          : null
      const prompt =
        typeof inputs.prompt === "string" ? inputs.prompt.trim() : ""
      if (model && prompt) return `${model} • ${prompt.slice(0, 48)}`
      if (prompt) return prompt.slice(0, 72)
      return model || "Generate structured or freeform AI output"
    }
    case "ai.agent_run": {
      const agent = inputs.agent_id ? `Agent: ${String(inputs.agent_id)}` : null
      const prompt =
        typeof inputs.prompt === "string" ? inputs.prompt.trim() : ""
      if (agent && prompt) return `${agent} • ${prompt.slice(0, 48)}`
      if (prompt) return prompt.slice(0, 72)
      return agent || "Run autonomous MCP-backed AI agent"
    }
    case "filter":
      return typeof inputs.condition === "string" && inputs.condition.trim()
        ? `if (${inputs.condition.trim()})`
        : "Evaluate CEL condition"
    case "switch": {
      const count = step.cases?.length ?? 0
      return `${count} branch${count === 1 ? "" : "es"}`
    }
    case "for_each":
      return `for ${String(inputs.item_alias || "item")} in ${String(inputs.items || "...")}`
    case "document.extract_text":
      return `Extract text from ${String(inputs.artifact_ref || "document")}`
    case "output":
      return typeof inputs.value === "string"
        ? inputs.value.slice(0, 64)
        : "Return structured JSON output"
    case "stop":
      return String(inputs.reason || "Stop workflow early")
    default: {
      const keys = Object.keys(inputs)
      if (keys.length === 0) return step.type
      return keys
        .slice(0, 3)
        .map((k) => `${k}: ${String(inputs[k] ?? "")}`)
        .join(" • ")
        .slice(0, 72)
    }
  }
}
