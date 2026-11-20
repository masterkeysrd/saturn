import { isValidCronExpression } from "@saturn/core"
import type { TranslationKey } from "@saturn/i18n"

export type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>
) => string

const WEEKDAY_KEYS: Record<string, TranslationKey> = {
  "0": "workflows.cron.weekdays.sunday",
  "1": "workflows.cron.weekdays.monday",
  "2": "workflows.cron.weekdays.tuesday",
  "3": "workflows.cron.weekdays.wednesday",
  "4": "workflows.cron.weekdays.thursday",
  "5": "workflows.cron.weekdays.friday",
  "6": "workflows.cron.weekdays.saturday",
  "7": "workflows.cron.weekdays.sunday",
}

export const CRON_PRESET_LABEL_KEYS: Record<string, TranslationKey> = {
  every_15_min: "workflows.preset.every15min",
  hourly: "workflows.preset.hourly",
  daily_9am: "workflows.preset.daily9am",
  weekdays_9am: "workflows.preset.weekdays9am",
  weekly_monday: "workflows.preset.weeklyMonday",
  monthly_first: "workflows.preset.monthlyFirst",
}

function formatTimeHHMM(hourStr: string, minStr: string): string | null {
  if (!/^\d+$/.test(hourStr) || !/^\d+$/.test(minStr)) return null
  const hour = Number(hourStr)
  const min = Number(minStr)
  if (hour < 0 || hour > 23 || min < 0 || min > 59) return null
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`
}

/**
 * Localized counterpart of `summarizeCron` from `@saturn/core`, which must
 * stay free of catalog dependencies. Mirrors its pattern matching so both
 * helpers agree on shape while this one renders through the translation
 * catalog.
 */
export function getLocalizedCronSummary(
  cron: string,
  timezone: string | undefined,
  t: Translate
): string {
  const trimmed = cron.trim()
  if (!isValidCronExpression(trimmed)) {
    return t("workflows.cron.invalid")
  }

  const tzSuffix = timezone ? ` (${timezone})` : ""
  const lower = trimmed.toLowerCase()
  if (lower === "@hourly") {
    return t("workflows.cron.everyHour") + tzSuffix
  }
  if (lower === "@daily" || lower === "@midnight") {
    return t("workflows.cron.everyDayMidnight") + tzSuffix
  }
  if (lower === "@weekly") {
    return t("workflows.cron.everySundayMidnight") + tzSuffix
  }
  if (lower === "@monthly") {
    return t("workflows.cron.monthlyFirstMidnight") + tzSuffix
  }
  if (lower === "@yearly" || lower === "@annually") {
    return t("workflows.cron.yearlyJanMidnight") + tzSuffix
  }

  const [min, hour, dom, mon, dow] = trimmed.split(/\s+/)

  if (
    min.startsWith("*/") &&
    hour === "*" &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    return t("workflows.cron.everyNMinutes", { count: min.slice(2) })
  }

  if (
    min === "*" &&
    hour === "*" &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    return t("workflows.cron.everyMinute")
  }

  if (
    /^\d+$/.test(min) &&
    hour === "*" &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    return t("workflows.cron.everyHourAt", { minute: min.padStart(2, "0") })
  }

  const hhmm = formatTimeHHMM(hour, min)
  if (hhmm && dom === "*" && mon === "*") {
    if (dow === "*") {
      return t("workflows.cron.everyDayAt", { time: hhmm }) + tzSuffix
    }
    if (dow === "1-5") {
      return t("workflows.cron.weekdaysAt", { time: hhmm }) + tzSuffix
    }
    if (dow === "0,6" || dow === "6,0") {
      return t("workflows.cron.weekendsAt", { time: hhmm }) + tzSuffix
    }
    const weekdayKey = WEEKDAY_KEYS[dow]
    if (weekdayKey) {
      return (
        t("workflows.cron.everyWeekdayAt", {
          weekday: t(weekdayKey),
          time: hhmm,
        }) + tzSuffix
      )
    }
  }

  if (hhmm && /^\d+$/.test(dom) && mon === "*" && dow === "*") {
    return t("workflows.cron.monthlyOnDay", { day: dom, time: hhmm }) + tzSuffix
  }

  return `${t("workflows.cron.cronLabel")} ${trimmed}${tzSuffix}`
}
