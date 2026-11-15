import type { WorkflowSourceRef, WorkflowStepRef } from "./scope"

export interface DefaultWorkflowSwitchCase {
  name: string
  condition: string
  steps: DefaultWorkflowStep[]
}

export interface DefaultWorkflowStep extends WorkflowStepRef {
  sources: Record<string, WorkflowSourceRef>
  cases: DefaultWorkflowSwitchCase[]
  default: DefaultWorkflowStep[]
  steps: DefaultWorkflowStep[]
}

export function createDefaultWorkflowStep(
  type: string,
  existingIds: Set<string>
): DefaultWorkflowStep {
  const base = type.replace(/[^a-zA-Z0-9_]/g, "_")
  let id = base
  let n = 1
  while (existingIds.has(id)) {
    id = `${base}_${n++}`
  }

  const baseStep: DefaultWorkflowStep = {
    id,
    name: type,
    type,
    sources: {},
    cases: [],
    default: [],
    steps: [],
    inputs: {},
  }

  switch (type) {
    case "llm.generate":
      return {
        ...baseStep,
        name: "AI Step",
        inputs: {
          system: "You are a helpful workspace automation assistant.",
          prompt: "Analyze input:\n{{ toJSON(input) }}",
        },
      }
    case "filter":
      return {
        ...baseStep,
        name: "Filter Condition",
        inputs: {
          condition: "true",
          reason: "Condition did not match",
        },
      }
    case "switch":
      return {
        ...baseStep,
        name: "Switch Branch",
        cases: [{ name: "branch_1", condition: "true", steps: [] }],
      }
    case "for_each":
      return {
        ...baseStep,
        name: "For Each Loop",
        inputs: {
          items: "{{ input.items }}",
          item_alias: "item",
        },
      }
    case "transform":
      return {
        ...baseStep,
        name: "Transform Data",
        inputs: {
          result: "{{ input }}",
        },
      }
    case "output":
      return {
        ...baseStep,
        name: "Return Output",
        inputs: {
          value: "{{ input }}",
        },
      }
    case "stop":
      return {
        ...baseStep,
        name: "Stop Workflow",
        inputs: {
          reason: "Stopped early",
        },
      }
    case "document.extract_text":
      return {
        ...baseStep,
        name: "Extract Document Text",
        inputs: {
          artifact_ref: "{{ input.document }}",
          filename: "{{ input.?filename.orValue('') }}",
          content_type: "{{ input.?content_type.orValue('') }}",
        },
      }
    default:
      return baseStep
  }
}

export interface DefaultWorkflowTrigger {
  name: string
  type: string
  config: Record<string, never>
  isEnabled: boolean
}

export interface DefaultWorkflowDraft {
  name: string
  description: string
  isEnabled: boolean
  config: Record<string, never>
  triggers: DefaultWorkflowTrigger[]
  steps: DefaultWorkflowStep[]
}

export function createEmptyWorkflowDraft(): DefaultWorkflowDraft {
  return {
    name: "Untitled Workflow",
    description: "",
    isEnabled: true,
    config: {},
    triggers: [
      {
        name: "Manual Run",
        type: "manual",
        config: {},
        isEnabled: true,
      },
    ],
    steps: [createDefaultWorkflowStep("output", new Set())],
  }
}

export function collectWorkflowStepIds(
  steps: readonly WorkflowStepRef[],
  acc = new Set<string>()
): Set<string> {
  for (const s of steps) {
    acc.add(s.id)
    for (const c of s.cases ?? []) {
      collectWorkflowStepIds(c.steps ?? [], acc)
    }
    if (s.default) collectWorkflowStepIds(s.default, acc)
    if (s.steps) collectWorkflowStepIds(s.steps, acc)
  }
  return acc
}
