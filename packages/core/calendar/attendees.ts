export interface SelfAttendeeLike {
  email?: string | null
}

export function findSelfAttendee<T extends SelfAttendeeLike>(
  attendees: readonly T[] | null | undefined,
  selfEmails: readonly (string | null | undefined)[] | null | undefined
): T | undefined {
  if (
    !attendees ||
    attendees.length === 0 ||
    !selfEmails ||
    selfEmails.length === 0
  ) {
    return undefined
  }

  const normalized = new Set(
    selfEmails
      .map((e) => e?.trim().toLowerCase())
      .filter((e): e is string => Boolean(e))
  )
  if (normalized.size === 0) {
    return undefined
  }

  return attendees.find((att) => {
    const email = att.email?.trim().toLowerCase()
    return Boolean(email && normalized.has(email))
  })
}
