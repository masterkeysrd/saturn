import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseUserAgent(ua: string) {
  if (!ua) return { device: "Unknown Device", isMobile: false }

  const uaLower = ua.toLowerCase()
  const isMobile = /mobile|iphone|ipad|android|phone/i.test(uaLower)

  // Detect OS
  let os = "Unknown OS"
  if (ua.includes("Windows NT")) {
    os = "Windows"
  } else if (ua.includes("Macintosh") || ua.includes("Mac OS X")) {
    os = "macOS"
  } else if (ua.includes("iPad")) {
    os = "iPadOS"
  } else if (ua.includes("iPhone")) {
    os = "iOS"
  } else if (ua.includes("Android")) {
    os = "Android"
  } else if (ua.includes("Linux")) {
    os = "Linux"
  }

  // Detect Browser
  let browser = ""
  if (ua.includes("Firefox/")) {
    browser = "Firefox"
  } else if (ua.includes("Edg/")) {
    browser = "Edge"
  } else if (ua.includes("Chrome/") && !ua.includes("Chromium/")) {
    browser = "Chrome"
  } else if (
    ua.includes("Safari/") &&
    !ua.includes("Chrome/") &&
    !ua.includes("Chromium/")
  ) {
    browser = "Safari"
  } else if (ua.includes("Opera/") || ua.includes("OPR/")) {
    browser = "Opera"
  }

  if (!browser) {
    if (ua.length < 30) {
      return { device: ua, isMobile }
    }
    return { device: "Browser Connection", isMobile }
  }

  return { device: `${browser} on ${os}`, isMobile }
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
