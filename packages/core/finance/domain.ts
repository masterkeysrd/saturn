export function decodeBase64Utf8(base64: string | undefined | null): string {
  if (!base64) return ""
  try {
    const binString = atob(base64)
    const bytes = Uint8Array.from(binString, (m: string) => m.charCodeAt(0))
    const decoded = new TextDecoder().decode(bytes)
    if (decoded && decoded.trim().length > 0) {
      return decoded
    }
  } catch {
    // If not base64 encoded text, return the raw string directly
  }
  return base64
}

export function extractDomainFromUrlOrName(input?: string): string {
  if (!input || !input.trim()) return ""
  let clean = input.trim().toLowerCase()
  if (clean.includes("://")) {
    clean = clean.split("://")[1]
  }
  const pathIdx = clean.search(/[/?#]/)
  if (pathIdx !== -1) {
    clean = clean.substring(0, pathIdx)
  }
  if (clean.startsWith("www.")) {
    clean = clean.substring(4)
  }
  if (clean.includes(".") && !clean.includes(" ")) {
    return clean
  }
  return ""
}

export function getInstitutionLogoUrl(domain?: string, name?: string): string {
  const resolvedDomain =
    extractDomainFromUrlOrName(domain) || extractDomainFromUrlOrName(name)
  if (resolvedDomain) {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(resolvedDomain)}&sz=64`
  }
  return ""
}
