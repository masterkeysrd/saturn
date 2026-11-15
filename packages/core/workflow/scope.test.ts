import { describe, expect, it } from "vitest"
import { discoverVariablesAtStep, flattenJsonSchemaFields } from "./scope"
import type { WorkflowStepRef } from "./scope"

describe("workflow lexical scope discovery", () => {
  const sampleSteps: WorkflowStepRef[] = [
    {
      id: "classify",
      name: "Classify",
      type: "llm.generate",
      inputs: {
        prompt: "Classify",
        output_schema: {
          type: "object",
          properties: {
            category: { type: "string", description: "Document category" },
            confidence: { type: "number" },
          },
        },
      },
    },
    {
      id: "branch",
      type: "switch",
      cases: [
        {
          name: "receipt_case",
          condition: "steps.classify.category == 'receipt'",
          steps: [
            {
              id: "extract_receipt",
              type: "transform",
              inputs: { vendor: "{{ input.vendor }}", total: 100 },
            },
          ],
        },
        {
          name: "invoice_case",
          condition: "steps.classify.category == 'invoice'",
          steps: [
            {
              id: "extract_invoice",
              type: "transform",
              inputs: { invoice_no: "INV-1" },
              sources: {
                accounts: { loader: "finance.accounts" },
              },
            },
          ],
        },
      ],
    },
    {
      id: "each_line",
      type: "for_each",
      inputs: {
        items: "input.lines",
        item_alias: "line",
      },
      steps: [
        {
          id: "process_line",
          type: "transform",
          inputs: { amount: "{{ loop.line.item.amount }}" },
        },
      ],
    },
  ]

  it("flattens nested JSON Schema fields up to maxDepth", () => {
    const fields = flattenJsonSchemaFields(
      {
        type: "object",
        properties: {
          vendor: { type: "string", description: "Merchant name" },
          meta: {
            type: "object",
            properties: {
              source: { type: "string" },
            },
          },
        },
      },
      "input"
    )

    expect(fields).toEqual([
      { path: "input.vendor", type: "string", description: "Merchant name" },
      { path: "input.meta", type: "object", description: undefined },
      { path: "input.meta.source", type: "string", description: undefined },
    ])
  })

  it("discovers upstream steps and step-local sources without leaking sibling switch branches", () => {
    const vars = discoverVariablesAtStep({
      steps: sampleSteps,
      targetStepId: "extract_invoice",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string" },
        },
      },
      triggerPayloadSchema: {
        type: "object",
        properties: {
          subject: { type: "string" },
        },
      },
      loaderDescriptors: {
        "finance.accounts": {
          outputSchema: {
            type: "array",
          },
        },
      },
    })

    const paths = vars.map((v) => v.path)
    expect(paths).toContain("input.text")
    expect(paths).toContain("trigger.data.subject")
    expect(paths).toContain("steps.classify.category")
    expect(paths).toContain("steps.classify.confidence")
    expect(paths).toContain("sources.accounts")
    expect(paths).not.toContain("steps.extract_receipt")
    expect(paths).not.toContain("steps.each_line")
    expect(paths).not.toContain("loop.line.item")
  })

  it("includes enclosing loop.<alias>.item and loop.<alias>.index inside for_each", () => {
    const vars = discoverVariablesAtStep({
      steps: sampleSteps,
      targetStepId: "process_line",
    })

    const paths = vars.map((v) => v.path)
    expect(paths).toContain("loop.line.item")
    expect(paths).toContain("loop.line.index")
    expect(paths).toContain("steps.classify")
  })
})
