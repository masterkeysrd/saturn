/**
 * Validates that a `return_to` query parameter is a safe internal relative path
 * (starting with `/` and not `//`, `/\`, or an external scheme), falling back to `/`.
 */
export function resolveSafeReturnTo(raw: string | null | undefined): string {
  if (!raw) return "/"
  const trimmed = raw.trim()
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\")
  ) {
    return "/"
  }
  try {
    const parsed = new URL(trimmed, "https://saturn.invalid")
    if (parsed.origin !== "https://saturn.invalid") {
      return "/"
    }
    return parsed.pathname + parsed.search + parsed.hash
  } catch {
    return "/"
  }
}
