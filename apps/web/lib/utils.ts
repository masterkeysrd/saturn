import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { parseUserAgent, type ParsedUserAgent } from "@saturn/core"

export { parseUserAgent, type ParsedUserAgent }

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24

const MS_PER_MINUTE = MS_PER_SECOND * SECONDS_PER_MINUTE
const MS_PER_HOUR = MS_PER_MINUTE * MINUTES_PER_HOUR
const MS_PER_DAY = MS_PER_HOUR * HOURS_PER_DAY

export function formatRelativeTime(timeStr: string, currentNow: number) {
  if (!timeStr) return ""
  const target = new Date(timeStr).getTime()
  const diff = target - currentNow
  const absDiff = Math.abs(diff)

  const days = Math.floor(absDiff / MS_PER_DAY)
  const hours = Math.floor((absDiff % MS_PER_DAY) / MS_PER_HOUR)
  const minutes = Math.floor((absDiff % MS_PER_HOUR) / MS_PER_MINUTE)
  const seconds = Math.floor((absDiff % MS_PER_MINUTE) / MS_PER_SECOND)

  const timeText =
    days > 0
      ? `${days}d ${hours}h`
      : hours > 0
        ? `${hours}h ${minutes}m`
        : minutes > 0
          ? `${minutes}m`
          : `${seconds}s`

  if (diff > 0) {
    return `(in ${timeText})`
  } else {
    return `(${timeText} ago)`
  }
}
