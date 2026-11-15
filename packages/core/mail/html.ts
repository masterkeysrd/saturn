const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#039;": "'",
}

function isAsciiLetter(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

function isTagNameChar(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) ||
    ch === "-" ||
    ch === ":"
  )
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f"
}

interface ParsedTagHeader {
  isClosing: boolean
  tagName: string
  tagNameLower: string
  tagEnd: number
}

function parseTagHeader(html: string, ltIdx: number): ParsedTagHeader | null {
  const len = html.length
  let i = ltIdx + 1
  if (i >= len) return null

  let isClosing = false
  if (html[i] === "/") {
    isClosing = true
    i += 1
    if (i >= len) return null
  }

  if (!isAsciiLetter(html[i])) return null

  const nameStart = i
  while (i < len && isTagNameChar(html[i])) {
    i += 1
  }

  // Must be followed by whitespace, '/', or '>' to be a well-formed tag name
  if (i >= len) return null
  const nextCh = html[i]
  if (!isWhitespace(nextCh) && nextCh !== "/" && nextCh !== ">") {
    return null
  }

  // Scan to closing '>' while respecting single/double quoted attribute values
  let quote: string | null = null
  let gt = -1
  for (let j = i; j < len; j++) {
    const ch = html[j]
    if (quote !== null) {
      if (ch === quote) {
        quote = null
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === ">") {
      gt = j
      break
    }
  }

  if (gt === -1) return null

  const tagName = html.slice(nameStart, i)
  return {
    isClosing,
    tagName,
    tagNameLower: tagName.toLowerCase(),
    tagEnd: gt,
  }
}

export function findClosingTag(
  html: string,
  fromIdx: number,
  tagNameLower: string
): { closeStart: number; closeEnd: number } | null {
  let pos = fromIdx
  while (pos < html.length) {
    const lt = html.indexOf("<", pos)
    if (lt === -1) return null
    if (html[lt + 1] === "/") {
      const header = parseTagHeader(html, lt)
      if (header && header.isClosing && header.tagNameLower === tagNameLower) {
        return { closeStart: lt, closeEnd: header.tagEnd + 1 }
      }
    }
    pos = lt + 1
  }
  return null
}

function isEventHandlerAttr(attrNameLower: string): boolean {
  if (attrNameLower.length < 3 || !attrNameLower.startsWith("on")) {
    return false
  }
  for (let i = 2; i < attrNameLower.length; i++) {
    if (!isAsciiLetter(attrNameLower[i])) return false
  }
  return true
}

function stripEventHandlersFromOpeningTag(
  html: string,
  ltIdx: number,
  header: ParsedTagHeader
): string {
  const gtIdx = header.tagEnd
  const afterNameIdx =
    ltIdx + 1 + (header.isClosing ? 1 : 0) + header.tagName.length
  const inner = html.slice(afterNameIdx, gtIdx)

  if (!inner.trim()) {
    return html.slice(ltIdx, gtIdx + 1)
  }

  const keptParts: string[] = []
  let i = 0
  const len = inner.length
  let selfClosing = false

  while (i < len) {
    while (i < len && (isWhitespace(inner[i]) || inner[i] === "/")) {
      if (inner[i] === "/" && inner.slice(i + 1).trim() === "") {
        selfClosing = true
      }
      i += 1
    }
    if (i >= len) break

    const nameStart = i
    while (
      i < len &&
      !isWhitespace(inner[i]) &&
      inner[i] !== "=" &&
      inner[i] !== "/"
    ) {
      i += 1
    }
    const attrName = inner.slice(nameStart, i)
    if (!attrName) break

    let j = i
    while (j < len && isWhitespace(inner[j])) {
      j += 1
    }

    let attrEnd = i
    if (j < len && inner[j] === "=") {
      j += 1
      while (j < len && isWhitespace(inner[j])) {
        j += 1
      }
      if (j < len && (inner[j] === '"' || inner[j] === "'")) {
        const quote = inner[j]
        j += 1
        while (j < len && inner[j] !== quote) {
          j += 1
        }
        if (j < len && inner[j] === quote) {
          j += 1
        }
        attrEnd = j
      } else {
        while (j < len && !isWhitespace(inner[j])) {
          j += 1
        }
        attrEnd = j
      }
    }

    if (!isEventHandlerAttr(attrName.toLowerCase())) {
      keptParts.push(inner.slice(nameStart, attrEnd))
    }
    i = attrEnd
  }

  const attrsStr = keptParts.length > 0 ? ` ${keptParts.join(" ")}` : ""
  const slashStr = selfClosing ? " /" : ""
  return `<${header.tagName}${attrsStr}${slashStr}>`
}

export interface SanitizeEmailHtmlOptions {
  extractStyles?: boolean
  stripStyles?: boolean
  extractBody?: boolean
  stripDocumentWrappers?: boolean
}

export interface SanitizeEmailHtmlResult {
  html: string
  extractedStyles: string[]
}

/**
 * Linear-time HTML sanitizer for email fragments and documents.
 * - Strips <script> tags (including malformed closing tags) and inline on* event handlers
 * - Optionally extracts or strips <style> blocks
 * - Optionally strips <!DOCTYPE>, <html>, and <head> wrappers and extracts <body> contents
 * - Escapes malformed/non-tag '<' characters to prevent multi-character tag reconstruction
 */
export function sanitizeEmailHtml(
  html: string,
  options: SanitizeEmailHtmlOptions = {}
): SanitizeEmailHtmlResult {
  const {
    extractStyles = false,
    stripStyles = false,
    extractBody = false,
    stripDocumentWrappers = false,
  } = options

  if (!html) {
    return { html: "", extractedStyles: [] }
  }

  const extractedStyles: string[] = []
  let out: string[] = []
  let pos = 0
  let inHead = false
  let seenBody = false

  while (pos < html.length) {
    const lt = html.indexOf("<", pos)
    if (lt === -1) {
      if (!inHead) {
        out.push(html.slice(pos))
      }
      break
    }

    if (lt > pos && !inHead) {
      out.push(html.slice(pos, lt))
    }

    // Handle HTML comments <!-- ... -->
    if (html.startsWith("<!--", lt)) {
      const commentEnd = html.indexOf("-->", lt + 4)
      if (commentEnd === -1) {
        if (!inHead) out.push("&lt;")
        pos = lt + 1
        continue
      }
      if (!inHead) {
        out.push(html.slice(lt, commentEnd + 3))
      }
      pos = commentEnd + 3
      continue
    }

    // Handle <!DOCTYPE ...> or other <!...> declarations
    if (html[lt + 1] === "!") {
      const gt = html.indexOf(">", lt + 2)
      if (gt === -1) {
        if (!inHead) out.push("&lt;")
        pos = lt + 1
        continue
      }
      const decl = html.slice(lt, gt + 1)
      if (!inHead && !(stripDocumentWrappers && /^<!doctype\b/i.test(decl))) {
        out.push(decl)
      }
      pos = gt + 1
      continue
    }

    const header = parseTagHeader(html, lt)
    if (!header) {
      if (!inHead) {
        out.push("&lt;")
      }
      pos = lt + 1
      continue
    }

    const { isClosing, tagNameLower, tagEnd } = header

    if (tagNameLower === "script") {
      if (!isClosing) {
        const close = findClosingTag(html, tagEnd + 1, "script")
        pos = close ? close.closeEnd : tagEnd + 1
      } else {
        pos = tagEnd + 1
      }
      continue
    }

    if (tagNameLower === "head" && stripDocumentWrappers) {
      if (!isClosing) {
        const hasClose = findClosingTag(html, tagEnd + 1, "head") !== null
        if (hasClose) {
          inHead = true
        }
      } else {
        inHead = false
      }
      pos = tagEnd + 1
      continue
    }

    if (tagNameLower === "style") {
      if (!isClosing) {
        const close = findClosingTag(html, tagEnd + 1, "style")
        if (close) {
          if (extractStyles) {
            extractedStyles.push(html.slice(lt, close.closeEnd))
          } else if (!stripStyles && !inHead) {
            out.push(html.slice(lt, close.closeEnd))
          }
          pos = close.closeEnd
          continue
        }
      }
      if (!extractStyles && !stripStyles && !inHead) {
        out.push(html.slice(lt, tagEnd + 1))
      }
      pos = tagEnd + 1
      continue
    }

    if (tagNameLower === "html" && stripDocumentWrappers) {
      pos = tagEnd + 1
      continue
    }

    if (tagNameLower === "body") {
      if (extractBody) {
        if (!isClosing && !seenBody) {
          const hasBodyClose = findClosingTag(html, tagEnd + 1, "body") !== null
          if (hasBodyClose) {
            inHead = false
            seenBody = true
            out = []
            pos = tagEnd + 1
            continue
          }
        } else if (isClosing && seenBody) {
          break
        }
      }
      if (stripDocumentWrappers) {
        inHead = false
        pos = tagEnd + 1
        continue
      }
    }

    if (inHead) {
      pos = tagEnd + 1
      continue
    }

    if (isClosing) {
      out.push(`</${header.tagName}>`)
    } else {
      out.push(stripEventHandlersFromOpeningTag(html, lt, header))
    }
    pos = tagEnd + 1
  }

  return {
    html: out.join(""),
    extractedStyles,
  }
}

/**
 * Strips HTML tags into readable plain text for draft bodyText fallback.
 */
export function stripHtmlToPlainText(html: string): string {
  if (!html) return ""

  const parts: string[] = []
  let pos = 0

  while (pos < html.length) {
    const lt = html.indexOf("<", pos)
    if (lt === -1) {
      parts.push(html.slice(pos))
      break
    }

    if (lt > pos) {
      parts.push(html.slice(pos, lt))
    }

    if (html.startsWith("<!--", lt)) {
      const commentEnd = html.indexOf("-->", lt + 4)
      if (commentEnd !== -1) {
        pos = commentEnd + 3
        continue
      }
    }

    if (html[lt + 1] === "!") {
      const gt = html.indexOf(">", lt + 2)
      if (gt !== -1) {
        pos = gt + 1
        continue
      }
    }

    const header = parseTagHeader(html, lt)
    if (!header) {
      parts.push("<")
      pos = lt + 1
      continue
    }

    const { isClosing, tagNameLower, tagEnd } = header

    if (!isClosing && (tagNameLower === "script" || tagNameLower === "style")) {
      const close = findClosingTag(html, tagEnd + 1, tagNameLower)
      pos = close ? close.closeEnd : tagEnd + 1
      continue
    }

    if (!isClosing && tagNameLower === "br") {
      parts.push("\n")
    } else if (
      isClosing &&
      (tagNameLower === "p" ||
        tagNameLower === "div" ||
        tagNameLower === "li" ||
        tagNameLower === "tr" ||
        tagNameLower === "blockquote" ||
        (tagNameLower.length === 2 &&
          tagNameLower[0] === "h" &&
          tagNameLower[1] >= "1" &&
          tagNameLower[1] <= "6"))
    ) {
      parts.push("\n")
    }

    pos = tagEnd + 1
  }

  return parts
    .join("")
    .replace(
      /&(nbsp|amp|lt|gt|quot|#0?39);/gi,
      (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Linkifies plain-text email addresses into mailto: anchors without modifying
 * existing <a> tags, <style> blocks, or HTML tag attributes.
 */
export function linkifyEmailsInHtml(html: string): string {
  if (!html || !html.includes("@")) return html

  const emailRegex = /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g
  const linkifyText = (text: string) =>
    text.includes("@")
      ? text.replace(emailRegex, '<a href="mailto:$1">$1</a>')
      : text

  const out: string[] = []
  let pos = 0

  while (pos < html.length) {
    const lt = html.indexOf("<", pos)
    if (lt === -1) {
      out.push(linkifyText(html.slice(pos)))
      break
    }

    if (lt > pos) {
      out.push(linkifyText(html.slice(pos, lt)))
    }

    if (html.startsWith("<!--", lt)) {
      const commentEnd = html.indexOf("-->", lt + 4)
      if (commentEnd !== -1) {
        out.push(html.slice(lt, commentEnd + 3))
        pos = commentEnd + 3
        continue
      }
    }

    const header = parseTagHeader(html, lt)
    if (!header) {
      out.push("<")
      pos = lt + 1
      continue
    }

    const { isClosing, tagNameLower, tagEnd } = header
    if (!isClosing && (tagNameLower === "style" || tagNameLower === "a")) {
      const close = findClosingTag(html, tagEnd + 1, tagNameLower)
      if (close) {
        out.push(html.slice(lt, close.closeEnd))
        pos = close.closeEnd
        continue
      }
    }

    out.push(html.slice(lt, tagEnd + 1))
    pos = tagEnd + 1
  }

  return out.join("")
}

export function isSingleBrTag(raw: string): boolean {
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed.startsWith("<br") || !trimmed.endsWith(">")) {
    return false
  }
  for (let i = 3; i < trimmed.length - 1; i++) {
    const ch = trimmed[i]
    if (!isWhitespace(ch) && ch !== "/") {
      return false
    }
  }
  return true
}

export function stripTrailingEmptyParagraphsAndBrs(input: string): string {
  let s = input.trimEnd()
  while (s.length > 0) {
    const lower = s.toLowerCase()
    if (lower.endsWith("</p>")) {
      const pOpen = lower.lastIndexOf("<p>")
      if (pOpen !== -1) {
        const inner = s.slice(pOpen + 3, -4).trim()
        if (inner === "" || isSingleBrTag(inner)) {
          s = s.slice(0, pOpen).trimEnd()
          continue
        }
      }
    }
    if (lower.endsWith(">")) {
      const lt = lower.lastIndexOf("<")
      if (lt !== -1 && isSingleBrTag(s.slice(lt))) {
        s = s.slice(0, lt).trimEnd()
        continue
      }
    }
    break
  }
  return s.trim()
}

export function stripEmptyWrapperDivs(html: string): string {
  const out: string[] = []
  let pos = 0

  while (pos < html.length) {
    const lt = html.indexOf("<", pos)
    if (lt === -1) {
      out.push(html.slice(pos))
      break
    }

    if (lt > pos) {
      out.push(html.slice(pos, lt))
    }

    const header = parseTagHeader(html, lt)
    if (header && !header.isClosing && header.tagNameLower === "div") {
      const close = findClosingTag(html, header.tagEnd + 1, "div")
      if (close) {
        const inner = html.slice(header.tagEnd + 1, close.closeStart).trim()
        if (inner === "" || isSingleBrTag(inner)) {
          pos = close.closeEnd
          continue
        }
      }
    }

    if (header) {
      out.push(html.slice(lt, header.tagEnd + 1))
      pos = header.tagEnd + 1
    } else {
      out.push("<")
      pos = lt + 1
    }
  }

  return out.join("")
}

/**
 * Finds the start index of an unwrapped "Begin forwarded message:" or
 * "---------- Forwarded message ---------" header block inside a <div> or <p>.
 */
export function findUnwrappedForwardHeaderStart(html: string): number {
  const markerRegex =
    /Begin forwarded message:|---------- Forwarded message ---------/gi
  let match: RegExpExecArray | null

  while ((match = markerRegex.exec(html)) !== null) {
    const markerStart = match.index
    const markerEnd = markerStart + match[0].length

    // Find the nearest preceding <div...> or <p...> block opener
    let blockStart = -1
    let blockTag: "div" | "p" | null = null
    let scanPos = 0

    while (scanPos < markerStart) {
      const lt = html.indexOf("<", scanPos)
      if (lt === -1 || lt >= markerStart) break
      const header = parseTagHeader(html, lt)
      if (!header) {
        scanPos = lt + 1
        continue
      }
      if (header.tagEnd >= markerStart) break

      if (header.tagNameLower === "div" || header.tagNameLower === "p") {
        if (!header.isClosing) {
          blockStart = lt
          blockTag = header.tagNameLower
          // Check that everything between header.tagEnd + 1 and markerStart is only tags and whitespace
        } else {
          blockStart = -1
          blockTag = null
        }
      }
      scanPos = header.tagEnd + 1
    }

    if (blockStart === -1 || blockTag === null) continue

    const openHeader = parseTagHeader(html, blockStart)
    if (!openHeader) continue

    // Verify only inline tags and whitespace lie between <div|p> and markerStart
    if (
      !isOnlyTagsAndWhitespace(html.slice(openHeader.tagEnd + 1, markerStart))
    ) {
      continue
    }

    // Verify only closing/br tags and whitespace lie between markerEnd and </div|p>
    let fwdPos = markerEnd
    let matchedClose = false
    while (fwdPos < html.length) {
      const ch = html[fwdPos]
      if (isWhitespace(ch)) {
        fwdPos += 1
        continue
      }
      if (ch === "<") {
        const header = parseTagHeader(html, fwdPos)
        if (!header) break
        if (header.isClosing && header.tagNameLower === blockTag) {
          matchedClose = true
          break
        }
        if (header.isClosing || header.tagNameLower === "br") {
          fwdPos = header.tagEnd + 1
          continue
        }
        break
      }
      break
    }

    if (matchedClose) {
      return blockStart
    }
  }

  return -1
}

function isOnlyTagsAndWhitespace(segment: string): boolean {
  let pos = 0
  while (pos < segment.length) {
    const ch = segment[pos]
    if (isWhitespace(ch)) {
      pos += 1
      continue
    }
    if (ch === "<") {
      const header = parseTagHeader(segment, pos)
      if (!header) return false
      pos = header.tagEnd + 1
      continue
    }
    return false
  }
  return true
}

/**
 * Checks if prefix ends with a standalone `<div>Begin forwarded message:</div>`
 * or `<p>Begin forwarded message:</p>` (ignoring trailing <br> and whitespace),
 * returning its start index or -1.
 */
export function findPrecedingBeginForwardedIndex(prefix: string): number {
  const trimmed = stripTrailingEmptyParagraphsAndBrs(prefix)
  const lower = trimmed.toLowerCase()

  let tag: "div" | "p" | null = null
  if (lower.endsWith("</div>")) tag = "div"
  else if (lower.endsWith("</p>")) tag = "p"
  if (!tag) return -1

  const closeTagLen = tag === "div" ? 6 : 4
  const contentEnd = trimmed.length - closeTagLen

  // Find the last opening <div...> or <p...> before contentEnd
  let lastOpenIdx = -1
  let lastOpenHeader: ParsedTagHeader | null = null
  let pos = 0
  while (pos < contentEnd) {
    const lt = trimmed.indexOf("<", pos)
    if (lt === -1 || lt >= contentEnd) break
    const header = parseTagHeader(trimmed, lt)
    if (!header) {
      pos = lt + 1
      continue
    }
    if (
      !header.isClosing &&
      header.tagNameLower === tag &&
      header.tagEnd < contentEnd
    ) {
      lastOpenIdx = lt
      lastOpenHeader = header
    }
    pos = header.tagEnd + 1
  }

  if (lastOpenIdx === -1 || !lastOpenHeader) return -1

  let inner = trimmed.slice(lastOpenHeader.tagEnd + 1, contentEnd).trim()
  // Strip optional trailing <br> inside the header block
  if (inner.endsWith(">")) {
    const lt = inner.lastIndexOf("<")
    if (lt !== -1 && isSingleBrTag(inner.slice(lt))) {
      inner = inner.slice(0, lt).trim()
    }
  }

  if (inner.toLowerCase() === "begin forwarded message:") {
    return lastOpenIdx
  }

  return -1
}

interface ParsedTagAttr {
  nameLower: string
  value: string
  raw: string
}

function parseTagAttributes(
  html: string,
  ltIdx: number,
  header: ParsedTagHeader
): { attrs: ParsedTagAttr[]; selfClosing: boolean } {
  const gtIdx = header.tagEnd
  const afterNameIdx =
    ltIdx + 1 + (header.isClosing ? 1 : 0) + header.tagName.length
  const inner = html.slice(afterNameIdx, gtIdx)

  const attrs: ParsedTagAttr[] = []
  let i = 0
  const len = inner.length
  let selfClosing = false

  while (i < len) {
    while (i < len && (isWhitespace(inner[i]) || inner[i] === "/")) {
      if (inner[i] === "/" && inner.slice(i + 1).trim() === "") {
        selfClosing = true
      }
      i += 1
    }
    if (i >= len) break

    const nameStart = i
    while (
      i < len &&
      !isWhitespace(inner[i]) &&
      inner[i] !== "=" &&
      inner[i] !== "/"
    ) {
      i += 1
    }
    const attrName = inner.slice(nameStart, i)
    if (!attrName) break

    let j = i
    while (j < len && isWhitespace(inner[j])) {
      j += 1
    }

    let attrEnd = i
    let value = ""
    if (j < len && inner[j] === "=") {
      j += 1
      while (j < len && isWhitespace(inner[j])) {
        j += 1
      }
      if (j < len && (inner[j] === '"' || inner[j] === "'")) {
        const quote = inner[j]
        j += 1
        const valStart = j
        while (j < len && inner[j] !== quote) {
          j += 1
        }
        value = inner.slice(valStart, j)
        if (j < len && inner[j] === quote) {
          j += 1
        }
        attrEnd = j
      } else {
        const valStart = j
        while (j < len && !isWhitespace(inner[j])) {
          j += 1
        }
        value = inner.slice(valStart, j)
        attrEnd = j
      }
    }

    attrs.push({
      nameLower: attrName.toLowerCase(),
      value,
      raw: inner.slice(nameStart, attrEnd),
    })
    i = attrEnd
  }

  return { attrs, selfClosing }
}

const QUOTED_DIV_CLASSES = new Set([
  "saturn-quoted-reply",
  "saturn-forwarded-message",
  "gmail_quote",
])

/**
 * Finds the first quoted reply/forward container (`<div class="saturn-quoted-reply|saturn-forwarded-message|gmail_quote">`
 * or `<blockquote type="cite">`) in linear time without regex backtracking.
 */
export function findQuotedBlockStart(
  html: string
): { kind: "div" | "blockquote"; index: number } | null {
  let pos = 0
  while (pos < html.length) {
    const lt = html.indexOf("<", pos)
    if (lt === -1) return null

    const header = parseTagHeader(html, lt)
    if (!header) {
      pos = lt + 1
      continue
    }

    if (!header.isClosing) {
      if (header.tagNameLower === "div") {
        const { attrs } = parseTagAttributes(html, lt, header)
        for (const attr of attrs) {
          if (attr.nameLower === "class") {
            const tokens = attr.value.toLowerCase().split(/\s+/)
            if (tokens.some((t) => QUOTED_DIV_CLASSES.has(t))) {
              return { kind: "div", index: lt }
            }
          }
        }
      } else if (header.tagNameLower === "blockquote") {
        const { attrs } = parseTagAttributes(html, lt, header)
        for (const attr of attrs) {
          if (
            attr.nameLower === "type" &&
            attr.value.trim().toLowerCase() === "cite"
          ) {
            return { kind: "blockquote", index: lt }
          }
        }
      }
    }

    pos = header.tagEnd + 1
  }
  return null
}

/**
 * Rewrites `data-saturn-remote-src="..."` attributes on HTML tags to `src="..."`
 * in linear time without regex backtracking.
 */
export function restoreRemoteImageSrc(html: string): string {
  if (!html || !html.toLowerCase().includes("data-saturn-remote-src")) {
    return html
  }

  const out: string[] = []
  let pos = 0

  while (pos < html.length) {
    const lt = html.indexOf("<", pos)
    if (lt === -1) {
      out.push(html.slice(pos))
      break
    }

    if (lt > pos) {
      out.push(html.slice(pos, lt))
    }

    const header = parseTagHeader(html, lt)
    if (!header) {
      out.push("<")
      pos = lt + 1
      continue
    }

    if (!header.isClosing) {
      const rawTag = html.slice(lt, header.tagEnd + 1)
      if (rawTag.toLowerCase().includes("data-saturn-remote-src")) {
        const { attrs, selfClosing } = parseTagAttributes(html, lt, header)
        const rebuiltAttrs = attrs.map((attr) =>
          attr.nameLower === "data-saturn-remote-src"
            ? `src="${attr.value}"`
            : attr.raw
        )
        const attrsStr =
          rebuiltAttrs.length > 0 ? ` ${rebuiltAttrs.join(" ")}` : ""
        const slashStr = selfClosing ? " /" : ""
        out.push(`<${header.tagName}${attrsStr}${slashStr}>`)
        pos = header.tagEnd + 1
        continue
      }
    }

    out.push(html.slice(lt, header.tagEnd + 1))
    pos = header.tagEnd + 1
  }

  return out.join("")
}
