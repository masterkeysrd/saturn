import { describe, expect, it } from "vitest"
import {
  FlowSchema,
  JsonSchemaEditorSchema,
  ModelConfigSchema,
  SourceBindingSchema,
  StepNodeSchema,
  TriggerSchema,
  fieldsToJsonSchema,
  jsonSchemaToFields,
} from "./index"

describe("workflow Zod schemas", () => {
  it("validates ModelConfig role and generation bounds", () => {
    expect(
      ModelConfigSchema.safeParse({
        modelId: "mdl_1",
        generation: { temperature: 0.2 },
      }).success
    ).toBe(true)
    expect(
      ModelConfigSchema.safeParse({
        role: "fast",
      }).success
    ).toBe(true)
    expect(
      ModelConfigSchema.safeParse({
        role: "turbo",
      }).success
    ).toBe(false)
    expect(
      ModelConfigSchema.safeParse({ generation: { temperature: 2.5 } }).success
    ).toBe(false)
    expect(
      ModelConfigSchema.safeParse({ generation: { temperature: -0.1 } }).success
    ).toBe(false)
  })

  it("validates Trigger rules by type (event topic and schedule cron)", () => {
    expect(
      TriggerSchema.safeParse({
        name: "Mail Delta",
        type: "event",
        config: { topic: "mail.message.received" },
      }).success
    ).toBe(true)

    expect(
      TriggerSchema.safeParse({
        name: "Missing Topic",
        type: "event",
        config: {},
      }).success
    ).toBe(false)

    expect(
      TriggerSchema.safeParse({
        name: "Daily Digest",
        type: "schedule",
        config: { cron: "0 9 * * *" },
      }).success
    ).toBe(true)

    expect(
      TriggerSchema.safeParse({
        name: "Bad Cron",
        type: "schedule",
        config: { cron: "99 * * * *" },
      }).success
    ).toBe(false)
  })

  it("validates SourceBinding and StepNode control steps (filter, switch, for_each)", () => {
    expect(
      SourceBindingSchema.safeParse({ loader: "finance.accounts" }).success
    ).toBe(true)
    expect(SourceBindingSchema.safeParse({ loader: "" }).success).toBe(false)

    expect(
      StepNodeSchema.safeParse({
        id: "guard",
        type: "filter",
        inputs: { condition: "steps.classify.category != 'ignore'" },
      }).success
    ).toBe(true)
    expect(
      StepNodeSchema.safeParse({
        id: "guard",
        type: "filter",
        inputs: {},
      }).success
    ).toBe(false)

    expect(
      StepNodeSchema.safeParse({
        id: "route",
        type: "switch",
        cases: [
          {
            name: "a",
            condition: "true",
            steps: [{ id: "nested_step", type: "transform" }],
          },
        ],
      }).success
    ).toBe(true)
    expect(
      StepNodeSchema.safeParse({
        id: "route",
        type: "switch",
        cases: [],
      }).success
    ).toBe(false)

    expect(
      StepNodeSchema.safeParse({
        id: "each_row",
        type: "for_each",
        inputs: { items: "input.items", item_alias: "row" },
        steps: [{ id: "inner", type: "transform" }],
      }).success
    ).toBe(true)
  })

  it("validates complete Flow and rejects duplicate nested step IDs", () => {
    const valid = FlowSchema.safeParse({
      name: "Receipt Ingestion",
      description: "Extracts receipts from incoming mail",
      config: {
        defaultModel: { modelName: "gemini-2.5-flash", temperature: 0.1 },
        timeoutSeconds: 120,
        maxRetries: 3,
      },
      triggers: [
        {
          name: "Mail Trigger",
          type: "event",
          config: { topic: "mail.message.received" },
          isEnabled: true,
        },
      ],
      steps: [
        {
          id: "classify",
          type: "llm.generate",
          inputs: { prompt: "Classify {{ input.text }}" },
        },
        {
          id: "route",
          type: "switch",
          cases: [
            {
              name: "receipt",
              condition: "steps.classify.category == 'receipt'",
              steps: [{ id: "stage", type: "finance.create_inbox_item" }],
            },
          ],
        },
      ],
    })
    expect(valid.success).toBe(true)

    const dup = FlowSchema.safeParse({
      name: "Duplicate IDs",
      steps: [
        { id: "classify", type: "llm.generate" },
        {
          id: "route",
          type: "switch",
          cases: [
            {
              name: "c1",
              condition: "true",
              steps: [{ id: "classify", type: "transform" }],
            },
          ],
        },
      ],
    })
    expect(dup.success).toBe(false)
  })

  it("round-trips JSON Schema editor fields to/from standard JSON Schema", () => {
    const fields = [
      {
        name: "vendor",
        type: "string" as const,
        description: "Merchant name",
        required: true,
      },
      {
        name: "amount",
        type: "number" as const,
        required: true,
      },
      {
        name: "tags",
        type: "array" as const,
        required: false,
        itemType: "string" as const,
      },
      {
        name: "meta",
        type: "object" as const,
        required: false,
        properties: [
          { name: "note", type: "string" as const, required: false },
        ],
      },
    ]

    expect(JsonSchemaEditorSchema.safeParse({ fields }).success).toBe(true)

    const schema = fieldsToJsonSchema(fields)
    expect(schema).toEqual({
      type: "object",
      properties: {
        vendor: { type: "string", description: "Merchant name" },
        amount: { type: "number" },
        tags: { type: "array", items: { type: "string" } },
        meta: {
          type: "object",
          properties: {
            note: { type: "string" },
          },
        },
      },
      required: ["vendor", "amount"],
    })

    const roundTripped = jsonSchemaToFields(schema)
    expect(roundTripped).toEqual(fields)

    expect(
      JsonSchemaEditorSchema.safeParse({
        fields: [
          { name: "dup", type: "string", required: false },
          { name: "dup", type: "number", required: true },
        ],
      }).success
    ).toBe(false)
  })
})
