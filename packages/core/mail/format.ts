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

export interface FormatThreadParticipantsOptions {
  participants?: ParticipantInput[]
  selfEmails?: string[]
  isSentBucket?: boolean
}

/**
 * Formats thread participants for list display:
 * - Excludes the user's connected account email(s) on incoming threads so `<Sender>, <account>` noise is eliminated.
 * - Prepends "To: " when viewed in Sent / Outgoing buckets.
 * - Deduplicates names across multi-message threads.
 */
export function formatThreadParticipants(
  options: FormatThreadParticipantsOptions
): string {
  const { participants = [], selfEmails = [], isSentBucket = false } = options
  const selfLowerSet = new Set(
    selfEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)
  )

  const isSelf = (email?: string) =>
    Boolean(email && selfLowerSet.has(email.trim().toLowerCase()))

  // Filter out self/connected account participants
  const externalParticipants = participants.filter((p) => !isSelf(p.email))

  // Pick target list: if we have external participants, use them; otherwise fallback to all participants
  const targetList =
    externalParticipants.length > 0 ? externalParticipants : participants

  // Deduplicate by name/email
  const seen = new Set<string>()
  const names: string[] = []

  for (const p of targetList) {
    const rawName = (p.displayName || p.name || "").trim()
    const email = (p.email || "").trim()
    const displayName = rawName || (email ? email.split("@")[0] : "Unknown")
    const key = (email || displayName).toLowerCase()

    if (!seen.has(key)) {
      seen.add(key)
      names.push(displayName)
    }
  }

  const result = names.join(", ") || "Unknown"

  if (isSentBucket) {
    if (externalParticipants.length > 0) {
      return `To: ${result}`
    }
    return "Me"
  }

  return result
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
  preserveStyles?: boolean
  attachments?: Array<{
    contentId?: string
    filename?: string
    isInline?: boolean
    downloadUrl?: string
  }>
}

export interface ForwardedMessageInput {
  from?: ParticipantInput
  to?: ParticipantInput[]
  cc?: ParticipantInput[]
  subject?: string
  sentAt?: string | Date
  bodyHtml?: string
  bodyText?: string
  preserveStyles?: boolean
  attachments?: Array<{
    contentId?: string
    filename?: string
    isInline?: boolean
    downloadUrl?: string
  }>
}

export interface InlineAttachmentInput {
  contentId?: string
  filename?: string
  isInline?: boolean
  downloadUrl?: string
}

export function resolveInlineAttachmentsInHtml(
  html: string,
  attachments?: InlineAttachmentInput[]
): string {
  if (!html || !attachments || attachments.length === 0) return html

  let content = html
  for (const att of attachments) {
    if (att.contentId && att.downloadUrl) {
      const cleanCid = att.contentId.replace(/^<|>$/g, "").trim()
      content = content.replaceAll(`cid:${cleanCid}`, att.downloadUrl)
      content = content.replaceAll(`CID:${cleanCid}`, att.downloadUrl)
      content = content.replaceAll(`cid:<${cleanCid}>`, att.downloadUrl)
      content = content.replaceAll(`CID:<${cleanCid}>`, att.downloadUrl)
    }
    if (att.filename && att.isInline && att.downloadUrl) {
      content = content.replaceAll(`cid:${att.filename}`, att.downloadUrl)
      content = content.replaceAll(`CID:${att.filename}`, att.downloadUrl)
    }
  }
  return content
}

function sanitizeEmailBodyForQuoting(
  html: string,
  attachments?: InlineAttachmentInput[],
  preserveStyles = false
): string {
  let content = html.trim()
  const extractedStyles: string[] = []
  if (preserveStyles) {
    content = content.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (tag) => {
      extractedStyles.push(tag)
      return ""
    })
  }
  const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch) {
    content = bodyMatch[1]
  }
  content = content.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
  if (!preserveStyles) {
    content = content.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
  }
  content = content.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  content = content.replace(
    /\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi,
    ""
  )

  // Resolve and rewrite cid: inline attachments to download URLs so images render in composer
  content = resolveInlineAttachmentsInHtml(content, attachments)

  // Neutralize hardcoded dark text colors to inherit so text stays legible across light/dark themes
  content = content.replace(
    /color:\s*(#000000|#000|#111111|#111|#18181b|#222222|#222|#27272a|#333333|#333|black)\b;?/gi,
    "color: inherit;"
  )
  content = content.replace(
    /background(-color)?:\s*(#ffffff|#fff|white)\b;?/gi,
    "background-color: transparent;"
  )

  if (preserveStyles && extractedStyles.length > 0) {
    return `${extractedStyles.join("")}${content}`
  }

  return content
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

  if (content) {
    content = sanitizeEmailBodyForQuoting(
      content,
      message.attachments,
      message.preserveStyles
    )
  } else if (message.bodyText) {
    content = escapeHtml(message.bodyText).replace(/\n/g, "<br>")
  }

  if (!content) {
    content = ""
  }

  return `<p><br></p><div class="saturn-quoted-reply"><p>${dateClause}${fromDisplay} wrote:</p><blockquote style="margin: 0 0 0 0.8ex; border-left: 2px solid #e4e4e7; padding-left: 1ex; color: #52525b;">${content}</blockquote></div>`
}

/**
 * Builds HTML for a forwarded email message per standard email client formatting.
 */
export function buildForwardedMessageHtml(
  message: ForwardedMessageInput
): string {
  const fromDisplay = escapeHtml(
    formatParticipantDisplay(message.from) || "Unknown sender"
  )
  const toDisplay = escapeHtml(
    (message.to || [])
      .map((p) => formatParticipantDisplay(p))
      .filter(Boolean)
      .join(", ")
  )
  const ccDisplay = escapeHtml(
    (message.cc || [])
      .map((p) => formatParticipantDisplay(p))
      .filter(Boolean)
      .join(", ")
  )
  const subjectDisplay = escapeHtml(message.subject || "")

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

  let content = message.bodyHtml?.trim()
  if (content) {
    content = sanitizeEmailBodyForQuoting(
      content,
      message.attachments,
      message.preserveStyles
    )
  } else if (message.bodyText) {
    content = escapeHtml(message.bodyText).replace(/\n/g, "<br>")
  } else {
    content = ""
  }

  const lines = [
    "<p><br></p>",
    `<div class="saturn-forwarded-message" style="margin-top: 1.5em; border-top: 1px solid #e4e4e7; padding-top: 1em;">`,
    `<p style="margin: 0 0 0.5em 0; color: #71717a; font-size: 13px;">---------- Forwarded message ---------</p>`,
    `<p style="margin: 0.2em 0; color: #3f3f46; font-size: 13px;"><b>From:</b> ${fromDisplay}</p>`,
  ]

  if (dateStr) {
    lines.push(
      `<p style="margin: 0.2em 0; color: #3f3f46; font-size: 13px;"><b>Date:</b> ${escapeHtml(dateStr)}</p>`
    )
  }
  if (subjectDisplay) {
    lines.push(
      `<p style="margin: 0.2em 0; color: #3f3f46; font-size: 13px;"><b>Subject:</b> ${subjectDisplay}</p>`
    )
  }
  if (toDisplay) {
    lines.push(
      `<p style="margin: 0.2em 0; color: #3f3f46; font-size: 13px;"><b>To:</b> ${toDisplay}</p>`
    )
  }
  if (ccDisplay) {
    lines.push(
      `<p style="margin: 0.2em 0; color: #3f3f46; font-size: 13px;"><b>Cc:</b> ${ccDisplay}</p>`
    )
  }

  lines.push(`<div style="margin-top: 1em; color: #18181b;">${content}</div>`)
  lines.push(`</div>`)

  return lines.join("")
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

export interface PrepareDraftContentOptions {
  bodyHtml?: string
  bodyText?: string
  attachments?: InlineAttachmentInput[]
  loadRemoteImages?: boolean
}

export interface PreparedDraftContent {
  editableHtml: string
  quotedHtml: string
  hasRemoteImages: boolean
}

function plainTextLinesToParagraphHtml(
  text: string,
  alreadyEscaped: boolean
): string {
  const normalized = text.replace(/\r\n/g, "\n")
  const lines = normalized.split("\n")
  return lines
    .map((line) => {
      if (!line) return "<p><br></p>"
      return `<p>${alreadyEscaped ? line : escapeHtml(line)}</p>`
    })
    .join("")
}

function findBalancedTagEnd(
  html: string,
  startIdx: number,
  tagName: "div" | "blockquote"
): number {
  const tagRegex = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi")
  tagRegex.lastIndex = startIdx

  let depth = 0
  let tagMatch: RegExpExecArray | null
  while ((tagMatch = tagRegex.exec(html)) !== null) {
    const tag = tagMatch[0]
    if (tag.startsWith("</")) {
      depth -= 1
      if (depth === 0) {
        return tagMatch.index + tag.length
      }
    } else if (!tag.endsWith("/>")) {
      depth += 1
    }
  }
  return -1
}

function finalizeSplitHtml(
  html: string,
  startIdx: number,
  endIdx: number,
  rawTrailing: string
): { editableHtml: string; quotedHtml: string } {
  let before = html
    .slice(0, startIdx)
    .replace(/(?:\s*<p>\s*(?:<br\s*\/?>)?\s*<\/p>)+$/gi, "")
    .replace(/(?:\s*<br\s*\/?>)+$/gi, "")
    .trim()

  // Close any outer <div> wrappers that were closed after the extracted quoted block
  const trailingCloseCount = (rawTrailing.match(/<\/div>/gi) || []).length
  if (trailingCloseCount > 0 && before) {
    let openDivs = 0
    const beforeTagRegex = /<\/?div\b[^>]*>/gi
    let bm: RegExpExecArray | null
    while ((bm = beforeTagRegex.exec(before)) !== null) {
      if (bm[0].startsWith("</")) {
        openDivs = Math.max(0, openDivs - 1)
      } else if (!bm[0].endsWith("/>")) {
        openDivs += 1
      }
    }
    const closeCount = Math.min(trailingCloseCount, openDivs)
    if (closeCount > 0) {
      before = `${before}${"</div>".repeat(closeCount)}`
    }
  }

  // Collapse empty wrapper divs (e.g., <div dir="ltr"></div>) to empty string
  const editableStripped = before
    .replace(/<div\b[^>]*>\s*(?:<br\s*\/?>)?\s*<\/div>/gi, "")
    .trim()
  const editableHtml = editableStripped === "" ? "" : before
  const quotedHtml = html.slice(startIdx, endIdx)

  return { editableHtml, quotedHtml }
}

/**
 * Linkifies plain-text email addresses into mailto: anchors without modifying
 * existing <a> tags, <style> blocks, or HTML tag attributes.
 */
export function linkifyEmailsInHtml(html: string): string {
  if (!html || !html.includes("@")) return html

  const tokenRegex =
    /(<style\b[^>]*>[\s\S]*?<\/style>|<a\b[^>]*>[\s\S]*?<\/a>|<[^>]+>)/gi
  const emailRegex = /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g

  return html
    .split(tokenRegex)
    .map((part, idx) => {
      // Odd indices are matched HTML tags, <a>...</a>, or <style>...</style>
      if (idx % 2 === 1) return part
      return part.replace(emailRegex, '<a href="mailto:$1">$1</a>')
    })
    .join("")
}

/**
 * Splits a trailing quoted reply or forwarded message block from editable draft HTML
 * so complex email HTML can be rendered faithfully without ProseMirror schema loss.
 */
export function splitQuotedEmailHtml(html: string): {
  editableHtml: string
  quotedHtml: string
} {
  if (!html) return { editableHtml: "", quotedHtml: "" }

  const divQuoteRegex =
    /<div\b[^>]*class\s*=\s*(?:"[^"]*\b(?:saturn-quoted-reply|saturn-forwarded-message|gmail_quote)\b[^"]*"|'[^']*\b(?:saturn-quoted-reply|saturn-forwarded-message|gmail_quote)\b[^']*')[^>]*>/i
  const citeBlockquoteRegex =
    /<blockquote\b[^>]*type\s*=\s*(?:"cite"|'cite'|cite)\b[^>]*>/i

  const divMatch = divQuoteRegex.exec(html)
  const citeMatch = citeBlockquoteRegex.exec(html)

  let chosenKind: "div" | "blockquote" | null = null
  let chosenMatch: RegExpExecArray | null = null

  if (divMatch && citeMatch) {
    if (divMatch.index <= citeMatch.index) {
      chosenKind = "div"
      chosenMatch = divMatch
    } else {
      chosenKind = "blockquote"
      chosenMatch = citeMatch
    }
  } else if (divMatch) {
    chosenKind = "div"
    chosenMatch = divMatch
  } else if (citeMatch) {
    chosenKind = "blockquote"
    chosenMatch = citeMatch
  }

  if (chosenMatch && chosenKind) {
    let startIdx = chosenMatch.index
    const endIdx = findBalancedTagEnd(html, startIdx, chosenKind)
    if (endIdx !== -1) {
      // Check if anything meaningful follows the quoted block (ignoring closing outer </div> wrappers)
      const rawTrailing = html.slice(endIdx)
      const meaningfulTrailing = rawTrailing
        .replace(/<\/div>/gi, "")
        .replace(/<p>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, "")
        .replace(/<br\s*\/?>/gi, "")
        .trim()
      if (meaningfulTrailing.length > 0) {
        return { editableHtml: html, quotedHtml: "" }
      }

      // If Apple Mail placed "Begin forwarded message:" in an immediately preceding element, include it
      const prefix = html.slice(0, startIdx)
      const fwdHeaderMatch = prefix.match(
        /(<(?:div|p)\b[^>]*>\s*Begin forwarded message:\s*(?:<br\s*\/?>)?\s*<\/(?:div|p)>\s*(?:<br\s*\/?>|\s)*)$/i
      )
      if (fwdHeaderMatch && fwdHeaderMatch.index !== undefined) {
        startIdx = fwdHeaderMatch.index
      }

      return finalizeSplitHtml(html, startIdx, endIdx, rawTrailing)
    }
  }

  // Fallback for unwrapped Apple Mail / Gmail forwarded blocks ("Begin forwarded message:" + headers)
  const unwrappedFwdRegex =
    /<(?:div|p)\b[^>]*>\s*(?:<[^>]+>\s*)*(?:Begin forwarded message:|---------- Forwarded message ---------)\s*(?:<\/[^>]+>\s*)*(?:<br\s*\/?>)?\s*<\/(?:div|p)>/i
  const fwdMatch = unwrappedFwdRegex.exec(html)
  if (fwdMatch) {
    const startIdx = fwdMatch.index
    const lookahead = html.slice(startIdx, startIdx + 2000)
    if (
      /\bFrom:/i.test(lookahead) &&
      /\b(?:Subject|Date|To):/i.test(lookahead)
    ) {
      let quotedBody = html.slice(startIdx)
      let openDivs = 0
      const divRegex = /<\/?div\b[^>]*>/gi
      let dm: RegExpExecArray | null
      let extraCloseDivs = 0
      while ((dm = divRegex.exec(quotedBody)) !== null) {
        if (dm[0].startsWith("</")) {
          if (openDivs > 0) {
            openDivs -= 1
          } else {
            extraCloseDivs += 1
          }
        } else if (!dm[0].endsWith("/>")) {
          openDivs += 1
        }
      }

      let rawTrailing = ""
      if (extraCloseDivs > 0) {
        for (let i = 0; i < extraCloseDivs; i++) {
          const lastClose = quotedBody.lastIndexOf("</div>")
          if (lastClose === -1) break
          rawTrailing = `</div>${rawTrailing}`
          quotedBody =
            quotedBody.slice(0, lastClose) + quotedBody.slice(lastClose + 6)
        }
      }

      const rebuiltHtml = `${html.slice(0, startIdx)}${quotedBody}${rawTrailing}`
      return finalizeSplitHtml(
        rebuiltHtml,
        startIdx,
        startIdx + quotedBody.length,
        rawTrailing
      )
    }
  }

  return { editableHtml: html, quotedHtml: "" }
}

/**
 * Normalizes draft HTML or plain text for Tiptap editing:
 * - Converts plain text fallback or <pre style="white-space: pre-wrap;"> wrappers to paragraphs
 * - Strips document-level wrappers (<head>, <script>, <body>) while preserving <style> for sandboxed quoted blocks
 * - Resolves cid: inline attachment URLs and detects/optionally restores data-saturn-remote-src images
 * - Extracts trailing quoted reply / forwarded blocks for lossless rendering
 */
export function prepareDraftContentForEditor(
  options: PrepareDraftContentOptions
): PreparedDraftContent {
  const { bodyHtml, bodyText, attachments, loadRemoteImages = false } = options

  let content = bodyHtml?.trim() || ""

  if (!content) {
    if (bodyText && bodyText.trim()) {
      return {
        editableHtml: plainTextLinesToParagraphHtml(bodyText, false),
        quotedHtml: "",
        hasRemoteImages: false,
      }
    }
    return {
      editableHtml: "",
      quotedHtml: "",
      hasRemoteImages: false,
    }
  }

  // Extract sanitized <style> blocks before stripping document wrappers so quotedHtml keeps them
  const extractedStyles: string[] = []
  content = content.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (styleTag) => {
    extractedStyles.push(styleTag)
    return ""
  })

  // Strip document wrappers & scripts
  content = content.replace(/<!DOCTYPE[^>]*>/gi, "")
  const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch) {
    content = bodyMatch[1]
  }
  content = content.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
  content = content.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  content = content.replace(
    /\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi,
    ""
  )
  content = content.replace(/<\/?html[^>]*>/gi, "").trim()

  // Unwrap plain-text <pre style="white-space: pre-wrap;"> wrapper generated by connector
  const preWrapMatch = content.match(
    /^<pre\b[^>]*style\s*=\s*(?:"[^"]*white-space:\s*pre-wrap[^"]*"|'[^']*white-space:\s*pre-wrap[^']*')[^>]*>([\s\S]*?)<\/pre>$/i
  )
  if (preWrapMatch && !/<code\b/i.test(preWrapMatch[1])) {
    content = plainTextLinesToParagraphHtml(preWrapMatch[1], true)
  }

  // Resolve cid: inline attachments
  content = resolveInlineAttachmentsInHtml(content, attachments)

  const hasRemoteImages = /data-saturn-remote-src\s*=/i.test(content)

  const { editableHtml: rawEditable, quotedHtml: rawQuoted } =
    splitQuotedEmailHtml(content)

  let editableHtml = rawEditable
  if (loadRemoteImages && editableHtml) {
    editableHtml = editableHtml.replace(
      /data-saturn-remote-src=(["'])(.*?)\1/gi,
      'src="$2"'
    )
  }

  const linkifiedQuote = rawQuoted ? linkifyEmailsInHtml(rawQuoted) : ""
  const quotedHtml =
    linkifiedQuote && extractedStyles.length > 0
      ? `${extractedStyles.join("")}${linkifiedQuote}`
      : linkifiedQuote

  return {
    editableHtml,
    quotedHtml,
    hasRemoteImages,
  }
}

export interface PreparedUnifiedDraft {
  stylesHtml: string
  bodyHtml: string
  hasRemoteImages: boolean
  isRichHtml: boolean
}

/**
 * Normalizes draft HTML or plain text for a unified contentEditable email composer:
 * - Converts plain text fallback or <pre style="white-space: pre-wrap;"> wrappers to paragraphs
 * - Extracts <style> blocks separately so they can be scoped cleanly inside an editor iframe
 * - Strips scripts/event handlers and document wrappers (<head>, <html>, <body>)
 * - Resolves cid: inline attachment URLs, detects/optionally restores data-saturn-remote-src images
 * - Linkifies plain-text email addresses (e.g. inside forwarded headers)
 */
export function prepareUnifiedDraftHtml(
  options: PrepareDraftContentOptions
): PreparedUnifiedDraft {
  const { bodyHtml, bodyText, attachments, loadRemoteImages = false } = options

  let content = bodyHtml?.trim() || ""

  if (!content) {
    if (bodyText && bodyText.trim()) {
      return {
        stylesHtml: "",
        bodyHtml: plainTextLinesToParagraphHtml(bodyText, false),
        hasRemoteImages: false,
        isRichHtml: false,
      }
    }
    return {
      stylesHtml: "",
      bodyHtml: "",
      hasRemoteImages: false,
      isRichHtml: false,
    }
  }

  const extractedStyles: string[] = []
  content = content.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (styleTag) => {
    extractedStyles.push(styleTag)
    return ""
  })

  content = content.replace(/<!DOCTYPE[^>]*>/gi, "")
  const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch) {
    content = bodyMatch[1]
  }
  content = content.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
  content = content.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  content = content.replace(/<script\b[^>]*>/gi, "")
  content = content.replace(
    /\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi,
    ""
  )
  content = content.replace(/<\/?html[^>]*>/gi, "").trim()

  const preWrapMatch = content.match(
    /^<pre\b[^>]*style\s*=\s*(?:"[^"]*white-space:\s*pre-wrap[^"]*"|'[^']*white-space:\s*pre-wrap[^']*')[^>]*>([\s\S]*?)<\/pre>$/i
  )
  if (preWrapMatch && !/<code\b/i.test(preWrapMatch[1])) {
    content = plainTextLinesToParagraphHtml(preWrapMatch[1], true)
  }

  content = resolveInlineAttachmentsInHtml(content, attachments)

  const hasRemoteImages = /data-saturn-remote-src\s*=/i.test(content)
  if (loadRemoteImages) {
    content = content.replace(
      /data-saturn-remote-src=(["'])(.*?)\1/gi,
      'src="$2"'
    )
  }

  content = linkifyEmailsInHtml(content)

  const stylesHtml = extractedStyles.join("")
  const isRichHtml =
    Boolean(stylesHtml) ||
    /<(?:table|center)\b|\b(?:bgcolor|background)\s*=/i.test(content) ||
    /style\s*=\s*["'][^"']*background(?:-color)?\s*:/i.test(content)

  return {
    stylesHtml,
    bodyHtml: content,
    hasRemoteImages,
    isRichHtml,
  }
}

/**
 * Combines editable composer HTML with an optional preserved quoted/forwarded HTML block.
 */
export function combineDraftBodyHtml(
  editableHtml: string,
  quotedHtml?: string
): string {
  const trimmedQuote = quotedHtml?.trim() || ""
  if (!trimmedQuote) return editableHtml
  const trimmedEditable = editableHtml?.trim() || ""
  if (!trimmedEditable) return `<p><br></p>${trimmedQuote}`
  return `${trimmedEditable}${trimmedQuote}`
}

/**
 * Strips HTML tags into readable plain text for draft bodyText fallback.
 */
export function stripHtmlToPlainText(html: string): string {
  if (!html) return ""
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
