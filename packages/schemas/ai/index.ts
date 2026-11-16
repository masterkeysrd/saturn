import { z } from "zod"
import { nonEmptyString } from "../common"

export const AI_PROVIDER_DRIVERS = [
  "gemini",
  "openai",
  "anthropic",
  "openrouter",
  "ollama",
  "openai_compatible",
] as const
export type AIProviderDriver = (typeof AI_PROVIDER_DRIVERS)[number]

export const AI_MODEL_ROLES = ["default", "fast", "reasoning"] as const
export type AIModelRole = (typeof AI_MODEL_ROLES)[number]

export const AI_THINKING_EFFORTS = ["low", "medium", "high"] as const
export type AIThinkingEffort = (typeof AI_THINKING_EFFORTS)[number]

export const AI_APPROVAL_POLICIES = [
  "confirm_writes",
  "auto",
  "deny_writes",
] as const
export type AIApprovalPolicy = (typeof AI_APPROVAL_POLICIES)[number]

export const AI_MCP_AUTH_TYPES = ["none", "bearer", "custom_headers"] as const
export type AIMCPAuthType = (typeof AI_MCP_AUTH_TYPES)[number]

export const AI_ATTACHMENT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/csv",
  "text/plain",
] as const

export const AI_MAX_ATTACHMENTS_PER_TURN = 5
export const AI_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

export const AI_SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/

const optionalTrimmedString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional()

function isValidHTTPUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

export const ThinkingConfigSchema = z.object({
  enabled: z.boolean().default(false),
  effort: z.enum(AI_THINKING_EFFORTS).optional(),
  budgetTokens: z
    .number()
    .int()
    .min(0, { error: "Budget tokens must be >= 0" })
    .optional(),
})
export type ThinkingConfigValues = z.infer<typeof ThinkingConfigSchema>

export const GenerationConfigSchema = z.object({
  temperature: z
    .number()
    .min(0, { error: "Temperature must be >= 0" })
    .max(2, { error: "Temperature must be <= 2" })
    .optional(),
  maxTokens: z
    .number()
    .int()
    .min(1, { error: "Max tokens must be > 0" })
    .optional(),
  topP: z
    .number()
    .min(0, { error: "Top-P must be >= 0" })
    .max(1, { error: "Top-P must be <= 1" })
    .optional(),
  thinking: ThinkingConfigSchema.optional(),
})
export type GenerationConfigValues = z.infer<typeof GenerationConfigSchema>

export const AISettingsFormSchema = z.object({
  models: z
    .object({
      defaultModelId: optionalTrimmedString,
      fastModelId: optionalTrimmedString,
      reasoningModelId: optionalTrimmedString,
    })
    .default({}),
  governance: z
    .object({
      monthlyBudgetUsd: z
        .number()
        .min(0, { error: "Monthly budget must be >= 0" })
        .optional(),
      runRetentionDays: z
        .number()
        .int()
        .min(0, { error: "Retention days must be >= 0" })
        .default(90),
    })
    .default({ runRetentionDays: 90 }),
})
export type AISettingsFormValues = z.infer<typeof AISettingsFormSchema>

const BaseProviderSchema = z.object({
  name: nonEmptyString("Provider name is required").pipe(
    z.string().max(255, { error: "Provider name cannot exceed 255 characters" })
  ),
  driver: z.enum(AI_PROVIDER_DRIVERS),
  baseUrl: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidHTTPUrl(v), {
      error: "Base URL must be a valid http or https URL",
    })
    .optional(),
  apiKey: z.string().trim().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  isEnabled: z.boolean().default(true),
})

export const CreateProviderSchema = BaseProviderSchema.superRefine(
  (val, ctx) => {
    const requiresKey =
      val.driver !== "ollama" && val.driver !== "openai_compatible"
    if (requiresKey && (!val.apiKey || !val.apiKey.trim())) {
      ctx.addIssue({
        code: "custom",
        message: `API key is required for ${val.driver}`,
        path: ["apiKey"],
      })
    }
    if (
      val.driver === "openai_compatible" &&
      (!val.baseUrl || !val.baseUrl.trim())
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Base URL is required for OpenAI-compatible providers",
        path: ["baseUrl"],
      })
    }
  }
)
export type CreateProviderValues = z.infer<typeof CreateProviderSchema>

export const UpdateProviderSchema = BaseProviderSchema.partial().extend({
  name: nonEmptyString("Provider name is required").pipe(
    z.string().max(255, { error: "Provider name cannot exceed 255 characters" })
  ),
})
export type UpdateProviderValues = z.infer<typeof UpdateProviderSchema>

export const ModelProfileSchema = z.object({
  capabilities: z
    .object({
      toolCalling: z.boolean().default(false),
      vision: z.boolean().default(false),
      document: z.boolean().default(false),
      audio: z.boolean().default(false),
      reasoning: z.boolean().default(false),
      structuredOutput: z.boolean().default(false),
      streaming: z.boolean().default(true),
    })
    .optional(),
  limits: z
    .object({
      contextWindow: z.number().int().min(0).default(0),
      maxOutputTokens: z.number().int().min(0).default(0),
    })
    .optional(),
  pricing: z
    .object({
      inputPerMillionUsd: z.number().min(0).default(0),
      outputPerMillionUsd: z.number().min(0).default(0),
      cachedInputPerMillionUsd: z.number().min(0).default(0),
    })
    .optional(),
})

export const CreateModelSchema = z.object({
  providerId: nonEmptyString("Provider is required"),
  modelId: nonEmptyString("Model ID is required").pipe(
    z.string().max(200, { error: "Model ID cannot exceed 200 characters" })
  ),
  displayName: nonEmptyString("Display name is required").pipe(
    z.string().max(255, { error: "Display name cannot exceed 255 characters" })
  ),
  profile: ModelProfileSchema.optional(),
  config: GenerationConfigSchema.optional(),
  isEnabled: z.boolean().default(true),
})
export type CreateModelValues = z.infer<typeof CreateModelSchema>

export const UpdateModelSchema = z.object({
  displayName: nonEmptyString("Display name is required").pipe(
    z.string().max(255, { error: "Display name cannot exceed 255 characters" })
  ),
  profile: ModelProfileSchema.optional(),
  config: GenerationConfigSchema.optional(),
  isEnabled: z.boolean().default(true),
})
export type UpdateModelValues = z.infer<typeof UpdateModelSchema>

const SlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, { error: "Slug is required" })
  .max(100, { error: "Slug cannot exceed 100 characters" })
  .regex(AI_SLUG_REGEX, {
    error: "Slug must contain lowercase letters, numbers, and hyphens only",
  })

const BaseMCPServerSchema = z.object({
  slug: SlugSchema,
  name: nonEmptyString("MCP server name is required").pipe(
    z.string().max(255, { error: "Name cannot exceed 255 characters" })
  ),
  description: z.string().trim().optional().default(""),
  url: nonEmptyString("MCP server URL is required").refine(isValidHTTPUrl, {
    error: "URL must be a valid http or https endpoint",
  }),
  authType: z.enum(AI_MCP_AUTH_TYPES).default("none"),
  trustReadHints: z.boolean().default(true),
  timeoutSeconds: z
    .number()
    .int()
    .min(1, { error: "Timeout must be >= 1 second" })
    .max(300, { error: "Timeout cannot exceed 300 seconds" })
    .default(30),
  bearerToken: z.string().trim().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  isEnabled: z.boolean().default(true),
})

export const CreateMCPServerSchema = BaseMCPServerSchema.superRefine(
  (val, ctx) => {
    if (
      val.authType === "bearer" &&
      (!val.bearerToken || !val.bearerToken.trim())
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Bearer token is required when auth type is bearer",
        path: ["bearerToken"],
      })
    }
  }
)
export type CreateMCPServerValues = z.infer<typeof CreateMCPServerSchema>

export const UpdateMCPServerSchema = BaseMCPServerSchema.partial().extend({
  name: nonEmptyString("MCP server name is required").pipe(
    z.string().max(255, { error: "Name cannot exceed 255 characters" })
  ),
})
export type UpdateMCPServerValues = z.infer<typeof UpdateMCPServerSchema>

export const MCPBindingSchema = z.object({
  mcpServerId: nonEmptyString("MCP server ID is required"),
  allowedTools: z
    .array(nonEmptyString("Tool name cannot be empty"))
    .default([]),
})
export type MCPBindingValues = z.infer<typeof MCPBindingSchema>

export const ExecutionConfigSchema = z.object({
  approvalPolicy: z.enum(AI_APPROVAL_POLICIES).default("confirm_writes"),
  maxSteps: z
    .number()
    .int()
    .min(1, { error: "Max steps must be >= 1" })
    .max(50, { error: "Max steps cannot exceed 50" })
    .default(10),
  timeoutSeconds: z
    .number()
    .int()
    .min(1, { error: "Timeout must be >= 1 second" })
    .max(1800, { error: "Timeout cannot exceed 1800 seconds" })
    .default(300),
})
export type ExecutionConfigValues = z.infer<typeof ExecutionConfigSchema>

export const AgentFormSchema = z.object({
  slug: SlugSchema,
  name: nonEmptyString("Agent name is required").pipe(
    z.string().max(255, { error: "Name cannot exceed 255 characters" })
  ),
  description: z.string().trim().optional().default(""),
  tags: z.array(nonEmptyString("Tag cannot be empty")).default([]),
  modelId: optionalTrimmedString,
  icon: z.string().trim().min(1).default("bot"),
  systemInstruction: z.string().optional(),
  generation: GenerationConfigSchema.optional(),
  execution: ExecutionConfigSchema.default({
    approvalPolicy: "confirm_writes",
    maxSteps: 10,
    timeoutSeconds: 300,
  }),
  mcpBindings: z.array(MCPBindingSchema).default([]),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  isEnabled: z.boolean().default(true),
})
export type AgentFormValues = z.infer<typeof AgentFormSchema>

export const CreateThreadSchema = z.object({
  agentId: optionalTrimmedString,
  modelId: optionalTrimmedString,
  title: z
    .string()
    .trim()
    .max(255, { error: "Title cannot exceed 255 characters" })
    .optional(),
  approvalPolicy: z.enum(AI_APPROVAL_POLICIES).optional(),
  generation: GenerationConfigSchema.optional(),
})
export type CreateThreadValues = z.infer<typeof CreateThreadSchema>

export const UpdateThreadSchema = z.object({
  title: nonEmptyString("Title is required")
    .pipe(z.string().max(255, { error: "Title cannot exceed 255 characters" }))
    .optional(),
  agentId: optionalTrimmedString,
  modelId: optionalTrimmedString,
  isPinned: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  approvalPolicy: z.enum(AI_APPROVAL_POLICIES).optional(),
  generation: GenerationConfigSchema.optional(),
})
export type UpdateThreadValues = z.infer<typeof UpdateThreadSchema>

export const TurnAttachmentMetaSchema = z.object({
  filename: nonEmptyString("Filename is required"),
  contentType: z.enum(AI_ATTACHMENT_MIME_TYPES),
  sizeBytes: z.number().int().min(0).max(AI_MAX_ATTACHMENT_BYTES, {
    error: "Attachment size cannot exceed 10 MB",
  }),
})

export const SendThreadTurnSchema = z
  .object({
    content: z.string().default(""),
    attachments: z
      .array(TurnAttachmentMetaSchema)
      .max(AI_MAX_ATTACHMENTS_PER_TURN, {
        error: `At most ${AI_MAX_ATTACHMENTS_PER_TURN} attachments allowed per message`,
      })
      .default([]),
    agentId: optionalTrimmedString,
    modelId: optionalTrimmedString,
    contextHint: optionalTrimmedString,
  })
  .superRefine((val, ctx) => {
    if (!val.content.trim() && val.attachments.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a message or attach at least one file",
        path: ["content"],
      })
    }
  })
export type SendThreadTurnValues = z.infer<typeof SendThreadTurnSchema>
