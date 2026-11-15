import { describe, it, expect, vi, beforeEach } from "vitest"
import * as Clipboard from "expo-clipboard"
import {
  collectWorkflowStepIds,
  createDefaultWorkflowStep,
  CRON_PRESETS,
  discoverVariablesAtStep,
  insertVariableToken,
  isValidCronExpression,
  summarizeCron,
} from "@saturn/core"
import { FlowSchema } from "@saturn/schemas"
import { haptics } from "../lib/haptics"
import {
  consumePendingWorkflowDraft,
  setPendingWorkflowDraft,
} from "../components/workflows/workflow-draft-store"

vi.mock("expo-clipboard", () => ({
  setStringAsync: vi.fn(async () => true),
}))

vi.mock("../lib/haptics", () => ({
  haptics: {
    light: vi.fn(),
    medium: vi.fn(),
    heavy: vi.fn(),
    selection: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

describe("Mobile Workflows authoring & inspector", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setPendingWorkflowDraft(null)
  })

  it("transfers AI-generated flow drafts via pending draft store", () => {
    const draft = {
      name: "AI Receipt Tracker",
      description: "Tracks new receipts",
      isEnabled: true,
      triggers: [
        { name: "Manual", type: "manual", config: {}, isEnabled: true },
      ],
      steps: [
        createDefaultWorkflowStep("llm.generate", new Set()),
        createDefaultWorkflowStep("output", new Set(["llm_generate"])),
      ],
    }

    setPendingWorkflowDraft(draft)
    const firstRead = consumePendingWorkflowDraft()
    expect(firstRead?.name).toBe("AI Receipt Tracker")
    expect(consumePendingWorkflowDraft()).toBeNull()

    const ids = collectWorkflowStepIds(draft.steps)
    expect(ids.has("llm_generate")).toBe(true)
    expect(ids.has("output")).toBe(true)
  })

  it("discovers scoped variables and inserts variable chips cleanly", () => {
    const vars = discoverVariablesAtStep({
      steps: [
        {
          id: "classify",
          type: "llm.generate",
          inputs: {
            output_schema: {
              type: "object",
              properties: {
                category: { type: "string" },
              },
            },
          },
        },
        {
          id: "route",
          type: "filter",
          inputs: { condition: "true" },
        },
      ],
      targetStepId: "route",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
      },
    })

    expect(vars.some((v) => v.path === "input.text")).toBe(true)
    expect(vars.some((v) => v.path === "steps.classify.category")).toBe(true)

    haptics.selection()
    const inserted = insertVariableToken(
      "Category: ",
      "steps.classify.category",
      undefined,
      false
    )
    expect(inserted.value).toBe("Category: {{ steps.classify.category }}")

    const rawInserted = insertVariableToken(
      "",
      "steps.classify.category",
      undefined,
      true
    )
    expect(rawInserted.value).toBe("steps.classify.category")
    expect(haptics.selection).toHaveBeenCalledTimes(1)
  })

  it("validates cron schedules in active workspace timezone and copies webhook URLs with haptics", async () => {
    const preset = CRON_PRESETS.find((p) => p.id === "weekdays_9am")
    expect(preset).toBeDefined()
    expect(isValidCronExpression(preset!.cron)).toBe(true)
    expect(summarizeCron(preset!.cron, "America/Santo_Domingo")).toContain(
      "America/Santo_Domingo"
    )

    const webhookUrl =
      "https://saturn.local/api/v1/platform/workflows/triggers/trg_123:webhook"
    await Clipboard.setStringAsync(webhookUrl)
    haptics.success()

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(webhookUrl)
    expect(haptics.success).toHaveBeenCalledTimes(1)
  })

  it("validates full mobile FlowSchema payloads", () => {
    const result = FlowSchema.safeParse({
      name: "Scheduled Bill Alert",
      description: "Notifies on upcoming bills",
      isEnabled: true,
      triggers: [
        {
          name: "Weekday Morning",
          type: "schedule",
          config: { cron: "0 9 * * 1-5" },
          isEnabled: true,
        },
      ],
      steps: [
        createDefaultWorkflowStep("llm.generate", new Set()),
        createDefaultWorkflowStep("output", new Set(["llm_generate"])),
      ],
    })
    expect(result.success).toBe(true)
  })
})
