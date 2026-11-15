export interface CronPreset {
  id: string
  label: string
  cron: string
  description: string
}

export const CRON_PRESETS: CronPreset[] = [
  {
    id: "every_15_min",
    label: "Every 15 minutes",
    cron: "*/15 * * * *",
    description: "Runs every 15 minutes",
  },
  {
    id: "hourly",
    label: "Hourly",
    cron: "0 * * * *",
    description: "Runs at the start of every hour",
  },
  {
    id: "daily_9am",
    label: "Daily at 9:00 AM",
    cron: "0 9 * * *",
    description: "Runs once a day at 09:00",
  },
  {
    id: "weekdays_9am",
    label: "Weekdays at 9:00 AM",
    cron: "0 9 * * 1-5",
    description: "Runs Monday through Friday at 09:00",
  },
  {
    id: "weekly_monday",
    label: "Weekly on Monday",
    cron: "0 9 * * 1",
    description: "Runs every Monday at 09:00",
  },
  {
    id: "monthly_first",
    label: "Monthly on the 1st",
    cron: "0 8 1 * *",
    description: "Runs on day 1 of every month at 08:00",
  },
]

const CRON_MACROS = new Set([
  "@yearly",
  "@annually",
  "@monthly",
  "@weekly",
  "@daily",
  "@midnight",
  "@hourly",
])

const FIELD_BOUNDS: Array<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 7], // day of week (0 and 7 both Sunday)
]

function isValidCronSegment(
  segment: string,
  min: number,
  max: number
): boolean {
  if (!segment) return false
  const [rangePart, stepPart] = segment.split("/")
  if (segment.split("/").length > 2) return false

  if (stepPart !== undefined) {
    if (!/^\d+$/.test(stepPart)) return false
    const step = Number(stepPart)
    if (step <= 0) return false
  }

  if (rangePart === "*") return true

  if (rangePart.includes("-")) {
    const parts = rangePart.split("-")
    if (parts.length !== 2) return false
    if (!/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) return false
    const start = Number(parts[0])
    const end = Number(parts[1])
    return start >= min && end <= max && start <= end
  }

  if (!/^\d+$/.test(rangePart)) return false
  const val = Number(rangePart)
  return val >= min && val <= max
}

function isValidCronField(field: string, min: number, max: number): boolean {
  if (!field) return false
  const segments = field.split(",")
  return segments.every((seg) => isValidCronSegment(seg, min, max))
}

/**
 * Validates standard 5-field cron expressions or standard `@daily` / `@hourly` macros.
 */
export function isValidCronExpression(cron: string): boolean {
  const trimmed = cron.trim()
  if (!trimmed) return false
  if (CRON_MACROS.has(trimmed.toLowerCase())) return true

  const fields = trimmed.split(/\s+/)
  if (fields.length !== 5) return false

  return fields.every((field, idx) => {
    const [min, max] = FIELD_BOUNDS[idx]
    return isValidCronField(field, min, max)
  })
}

const WEEKDAY_NAMES: Record<string, string> = {
  "0": "Sunday",
  "1": "Monday",
  "2": "Tuesday",
  "3": "Wednesday",
  "4": "Thursday",
  "5": "Friday",
  "6": "Saturday",
  "7": "Sunday",
}

function formatTimeHHMM(hourStr: string, minStr: string): string | null {
  if (!/^\d+$/.test(hourStr) || !/^\d+$/.test(minStr)) return null
  const hour = Number(hourStr)
  const min = Number(minStr)
  if (hour < 0 || hour > 23 || min < 0 || min > 59) return null
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`
}

/**
 * Produces a concise human-readable description of a cron expression.
 */
export function summarizeCron(cron: string, timezone?: string): string {
  const trimmed = cron.trim()
  if (!isValidCronExpression(trimmed)) {
    return "Invalid cron expression"
  }

  const tzSuffix = timezone ? ` (${timezone})` : ""
  const lower = trimmed.toLowerCase()
  if (lower === "@hourly") return `Every hour${tzSuffix}`
  if (lower === "@daily" || lower === "@midnight") {
    return `Every day at 00:00${tzSuffix}`
  }
  if (lower === "@weekly") return `Every Sunday at 00:00${tzSuffix}`
  if (lower === "@monthly") return `Monthly on day 1 at 00:00${tzSuffix}`
  if (lower === "@yearly" || lower === "@annually") {
    return `Yearly on Jan 1 at 00:00${tzSuffix}`
  }

  const [min, hour, dom, mon, dow] = trimmed.split(/\s+/)

  if (
    min.startsWith("*/") &&
    hour === "*" &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    return `Every ${min.slice(2)} minutes`
  }

  if (
    min === "*" &&
    hour === "*" &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    return "Every minute"
  }

  if (
    /^\d+$/.test(min) &&
    hour === "*" &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    const paddedMin = min.padStart(2, "0")
    return `Every hour at :${paddedMin}`
  }

  const hhmm = formatTimeHHMM(hour, min)
  if (hhmm && dom === "*" && mon === "*") {
    if (dow === "*") {
      return `Every day at ${hhmm}${tzSuffix}`
    }
    if (dow === "1-5") {
      return `Weekdays at ${hhmm}${tzSuffix}`
    }
    if (dow === "0,6" || dow === "6,0") {
      return `Weekends at ${hhmm}${tzSuffix}`
    }
    if (WEEKDAY_NAMES[dow]) {
      return `Every ${WEEKDAY_NAMES[dow]} at ${hhmm}${tzSuffix}`
    }
  }

  if (hhmm && /^\d+$/.test(dom) && mon === "*" && dow === "*") {
    return `Monthly on day ${dom} at ${hhmm}${tzSuffix}`
  }

  return `Cron: ${trimmed}${tzSuffix}`
}
