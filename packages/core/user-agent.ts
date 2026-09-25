/**
 * Parsed User-Agent metadata structure.
 */
export interface ParsedUserAgent {
  device: string
  isMobile: boolean
  os: string
  browser?: string
}

/**
 * Universal user-agent parser shared across web and mobile clients.
 * Accurately detects OS, browser, and native Saturn mobile wrappers.
 */
export function parseUserAgent(ua: string): ParsedUserAgent {
  if (!ua) {
    return { device: "Unknown Device", isMobile: false, os: "Unknown OS" }
  }

  const uaLower = ua.toLowerCase()
  const isMobile =
    /mobile|iphone|ipad|android|phone|expo|cfnetwork|okhttp/i.test(uaLower)

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

  // Detect Native Mobile App clients
  if (uaLower.includes("saturn") || uaLower.includes("expo")) {
    return {
      device: `Saturn Mobile (${os !== "Unknown OS" ? os : "Mobile"})`,
      isMobile: true,
      os,
    }
  }
  if (uaLower.includes("cfnetwork")) {
    return { device: "Saturn Mobile (iOS)", isMobile: true, os: "iOS" }
  }
  if (uaLower.includes("okhttp")) {
    return { device: "Saturn Mobile (Android)", isMobile: true, os: "Android" }
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
    if (ua.length < 35) {
      return { device: ua, isMobile, os }
    }
    return {
      device: isMobile ? "Mobile Client" : "Browser Connection",
      isMobile,
      os,
    }
  }

  return { device: `${browser} on ${os}`, isMobile, os, browser }
}
