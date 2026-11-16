import { describe, expect, it } from "vitest"
import {
  AISettingsFormSchema,
  AgentFormSchema,
  CreateMCPServerSchema,
  CreateModelSchema,
  CreateProviderSchema,
  CreateThreadSchema,
  SendThreadTurnSchema,
  UpdateProviderSchema,
  UpdateThreadSchema,
} from "./index"

describe("@saturn/schemas/ai", () => {
  it("validates CreateProviderSchema with driver-specific rules", () => {
    expect(
      CreateProviderSchema.safeParse({
        name: "Google Gemini",
        driver: "gemini",
        apiKey: "AIza-test",
      }).success
    ).toBe(true)

    // Gemini requires API key
    expect(
      CreateProviderSchema.safeParse({
        name: "Google Gemini",
        driver: "gemini",
      }).success
    ).toBe(false)

    // Ollama does not require API key
    expect(
      CreateProviderSchema.safeParse({
        name: "Local Ollama",
        driver: "ollama",
        baseUrl: "http://localhost:11434",
      }).success
    ).toBe(true)

    // openai_compatible requires baseUrl
    expect(
      CreateProviderSchema.safeParse({
        name: "vLLM",
        driver: "openai_compatible",
      }).success
    ).toBe(false)

    // UpdateProviderSchema allows omitting secret
    expect(
      UpdateProviderSchema.safeParse({
        name: "Renamed Gemini",
        isEnabled: false,
      }).success
    ).toBe(true)
  })

  it("validates CreateModelSchema and AISettingsFormSchema", () => {
    expect(
      CreateModelSchema.safeParse({
        providerId: "prv_1",
        modelId: "gemini-2.5-flash",
        displayName: "Gemini 2.5 Flash",
        config: {
          temperature: 0.4,
          thinking: { enabled: true, effort: "medium" },
        },
      }).success
    ).toBe(true)

    expect(
      CreateModelSchema.safeParse({
        providerId: "prv_1",
        modelId: "bad",
        displayName: "Bad",
        config: { temperature: 3 },
      }).success
    ).toBe(false)

    const settings = AISettingsFormSchema.safeParse({
      models: { defaultModelId: "  mdl_1  ", fastModelId: "" },
      governance: { monthlyBudgetUsd: 50, runRetentionDays: 30 },
    })
    expect(settings.success).toBe(true)
    if (settings.success) {
      expect(settings.data.models.defaultModelId).toBe("mdl_1")
      expect(settings.data.models.fastModelId).toBeUndefined()
    }
  })

  it("validates CreateMCPServerSchema slug, URL, and bearer auth", () => {
    expect(
      CreateMCPServerSchema.safeParse({
        slug: "GitHub-MCP",
        name: "GitHub",
        url: "https://api.githubcopilot.com/mcp",
        authType: "bearer",
        bearerToken: "tok_123",
      }).success
    ).toBe(true)

    // Missing bearerToken when authType is bearer
    expect(
      CreateMCPServerSchema.safeParse({
        slug: "github",
        name: "GitHub",
        url: "https://api.githubcopilot.com/mcp",
        authType: "bearer",
      }).success
    ).toBe(false)

    // Invalid URL scheme
    expect(
      CreateMCPServerSchema.safeParse({
        slug: "bad",
        name: "Bad",
        url: "ftp://example.com",
      }).success
    ).toBe(false)
  })

  it("validates AgentFormSchema, Thread schemas, and SendThreadTurnSchema", () => {
    const agent = AgentFormSchema.safeParse({
      slug: "budget-coach",
      name: "Budget Coach",
      execution: {
        approvalPolicy: "confirm_writes",
        maxSteps: 12,
        timeoutSeconds: 90,
      },
      mcpBindings: [
        { mcpServerId: "mcp_saturn", allowedTools: ["finance_list_budgets"] },
      ],
    })
    expect(agent.success).toBe(true)

    expect(
      AgentFormSchema.safeParse({
        slug: "bad_slug!",
        name: "Bad",
      }).success
    ).toBe(false)

    expect(
      CreateThreadSchema.safeParse({
        title: "April review",
        approvalPolicy: "auto",
      }).success
    ).toBe(true)

    expect(
      UpdateThreadSchema.safeParse({
        isPinned: true,
      }).success
    ).toBe(true)

    expect(
      SendThreadTurnSchema.safeParse({
        content: "   ",
        attachments: [],
      }).success
    ).toBe(false)

    expect(
      SendThreadTurnSchema.safeParse({
        content: "",
        attachments: [
          {
            filename: "statement.pdf",
            contentType: "application/pdf",
            sizeBytes: 1024,
          },
        ],
      }).success
    ).toBe(true)
  })
})
