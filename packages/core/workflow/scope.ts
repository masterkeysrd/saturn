export interface WorkflowSourceRef {
  loader: string
  params?: Record<string, unknown>
  required?: boolean
}

export interface WorkflowSwitchCaseRef {
  name: string
  condition: string
  steps?: WorkflowStepRef[]
}

export interface WorkflowStepRef {
  id: string
  name?: string
  type: string
  sources?: Record<string, WorkflowSourceRef>
  inputs?: Record<string, unknown>
  cases?: WorkflowSwitchCaseRef[]
  default?: WorkflowStepRef[]
  steps?: WorkflowStepRef[]
}

export type WorkflowVariableGroup =
  "input" | "trigger" | "step" | "loop" | "source" | "space" | "run"

export interface WorkflowVariable {
  path: string
  label: string
  group: WorkflowVariableGroup
  type?: string
  description?: string
  stepId?: string
  alias?: string
}

export interface DiscoverVariablesParams {
  steps: WorkflowStepRef[]
  targetStepId?: string
  inputSchema?: Record<string, unknown>
  triggerPayloadSchema?: Record<string, unknown>
  stepDescriptors?: Record<string, { outputSchema?: Record<string, unknown> }>
  loaderDescriptors?: Record<string, { outputSchema?: Record<string, unknown> }>
}

interface SchemaFieldInfo {
  path: string
  type: string
  description?: string
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val)
}

function formatSchemaType(schema: Record<string, unknown>): string {
  const t = schema.type
  if (typeof t === "string") return t
  if (Array.isArray(t)) {
    return t.filter((x): x is string => typeof x === "string").join(" | ")
  }
  return "any"
}

/**
 * Flattens a JSON Schema `object` definition into dotted variable paths.
 */
export function flattenJsonSchemaFields(
  schema: Record<string, unknown> | undefined,
  prefix: string,
  maxDepth = 3
): SchemaFieldInfo[] {
  if (!schema || maxDepth <= 0) return []
  const props = schema.properties
  if (!isRecord(props)) return []

  const results: SchemaFieldInfo[] = []
  for (const [key, rawProp] of Object.entries(props)) {
    if (!isRecord(rawProp)) continue
    const path = prefix ? `${prefix}.${key}` : key
    const type = formatSchemaType(rawProp)
    const description =
      typeof rawProp.description === "string" ? rawProp.description : undefined

    results.push({ path, type, description })

    if (isRecord(rawProp.properties) && maxDepth > 1) {
      results.push(...flattenJsonSchemaFields(rawProp, path, maxDepth - 1))
    }
  }
  return results
}

interface ActiveLoopScope {
  alias: string
}

interface ScopeResolution {
  found: boolean
  upstreamSteps: WorkflowStepRef[]
  loops: ActiveLoopScope[]
  targetStep?: WorkflowStepRef
}

function findStepScope(
  steps: WorkflowStepRef[],
  targetStepId: string,
  inheritedUpstream: WorkflowStepRef[],
  inheritedLoops: ActiveLoopScope[]
): ScopeResolution {
  const upstream = [...inheritedUpstream]

  for (const step of steps) {
    if (step.id === targetStepId) {
      return {
        found: true,
        upstreamSteps: upstream,
        loops: inheritedLoops,
        targetStep: step,
      }
    }

    if (step.type === "switch" && Array.isArray(step.cases)) {
      const branchUpstream = [...upstream, step]
      for (const sc of step.cases) {
        if (sc.steps && sc.steps.length > 0) {
          const res = findStepScope(
            sc.steps,
            targetStepId,
            branchUpstream,
            inheritedLoops
          )
          if (res.found) return res
        }
      }
      if (step.default && step.default.length > 0) {
        const res = findStepScope(
          step.default,
          targetStepId,
          branchUpstream,
          inheritedLoops
        )
        if (res.found) return res
      }
    }

    if (step.type === "for_each" && Array.isArray(step.steps)) {
      const rawAlias = step.inputs?.item_alias
      const alias =
        typeof rawAlias === "string" && rawAlias.trim()
          ? rawAlias.trim()
          : "item"
      const res = findStepScope(step.steps, targetStepId, upstream, [
        ...inheritedLoops,
        { alias },
      ])
      if (res.found) return res
    }

    upstream.push(step)
  }

  return {
    found: false,
    upstreamSteps: upstream,
    loops: inheritedLoops,
  }
}

function inferStepOutputSchema(
  step: WorkflowStepRef,
  stepDescriptors?: Record<string, { outputSchema?: Record<string, unknown> }>
): Record<string, unknown> | undefined {
  if (step.type === "llm.generate") {
    const inlineSchema = step.inputs?.output_schema
    if (isRecord(inlineSchema)) {
      return inlineSchema
    }
    return {
      type: "object",
      properties: {
        text: { type: "string", description: "Generated model text" },
      },
    }
  }

  if (step.type === "transform" && isRecord(step.inputs)) {
    const properties: Record<string, unknown> = {}
    for (const key of Object.keys(step.inputs)) {
      properties[key] = { type: "any" }
    }
    return { type: "object", properties }
  }

  return stepDescriptors?.[step.type]?.outputSchema
}

/**
 * Discovers all CEL variables lexically visible at `targetStepId` (or at the end of `steps` if omitted).
 */
export function discoverVariablesAtStep(
  params: DiscoverVariablesParams
): WorkflowVariable[] {
  const vars: WorkflowVariable[] = []

  // 1. Space & Run globals
  vars.push(
    { path: "space.id", label: "space.id", group: "space", type: "string" },
    { path: "space.name", label: "space.name", group: "space", type: "string" },
    {
      path: "space.timezone",
      label: "space.timezone",
      group: "space",
      type: "string",
    },
    {
      path: "space.default_currency",
      label: "space.default_currency",
      group: "space",
      type: "string",
    },
    { path: "run.id", label: "run.id", group: "run", type: "string" },
    { path: "run.flow_id", label: "run.flow_id", group: "run", type: "string" },
    { path: "run.mode", label: "run.mode", group: "run", type: "string" },
    { path: "run.now", label: "run.now", group: "run", type: "timestamp" }
  )

  // 2. Flow input.*
  const inputFields = flattenJsonSchemaFields(params.inputSchema, "input")
  if (inputFields.length > 0) {
    for (const f of inputFields) {
      vars.push({
        path: f.path,
        label: f.path,
        group: "input",
        type: f.type,
        description: f.description,
      })
    }
  } else {
    vars.push({ path: "input", label: "input", group: "input", type: "object" })
  }

  // 3. Trigger trigger.data.*
  vars.push(
    {
      path: "trigger.id",
      label: "trigger.id",
      group: "trigger",
      type: "string",
    },
    {
      path: "trigger.type",
      label: "trigger.type",
      group: "trigger",
      type: "string",
    },
    {
      path: "trigger.topic",
      label: "trigger.topic",
      group: "trigger",
      type: "string",
    }
  )
  const triggerFields = flattenJsonSchemaFields(
    params.triggerPayloadSchema,
    "trigger.data"
  )
  if (triggerFields.length > 0) {
    for (const f of triggerFields) {
      vars.push({
        path: f.path,
        label: f.path,
        group: "trigger",
        type: f.type,
        description: f.description,
      })
    }
  } else {
    vars.push({
      path: "trigger.data",
      label: "trigger.data",
      group: "trigger",
      type: "object",
    })
  }

  // 4. Lexical scope resolution
  const resolution = params.targetStepId
    ? findStepScope(params.steps, params.targetStepId, [], [])
    : {
        found: true,
        upstreamSteps: params.steps,
        loops: [],
        targetStep: undefined,
      }

  for (const upstream of resolution.upstreamSteps) {
    const basePath = `steps.${upstream.id}`
    vars.push({
      path: basePath,
      label: upstream.name ? `${upstream.name} (${basePath})` : basePath,
      group: "step",
      type: "object",
      stepId: upstream.id,
    })

    const outSchema = inferStepOutputSchema(upstream, params.stepDescriptors)
    for (const f of flattenJsonSchemaFields(outSchema, basePath)) {
      vars.push({
        path: f.path,
        label: f.path,
        group: "step",
        type: f.type,
        description: f.description,
        stepId: upstream.id,
      })
    }
  }

  // 5. Enclosing for_each loop aliases
  for (const l of resolution.loops) {
    vars.push(
      {
        path: `loop.${l.alias}.item`,
        label: `loop.${l.alias}.item`,
        group: "loop",
        type: "any",
        alias: l.alias,
      },
      {
        path: `loop.${l.alias}.index`,
        label: `loop.${l.alias}.index`,
        group: "loop",
        type: "integer",
        alias: l.alias,
      }
    )
  }

  // 6. Step-local sources.<alias>
  if (resolution.targetStep?.sources) {
    for (const [alias, binding] of Object.entries(
      resolution.targetStep.sources
    )) {
      const basePath = `sources.${alias}`
      vars.push({
        path: basePath,
        label: `${basePath} (${binding.loader})`,
        group: "source",
        type: "any",
        alias,
      })

      const loaderSchema =
        params.loaderDescriptors?.[binding.loader]?.outputSchema
      for (const f of flattenJsonSchemaFields(loaderSchema, basePath)) {
        vars.push({
          path: f.path,
          label: f.path,
          group: "source",
          type: f.type,
          description: f.description,
          alias,
        })
      }
    }
  }

  return vars
}
