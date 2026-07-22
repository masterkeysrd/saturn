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
