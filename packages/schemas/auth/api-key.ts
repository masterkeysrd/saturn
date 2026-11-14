import { z } from "zod"
import { nonEmptyString } from "../common"

export const API_KEY_SCOPES = [
  "spaces:read",
  "finance:read",
  "finance:write",
  "calendar:read",
  "calendar:write",
  "mail:read",
  "mail:write",
  "agents:read",
  "agents:write",
  "workflows:read",
  "workflows:execute",
  "workflows:write",
] as const

export type APIKeyScope = (typeof API_KEY_SCOPES)[number]

export const APIKeyScopeSchema = z.enum(API_KEY_SCOPES)

export interface APIKeyScopeMetadata {
  scope: APIKeyScope
  label: string
  description: string
}

export interface APIKeyScopeGroup {
  id: string
  label: string
  scopes: APIKeyScopeMetadata[]
}

export const API_KEY_SCOPE_GROUPS: APIKeyScopeGroup[] = [
  {
    id: "spaces",
    label: "Spaces",
    scopes: [
      {
        scope: "spaces:read",
        label: "Read Spaces",
        description:
          "List granted workspaces, settings, and workspace members.",
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    scopes: [
      {
        scope: "finance:read",
        label: "Read Finance",
        description:
          "View budgets, accounts, transactions, statements, and insights.",
      },
      {
        scope: "finance:write",
        label: "Write Finance",
        description:
          "Create, update, and delete budgets, transactions, and accounts.",
      },
    ],
  },
  {
    id: "calendar",
    label: "Calendar",
    scopes: [
      {
        scope: "calendar:read",
        label: "Read Calendar",
        description: "List and view calendars and scheduled events.",
      },
      {
        scope: "calendar:write",
        label: "Write Calendar",
        description:
          "Create, modify, respond to, and delete calendars and events.",
      },
    ],
  },
  {
    id: "mail",
    label: "Mail",
    scopes: [
      {
        scope: "mail:read",
        label: "Read Mail",
        description: "Read mailboxes, email threads, messages, and drafts.",
      },
      {
        scope: "mail:write",
        label: "Write Mail",
        description: "Modify threads, manage drafts, and send email messages.",
      },
    ],
  },
  {
    id: "agents",
    label: "Agents",
    scopes: [
      {
        scope: "agents:read",
        label: "Read Agents",
        description:
          "View LLM providers, agents, catalogs, and agent run history.",
      },
      {
        scope: "agents:write",
        label: "Write Agents",
        description: "Create, update, and remove LLM providers and agents.",
      },
    ],
  },
  {
    id: "workflows",
    label: "Workflows",
    scopes: [
      {
        scope: "workflows:read",
        label: "Read Workflows",
        description: "List and inspect automation flows and execution runs.",
      },
      {
        scope: "workflows:execute",
        label: "Execute Workflows",
        description: "Trigger workflow runs and invoke webhook endpoints.",
      },
      {
        scope: "workflows:write",
        label: "Write Workflows",
        description: "Create, update, enable, disable, and delete workflows.",
      },
    ],
  },
]

export const API_KEY_EXPIRATION_PRESETS = [
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "1y", label: "1 year", days: 365 },
  { id: "custom", label: "Custom", days: null },
  { id: "none", label: "No expiration", days: null },
] as const

export type APIKeyExpirationPreset =
  (typeof API_KEY_EXPIRATION_PRESETS)[number]["id"]

export const CreateAPIKeySchema = z.compile(
  z.object({
    name: nonEmptyString("API key name is required").pipe(
      z.string().max(255, { error: "Name must be 255 characters or less" })
    ),
    description: z.string().trim().max(1000).optional(),
    scopes: z
      .array(APIKeyScopeSchema)
      .min(1, { error: "Select at least one permission scope" }),
    spaceIds: z
      .array(nonEmptyString("Workspace ID cannot be empty"))
      .min(1, { error: "Select at least one workspace" }),
    expiresAt: z.string().datetime().optional(),
  })
)

export type CreateAPIKeyValues = z.infer<typeof CreateAPIKeySchema>

export const UpdateAPIKeySchema = z.compile(
  z.object({
    name: nonEmptyString("API key name is required").pipe(
      z.string().max(255, { error: "Name must be 255 characters or less" })
    ),
    description: z.string().trim().max(1000).optional(),
    scopes: z
      .array(APIKeyScopeSchema)
      .min(1, { error: "Select at least one permission scope" }),
    spaceIds: z
      .array(nonEmptyString("Workspace ID cannot be empty"))
      .min(1, { error: "Select at least one workspace" }),
  })
)

export type UpdateAPIKeyValues = z.infer<typeof UpdateAPIKeySchema>
