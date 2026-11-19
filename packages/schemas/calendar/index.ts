import { z } from "zod"
import { COMMON_TIMEZONES, isValidTimezone } from "@saturn/core"
import { nonEmptyString } from "../common"
import { schemaError } from "../i18n"

export { COMMON_TIMEZONES }

export const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export const CalendarFormSchema = z.compile(
  z.object({
    name: nonEmptyString("calendar.nameRequired").max(100, {
      error: schemaError("calendar.nameMaxLength"),
    }),
    description: z
      .string()
      .trim()
      .max(500, {
        error: schemaError("calendar.descriptionMaxLength"),
      })
      .optional()
      .default(""),
    color: z
      .string()
      .trim()
      .regex(HEX_COLOR_REGEX, {
        error: schemaError("calendar.colorInvalid"),
      })
      .default("#3b82f6"),
    timezone: z
      .string()
      .trim()
      .refine((val) => isValidTimezone(val), {
        error: schemaError("calendar.ianaTimezoneInvalid"),
      })
      .default("UTC"),
    isEnabled: z.boolean().default(true),
  })
)

export type CalendarFormValues = z.infer<typeof CalendarFormSchema>

export const AttendeeSchema = z.object({
  email: z
    .string()
    .trim()
    .email({ error: schemaError("calendar.emailInvalid") }),
  displayName: z.string().trim().optional().default(""),
  isOptional: z.boolean().optional().default(false),
  responseStatus: z
    .enum([
      "ATTENDEE_RESPONSE_STATUS_UNSPECIFIED",
      "ATTENDEE_RESPONSE_STATUS_NEEDS_ACTION",
      "ATTENDEE_RESPONSE_STATUS_ACCEPTED",
      "ATTENDEE_RESPONSE_STATUS_DECLINED",
      "ATTENDEE_RESPONSE_STATUS_TENTATIVE",
    ])
    .optional()
    .default("ATTENDEE_RESPONSE_STATUS_NEEDS_ACTION"),
})

export type AttendeeFormValues = z.infer<typeof AttendeeSchema>

export const ReminderSchema = z.object({
  method: z.enum(["popup", "email"]).default("popup"),
  minutes: z.number().int().min(0).default(10),
})

export type ReminderFormValues = z.infer<typeof ReminderSchema>

export type RecurrenceFrequency =
  "none" | "daily" | "weekly" | "monthly" | "yearly" | "custom"

export interface RRuleOptions {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
  interval?: number
  count?: number
  until?: string // YYYYMMDDTHHMMSSZ or YYYYMMDD
  byDay?: string[] // e.g. ["MO", "TU", "WE", "TH", "FR"]
}

/**
 * Builds an RFC 5545 RRULE string from structured options or preset.
 */
export function buildRRule(
  preset: RecurrenceFrequency,
  options?: Partial<RRuleOptions>
): string {
  if (preset === "none") return ""

  const freqMap: Record<
    Exclude<RecurrenceFrequency, "none" | "custom">,
    "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
  > = {
    daily: "DAILY",
    weekly: "WEEKLY",
    monthly: "MONTHLY",
    yearly: "YEARLY",
  }

  const freq =
    preset === "custom" ? (options?.freq ?? "WEEKLY") : freqMap[preset]
  const parts: string[] = [`FREQ=${freq}`]

  if (options?.interval && options.interval > 1) {
    parts.push(`INTERVAL=${options.interval}`)
  }
  if (options?.count && options.count > 0) {
    parts.push(`COUNT=${options.count}`)
  }
  if (options?.until) {
    parts.push(`UNTIL=${options.until.replace(/[-:]/g, "")}`)
  }
  if (options?.byDay && options.byDay.length > 0) {
    parts.push(`BYDAY=${options.byDay.join(",")}`)
  }

  return parts.join(";")
}

/**
 * Parses an RFC 5545 RRULE string into structured options.
 */
export function parseRRule(
  rrule: string
): Partial<RRuleOptions> & { preset: RecurrenceFrequency } {
  if (!rrule || !rrule.trim()) {
    return { preset: "none" }
  }

  const clean = rrule.startsWith("RRULE:") ? rrule.slice(6) : rrule
  const tokens = clean.split(";")
  const result: Partial<RRuleOptions> & { preset: RecurrenceFrequency } = {
    preset: "custom",
  }

  for (const token of tokens) {
    const [key, val] = token.split("=")
    if (!key || !val) continue
    switch (key.toUpperCase()) {
      case "FREQ":
        result.freq = val.toUpperCase() as RRuleOptions["freq"]
        break
      case "INTERVAL":
        result.interval = parseInt(val, 10)
        break
      case "COUNT":
        result.count = parseInt(val, 10)
        break
      case "UNTIL":
        result.until = val
        break
      case "BYDAY":
        result.byDay = val.split(",")
        break
    }
  }

  // Detect simple preset
  if (
    result.freq === "DAILY" &&
    (!result.interval || result.interval === 1) &&
    !result.count &&
    !result.until &&
    !result.byDay
  ) {
    result.preset = "daily"
  } else if (
    result.freq === "WEEKLY" &&
    (!result.interval || result.interval === 1) &&
    !result.count &&
    !result.until &&
    !result.byDay
  ) {
    result.preset = "weekly"
  } else if (
    result.freq === "MONTHLY" &&
    (!result.interval || result.interval === 1) &&
    !result.count &&
    !result.until &&
    !result.byDay
  ) {
    result.preset = "monthly"
  } else if (
    result.freq === "YEARLY" &&
    (!result.interval || result.interval === 1) &&
    !result.count &&
    !result.until &&
    !result.byDay
  ) {
    result.preset = "yearly"
  }

  return result
}

export const EventFormSchema = z.compile(
  z
    .object({
      calendarId: nonEmptyString("calendar.calendarRequired"),
      title: nonEmptyString("calendar.eventTitleRequired").max(200, {
        error: schemaError("calendar.eventTitleMaxLength"),
      }),
      description: z.string().trim().max(5000).optional().default(""),
      location: z.string().trim().max(500).optional().default(""),
      isAllDay: z.boolean().default(false),
      startTime: z.string().optional().default(""),
      endTime: z.string().optional().default(""),
      startDate: z.string().optional().default(""),
      endDate: z.string().optional().default(""),
      timezone: z
        .string()
        .trim()
        .refine((val) => !val || isValidTimezone(val), {
          error: schemaError("calendar.timezoneInvalid"),
        })
        .default("UTC"),
      rrule: z.string().optional().default(""),
      attendees: z.array(AttendeeSchema).default([]),
      reminders: z.array(ReminderSchema).default([]),
      meetUrl: z.string().trim().optional().default(""),
      sourceMailMessageId: z.string().trim().optional().default(""),
    })
    .refine(
      (data) => {
        if (!data.isAllDay) {
          if (!data.startTime || !data.endTime) return false
          const s = new Date(data.startTime).getTime()
          const e = new Date(data.endTime).getTime()
          return !isNaN(s) && !isNaN(e) && e >= s
        }
        return true
      },
      {
        error: schemaError("calendar.endTimeBeforeStart"),
        path: ["endTime"],
      }
    )
    .refine(
      (data) => {
        if (data.isAllDay) {
          if (!data.startDate || !data.endDate) return false
          return data.endDate >= data.startDate
        }
        return true
      },
      {
        error: schemaError("calendar.endDateBeforeStart"),
        path: ["endDate"],
      }
    )
)

export type EventFormValues = z.infer<typeof EventFormSchema>
