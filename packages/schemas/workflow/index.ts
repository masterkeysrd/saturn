import { z } from "zod"
import { isValidCronExpression } from "@saturn/core"
import { nonEmptyString } from "../common"
import { AI_MODEL_ROLES, GenerationConfigSchema } from "../ai"
import { schemaError, schemaMessage } from "../i18n"

export const TRIGGER_TYPES = ["event", "webhook", "schedule", "manual"] as const
export type WorkflowTriggerType = (typeof TRIGGER_TYPES)[number]

export const ERROR_POLICIES = ["fail", "continue"] as const
export type WorkflowErrorPolicy = (typeof ERROR_POLICIES)[number]

export const WORKFLOW_STEP_ID_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export const JSON_SCHEMA_FIELD_TYPES = [
  "string",
  "number",
  "integer",
  "boolean",
  "object",
  "array",
] as const
export type JsonSchemaFieldType = (typeof JSON_SCHEMA_FIELD_TYPES)[number]

export const ModelConfigSchema = z.object({
  modelId: z.string().trim().optional(),
  role: z.enum(AI_MODEL_ROLES).optional(),
  generation: GenerationConfigSchema.optional(),
})

export type ModelConfigValues = z.infer<typeof ModelConfigSchema>

export const FlowConfigSchema = z.object({
  defaultModel: ModelConfigSchema.optional(),
  timeoutSeconds: z
    .number()
    .int()
    .min(0, { error: schemaError("workflow.timeoutMin") })
    .optional(),
  maxRetries: z
    .number()
    .int()
    .min(0, { error: schemaError("workflow.maxRetriesMin") })
    .max(10, { error: schemaError("workflow.maxRetriesMax") })
    .optional(),
})

export type FlowConfigValues = z.infer<typeof FlowConfigSchema>

export const TriggerConfigSchema = z.object({
  topic: z.string().trim().optional(),
  cron: z.string().trim().optional(),
  scheduleId: z.string().trim().optional(),
  filter: z.string().optional(),
  inputMapping: z.record(z.string(), z.unknown()).optional(),
})

export type TriggerConfigValues = z.infer<typeof TriggerConfigSchema>

export const TriggerSchema = z
  .object({
    id: z.string().optional(),
    name: nonEmptyString("workflow.triggerNameRequired").max(255, {
      error: schemaError("workflow.triggerNameMaxLength"),
    }),
    type: z.enum(TRIGGER_TYPES),
    config: TriggerConfigSchema.optional().default({}),
    isEnabled: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    if (val.type === "event") {
      if (!val.config?.topic || !val.config.topic.trim()) {
        ctx.addIssue({
          code: "custom",
          message: schemaMessage("workflow.eventTriggerTopicRequired"),
          path: ["config", "topic"],
        })
      }
    }
    if (val.type === "schedule") {
      if (!val.config?.cron || !isValidCronExpression(val.config.cron)) {
        ctx.addIssue({
          code: "custom",
          message: schemaMessage("workflow.scheduleTriggerCronInvalid"),
          path: ["config", "cron"],
        })
      }
    }
  })

export type TriggerFormValues = z.infer<typeof TriggerSchema>

export const SourceBindingSchema = z.object({
  loader: nonEmptyString("workflow.loaderNameRequired"),
  params: z.record(z.string(), z.unknown()).optional(),
  required: z.boolean().optional(),
})

export type SourceBindingValues = z.infer<typeof SourceBindingSchema>

export interface SwitchCaseValues {
  name: string
  condition: string
  steps?: StepNodeValues[]
}

export interface StepNodeValues {
  id: string
  name?: string
  type: string
  onError?: WorkflowErrorPolicy
  model?: ModelConfigValues
  sources?: Record<string, SourceBindingValues>
  inputs?: Record<string, unknown>
  cases?: SwitchCaseValues[]
  default?: StepNodeValues[]
  steps?: StepNodeValues[]
}

export const SwitchCaseSchema: z.ZodType<SwitchCaseValues> = z.lazy(() =>
  z.object({
    name: nonEmptyString("workflow.switchCaseNameRequired"),
    condition: nonEmptyString("workflow.switchCaseConditionRequired"),
    steps: z.array(StepNodeSchema).optional(),
  })
)

export const StepNodeSchema: z.ZodType<StepNodeValues> = z.lazy(() =>
  z
    .object({
      id: nonEmptyString("workflow.stepIdRequired").regex(
        WORKFLOW_STEP_ID_REGEX,
        {
          error: schemaError("workflow.stepIdFormat"),
        }
      ),
      name: z.string().trim().optional(),
      type: nonEmptyString("workflow.stepTypeRequired"),
      onError: z.enum(ERROR_POLICIES).optional(),
      model: ModelConfigSchema.optional(),
      sources: z.record(z.string(), SourceBindingSchema).optional(),
      inputs: z.record(z.string(), z.unknown()).optional(),
      cases: z.array(SwitchCaseSchema).optional(),
      default: z.array(StepNodeSchema).optional(),
      steps: z.array(StepNodeSchema).optional(),
    })
    .superRefine((step, ctx) => {
      if (step.type === "filter") {
        const cond = step.inputs?.condition
        if (typeof cond !== "string" || !cond.trim()) {
          ctx.addIssue({
            code: "custom",
            message: schemaMessage("workflow.filterConditionRequired"),
            path: ["inputs", "condition"],
          })
        }
      }
      if (step.type === "switch") {
        if (!step.cases || step.cases.length === 0) {
          ctx.addIssue({
            code: "custom",
            message: schemaMessage("workflow.switchCaseRequired"),
            path: ["cases"],
          })
        } else {
          const seenNames = new Set<string>()
          step.cases.forEach((sc, idx) => {
            if (seenNames.has(sc.name)) {
              ctx.addIssue({
                code: "custom",
                message: schemaMessage("workflow.duplicateSwitchCase", {
                  name: sc.name,
                }),
                path: ["cases", idx, "name"],
              })
            }
            seenNames.add(sc.name)
          })
        }
      }
      if (step.type === "for_each") {
        const alias = step.inputs?.item_alias
        if (typeof alias !== "string" || !WORKFLOW_STEP_ID_REGEX.test(alias)) {
          ctx.addIssue({
            code: "custom",
            message: schemaMessage("workflow.forEachAliasInvalid"),
            path: ["inputs", "item_alias"],
          })
        }
        const items = step.inputs?.items
        if (
          items === undefined ||
          (typeof items === "string" && !items.trim())
        ) {
          ctx.addIssue({
            code: "custom",
            message: schemaMessage("workflow.forEachItemsRequired"),
            path: ["inputs", "items"],
          })
        }
      }
    })
)

function collectStepIDDuplicates(
  steps: StepNodeValues[],
  seen: Set<string>,
  ctx: z.RefinementCtx,
  basePath: (string | number)[]
) {
  steps.forEach((step, idx) => {
    if (seen.has(step.id)) {
      ctx.addIssue({
        code: "custom",
        message: schemaMessage("workflow.duplicateStepId", { id: step.id }),
        path: [...basePath, idx, "id"],
      })
    }
    seen.add(step.id)

    if (step.cases) {
      step.cases.forEach((sc, cIdx) => {
        if (sc.steps) {
          collectStepIDDuplicates(sc.steps, seen, ctx, [
            ...basePath,
            idx,
            "cases",
            cIdx,
            "steps",
          ])
        }
      })
    }
    if (step.default) {
      collectStepIDDuplicates(step.default, seen, ctx, [
        ...basePath,
        idx,
        "default",
      ])
    }
    if (step.steps) {
      collectStepIDDuplicates(step.steps, seen, ctx, [
        ...basePath,
        idx,
        "steps",
      ])
    }
  })
}

export const FlowSchema = z
  .object({
    name: nonEmptyString("workflow.workflowNameRequired").max(255, {
      error: schemaError("workflow.workflowNameMaxLength"),
    }),
    description: z.string().trim().optional().default(""),
    isEnabled: z.boolean().optional().default(true),
    config: FlowConfigSchema.optional(),
    inputSchema: z.record(z.string(), z.unknown()).optional(),
    triggers: z.array(TriggerSchema).optional().default([]),
    steps: z.array(StepNodeSchema).min(1, {
      error: schemaError("workflow.stepsRequired"),
    }),
  })
  .superRefine((flow, ctx) => {
    collectStepIDDuplicates(flow.steps, new Set<string>(), ctx, ["steps"])
  })

export type FlowFormValues = z.infer<typeof FlowSchema>

export interface JsonSchemaFieldValues {
  name: string
  type: JsonSchemaFieldType
  description?: string
  required: boolean
  enumValues?: string[]
  itemType?: JsonSchemaFieldType
  properties?: JsonSchemaFieldValues[]
}

export const JsonSchemaFieldSchema: z.ZodType<JsonSchemaFieldValues> = z.lazy(
  () =>
    z.object({
      name: nonEmptyString("workflow.fieldNameRequired").regex(
        WORKFLOW_STEP_ID_REGEX,
        { error: schemaError("workflow.fieldNameFormat") }
      ),
      type: z.enum(JSON_SCHEMA_FIELD_TYPES),
      description: z.string().trim().optional(),
      required: z.boolean().default(false),
      enumValues: z.array(z.string()).optional(),
      itemType: z.enum(JSON_SCHEMA_FIELD_TYPES).optional(),
      properties: z.array(JsonSchemaFieldSchema).optional(),
    })
)

export const JsonSchemaEditorSchema = z.object({
  fields: z.array(JsonSchemaFieldSchema).superRefine((fields, ctx) => {
    const seen = new Set<string>()
    fields.forEach((f, idx) => {
      if (seen.has(f.name)) {
        ctx.addIssue({
          code: "custom",
          message: schemaMessage("workflow.duplicateField", { name: f.name }),
          path: [idx, "name"],
        })
      }
      seen.add(f.name)
    })
  }),
})

export type JsonSchemaEditorValues = z.infer<typeof JsonSchemaEditorSchema>

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val)
}

/**
 * Converts a list of visual JSON Schema field definitions into a standard JSON Schema object.
 */
export function fieldsToJsonSchema(
  fields: JsonSchemaFieldValues[]
): Record<string, unknown> {
  const properties: Record<string, Record<string, unknown>> = {}
  const required: string[] = []

  for (const field of fields) {
    const prop: Record<string, unknown> = { type: field.type }
    if (field.description) {
      prop.description = field.description
    }
    if (field.enumValues && field.enumValues.length > 0) {
      prop.enum = field.enumValues
    }
    if (field.type === "array" && field.itemType) {
      prop.items = { type: field.itemType }
    }
    if (
      field.type === "object" &&
      field.properties &&
      field.properties.length > 0
    ) {
      const nested = fieldsToJsonSchema(field.properties)
      prop.properties = nested.properties
      if (Array.isArray(nested.required) && nested.required.length > 0) {
        prop.required = nested.required
      }
    }
    properties[field.name] = prop
    if (field.required) {
      required.push(field.name)
    }
  }

  const schema: Record<string, unknown> = {
    type: "object",
    properties,
  }
  if (required.length > 0) {
    schema.required = required
  }
  return schema
}

/**
 * Converts a standard JSON Schema `object` into editable field rows.
 */
export function jsonSchemaToFields(
  schema: Record<string, unknown> | undefined
): JsonSchemaFieldValues[] {
  if (!schema || !isPlainRecord(schema.properties)) {
    return []
  }
  const requiredSet = new Set<string>(
    Array.isArray(schema.required)
      ? schema.required.filter((x): x is string => typeof x === "string")
      : []
  )

  const fields: JsonSchemaFieldValues[] = []
  for (const [name, rawProp] of Object.entries(schema.properties)) {
    if (!isPlainRecord(rawProp)) continue
    const rawType = rawProp.type
    const type: JsonSchemaFieldType =
      typeof rawType === "string" &&
      (JSON_SCHEMA_FIELD_TYPES as readonly string[]).includes(rawType)
        ? (rawType as JsonSchemaFieldType)
        : "string"

    const field: JsonSchemaFieldValues = {
      name,
      type,
      required: requiredSet.has(name),
    }

    if (typeof rawProp.description === "string") {
      field.description = rawProp.description
    }
    if (Array.isArray(rawProp.enum)) {
      field.enumValues = rawProp.enum.filter(
        (x): x is string => typeof x === "string"
      )
    }
    if (type === "array" && isPlainRecord(rawProp.items)) {
      const it = rawProp.items.type
      if (
        typeof it === "string" &&
        (JSON_SCHEMA_FIELD_TYPES as readonly string[]).includes(it)
      ) {
        field.itemType = it as JsonSchemaFieldType
      }
    }
    if (type === "object" && isPlainRecord(rawProp.properties)) {
      field.properties = jsonSchemaToFields(rawProp)
    }

    fields.push(field)
  }
  return fields
}
