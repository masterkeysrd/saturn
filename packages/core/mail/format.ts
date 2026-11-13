export interface ParticipantInput {
  email: string
  displayName?: string
  name?: string
}

/**
 * Idempotently normalizes a subject for a reply by prepending "Re: ".
 * Collapses existing "Re:", "re:", "RE:", and repeated "Re: Re:" prefixes.
 */
export function normalizeReplySubject(subject?: string): string {
  if (!subject) return "Re: "
  const trimmed = subject.trim()
  if (!trimmed) return "Re: "

  // Remove existing Re:/Fwd: chain at the start
  const cleaned = trimmed.replace(/^((re|fwd|fw):\s*)+/i, "").trim()
  return `Re: ${cleaned}`
}

/**
 * Idempotently normalizes a subject for a forward by prepending "Fwd: ".
 * Collapses existing "Fwd:", "Fw:", "fwd:", and repeated prefixes.
 */
export function normalizeForwardSubject(subject?: string): string {
  if (!subject) return "Fwd: "
  const trimmed = subject.trim()
  if (!trimmed) return "Fwd: "

  const cleaned = trimmed.replace(/^((re|fwd|fw):\s*)+/i, "").trim()
  return `Fwd: ${cleaned}`
}

/**
 * Formats a participant as "DisplayName <email>" or just "email".
 */
export function formatParticipantDisplay(
  participant?: ParticipantInput
): string {
  if (!participant) return ""
  const email = participant.email?.trim() || ""
  const name = (participant.displayName || participant.name || "").trim()

  if (name && name.toLowerCase() !== email.toLowerCase()) {
    return `${name} <${email}>`
  }
  return email
}

export interface ComputeReplyRecipientsOptions {
  replyType: "reply" | "reply-all"
  from: ParticipantInput
  to?: ParticipantInput[]
  cc?: ParticipantInput[]
  replyTo?: ParticipantInput[]
  selfEmails?: string[]
}

export interface ReplyRecipients {
  to: ParticipantInput[]
  cc: ParticipantInput[]
}

/**
 * Computes recipients for Reply vs Reply-All.
 * Deduplicates recipients and excludes current user's selfEmails (account address & aliases).
 */
export function computeReplyRecipients(
  options: ComputeReplyRecipientsOptions
): ReplyRecipients {
  const {
    replyType,
    from,
    to = [],
    cc = [],
    replyTo = [],
    selfEmails = [],
  } = options
  const selfLowerSet = new Set(
    selfEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)
  )

  const isSelf = (email: string) => selfLowerSet.has(email.trim().toLowerCase())

  // Primary recipient is replyTo (if specified) or from
  const primaryCandidates = replyTo.length > 0 ? replyTo : [from]
  const validPrimary = primaryCandidates.filter((p) => p && p.email?.trim())

  if (replyType === "reply") {
    // If replyTo/from is self, keep it so user can reply to self, otherwise exclude self
    const toFiltered = validPrimary.filter((p) => !isSelf(p.email))
    return {
      to: toFiltered.length > 0 ? toFiltered : validPrimary,
      cc: [],
    }
  }

  // Reply-All
  const seenEmails = new Set<string>()
  const finalTo: ParticipantInput[] = []
  const finalCc: ParticipantInput[] = []

  // Add primary to To
  for (const p of validPrimary) {
    const lower = p.email.trim().toLowerCase()
    if (!isSelf(lower) && !seenEmails.has(lower)) {
      seenEmails.add(lower)
      finalTo.push(p)
    }
  }

  // Add original To recipients to finalTo
  for (const p of to) {
    if (!p || !p.email?.trim()) continue
    const lower = p.email.trim().toLowerCase()
    if (!isSelf(lower) && !seenEmails.has(lower)) {
      seenEmails.add(lower)
      finalTo.push(p)
    }
  }

  // If everyone was self, ensure at least one recipient
  if (finalTo.length === 0 && validPrimary.length > 0) {
    finalTo.push(validPrimary[0])
    seenEmails.add(validPrimary[0].email.trim().toLowerCase())
  }

  // Add original Cc recipients to finalCc
  for (const p of cc) {
    if (!p || !p.email?.trim()) continue
    const lower = p.email.trim().toLowerCase()
    if (!isSelf(lower) && !seenEmails.has(lower)) {
      seenEmails.add(lower)
      finalCc.push(p)
    }
  }

  return {
    to: finalTo,
    cc: finalCc,
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export interface QuotedReplyMessage {
  from?: ParticipantInput
  sentAt?: string | Date
  bodyHtml?: string
  bodyText?: string
}

/**
 * Builds HTML for a quoted email reply.
 */
export function buildQuotedReplyHtml(message: QuotedReplyMessage): string {
  const fromDisplay = escapeHtml(
    formatParticipantDisplay(message.from) || "sender"
  )
  let dateStr = ""

  if (message.sentAt) {
    const d =
      typeof message.sentAt === "string"
        ? new Date(message.sentAt)
        : message.sentAt
    if (!isNaN(d.getTime())) {
      dateStr = d.toUTCString()
    }
  }

  const dateClause = dateStr ? `On ${escapeHtml(dateStr)}, ` : ""
  let content = message.bodyHtml?.trim()

  if (!content && message.bodyText) {
    content = escapeHtml(message.bodyText).replace(/\n/g, "<br>")
  }

  if (!content) {
    content = ""
  }

  return `<br><br><div class="saturn-quoted-reply"><p>${dateClause}${fromDisplay} wrote:</p><blockquote style="margin: 0 0 0 0.8ex; border-left: 1px solid #ccc; padding-left: 1ex;">${content}</blockquote></div>`
}

/**
 * Formats a byte size into human-readable string (e.g. 1.5 KB, 24.2 MB).
 */
export function formatAttachmentBytes(bytes: number): string {
  if (bytes <= 0 || isNaN(bytes)) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  )
  const val = bytes / Math.pow(1024, i)

  if (i === 0) {
    return `${bytes} B`
  }
  return `${Number(val.toFixed(1))} ${units[i]}`
}
