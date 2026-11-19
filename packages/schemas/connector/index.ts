import { z } from "zod"
import { schemaError } from "../i18n"

export const CONNECTOR_CAPABILITIES = ["calendar", "mail", "contacts"] as const

export type ConnectorCapability = (typeof CONNECTOR_CAPABILITIES)[number]

export const CONNECTOR_CAPABILITY_LABELS: Record<ConnectorCapability, string> =
  {
    calendar: "Calendars",
    mail: "Mail",
    contacts: "Contacts",
  }

export const CONNECTOR_CAPABILITY_DESCRIPTIONS: Record<
  ConnectorCapability,
  string
> = {
  calendar: "Sync calendar events and schedule meetings",
  mail: "Ingest invoices, receipts, and send emails",
  contacts: "Autocomplete contacts and address book",
}

export const UpdateConnectedAccountSchema = z.compile(
  z.object({
    displayName: z
      .string()
      .trim()
      .max(100, {
        error: schemaError("connector.displayNameMaxLength"),
      })
      .optional(),
    color: z
      .string()
      .trim()
      .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
        error: schemaError("connector.accentColorInvalid"),
      })
      .optional()
      .or(z.literal("")),
    enabledCapabilities: z.array(z.enum(["calendar", "mail", "contacts"])),
  })
)

export type UpdateConnectedAccountFormValues = z.infer<
  typeof UpdateConnectedAccountSchema
>
