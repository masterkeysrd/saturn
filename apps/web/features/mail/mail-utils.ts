import type { Message, Thread } from "@saturn/api/saturn/mail/v1/mail"

export const MAIL_RAIL_OPEN_KEY = "saturn:mail-rail-open"
export const MAIL_LIST_WIDTH_KEY = "saturn:mail-list-width"
export const MAIL_LAYOUT_KEY = "saturn:mail-layout"

export const MAIL_LIST_MIN_WIDTH = 280
export const MAIL_LIST_MAX_WIDTH = 540
export const MAIL_LIST_DEFAULT_WIDTH = 360

export const UNDO_SEND_DELAY_MS = 7000

export type MailLayoutMode = "split" | "list"

export function readMailRailOpenPref(): boolean {
  try {
    if (typeof window === "undefined") return true
    const raw = window.localStorage.getItem(MAIL_RAIL_OPEN_KEY)
    return raw === null ? true : raw !== "false"
  } catch {
    return true
  }
}

export function writeMailRailOpenPref(open: boolean): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MAIL_RAIL_OPEN_KEY, open ? "true" : "false")
    }
  } catch {
    // Ignore storage errors
  }
}

export function clampMailListWidth(width: number): number {
  if (!Number.isFinite(width)) return MAIL_LIST_DEFAULT_WIDTH
  return Math.min(MAIL_LIST_MAX_WIDTH, Math.max(MAIL_LIST_MIN_WIDTH, width))
}

export function readMailListWidthPref(): number {
  try {
    if (typeof window === "undefined") return MAIL_LIST_DEFAULT_WIDTH
    const raw = window.localStorage.getItem(MAIL_LIST_WIDTH_KEY)
    if (!raw) return MAIL_LIST_DEFAULT_WIDTH
    return clampMailListWidth(Number(raw))
  } catch {
    return MAIL_LIST_DEFAULT_WIDTH
  }
}

export function writeMailListWidthPref(width: number): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        MAIL_LIST_WIDTH_KEY,
        String(clampMailListWidth(width))
      )
    }
  } catch {
    // Ignore storage errors
  }
}

export function readMailLayoutPref(): MailLayoutMode {
  try {
    if (typeof window === "undefined") return "split"
    const raw = window.localStorage.getItem(MAIL_LAYOUT_KEY)
    return raw === "list" ? "list" : "split"
  } catch {
    return "split"
  }
}

export function writeMailLayoutPref(mode: MailLayoutMode): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MAIL_LAYOUT_KEY, mode)
    }
  } catch {
    // Ignore storage errors
  }
}

const FINANCIAL_SIGNAL_REGEX =
  /receipt|invoice|order|payment|charged|statement|bill/i

export function hasFinancialSignal(
  subject?: string,
  snippet?: string
): boolean {
  const combined = `${subject ?? ""} ${snippet ?? ""}`.trim()
  return FINANCIAL_SIGNAL_REGEX.test(combined)
}

export function extractVendorFromSender(name?: string, email?: string): string {
  const trimmedName = (name ?? "").trim()
  if (trimmedName && !trimmedName.includes("@")) {
    return trimmedName
  }
  const trimmedEmail = (email ?? "").trim()
  const atIndex = trimmedEmail.indexOf("@")
  if (atIndex === -1) return trimmedName || "Unknown Vendor"

  const domain = trimmedEmail.slice(atIndex + 1).toLowerCase()
  const parts = domain.split(".").filter(Boolean)
  if (parts.length === 0) return trimmedEmail

  // Pick the primary brand segment (e.g. mail.stripe.com -> stripe, amazon.co.uk -> amazon)
  let brand = parts[0]
  if (
    parts.length >= 3 &&
    [
      "mail",
      "email",
      "mg",
      "noreply",
      "notify",
      "billing",
      "receipts",
    ].includes(parts[0])
  ) {
    brand = parts[1]
  } else if (
    parts.length >= 2 &&
    ["co", "com", "org", "net"].includes(parts[parts.length - 2]) &&
    parts.length >= 3
  ) {
    brand = parts[parts.length - 3]
  }

  return brand.charAt(0).toUpperCase() + brand.slice(1)
}

export type StageFinanceDocType = "RECEIPT" | "INVOICE" | "BANK_NOTIFICATION"

export function inferFinanceDocType(
  subject?: string,
  bodyText?: string
): StageFinanceDocType {
  const text = `${subject ?? ""} ${bodyText ?? ""}`
  if (/\binvoice\b/i.test(text)) {
    return "INVOICE"
  }
  if (
    /\b(bank|charged|card ending|debit|credit|transaction alert|wire)\b/i.test(
      text
    )
  ) {
    return "BANK_NOTIFICATION"
  }
  return "RECEIPT"
}

const SYMBOL_CURRENCY_MAP: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
}

export function extractAmountAndCurrency(
  text: string,
  fallbackCurrency = "USD"
): { amountString: string; currency: string } {
  const source = text || ""

  // 1. ISO code before amount (e.g. "USD 120.00", "EUR 42,50" -> normalize comma thousands)
  const isoPrefixMatch = source.match(
    /\b(USD|EUR|GBP|CAD|AUD|DOP|MXN|BRL|COP|CHF|JPY)\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\b/i
  )
  if (isoPrefixMatch) {
    return {
      currency: isoPrefixMatch[1].toUpperCase(),
      amountString: isoPrefixMatch[2].replace(/,/g, ""),
    }
  }

  // 2. Amount followed by ISO code (e.g. "120.00 USD")
  const isoSuffixMatch = source.match(
    /\b([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s*(USD|EUR|GBP|CAD|AUD|DOP|MXN|BRL|COP|CHF|JPY)\b/i
  )
  if (isoSuffixMatch) {
    return {
      amountString: isoSuffixMatch[1].replace(/,/g, ""),
      currency: isoSuffixMatch[2].toUpperCase(),
    }
  }

  // 3. Currency symbol before amount (e.g. "$42.50", "€19.99", "£35.00")
  const symbolMatch = source.match(
    /([$€£¥])\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/
  )
  if (symbolMatch) {
    return {
      currency: SYMBOL_CURRENCY_MAP[symbolMatch[1]] || fallbackCurrency,
      amountString: symbolMatch[2].replace(/,/g, ""),
    }
  }

  return {
    amountString: "",
    currency: fallbackCurrency,
  }
}

export interface StageToFinanceInitialData {
  threadId: string
  sourceMessageId: string
  subject: string
  vendorName: string
  docType: StageFinanceDocType
  amountString: string
  currency: string
  transactionDateIso: string
  rawPayload: string
}

export function buildFinanceStageDefaults(
  thread: Thread,
  message?: Message,
  fallbackCurrency = ""
): StageToFinanceInitialData {
  const targetMsg = message || thread.messages[thread.messages.length - 1]
  const subject = targetMsg?.subject || thread.subject || ""
  const plain =
    targetMsg?.bodyPlain || targetMsg?.snippet || thread.snippet || ""
  const combinedText = `${subject}\n${plain}`

  const vendorName = extractVendorFromSender(
    targetMsg?.from?.name,
    targetMsg?.from?.email
  )
  const docType = inferFinanceDocType(subject, plain)
  const { amountString, currency } = extractAmountAndCurrency(
    combinedText,
    fallbackCurrency
  )
  const transactionDateIso =
    targetMsg?.sentAt || targetMsg?.receivedAt || thread.lastMessageAt || ""

  const rawPayload = `${subject}\n\n${plain}`.trim().slice(0, 4000)

  return {
    threadId: thread.id,
    sourceMessageId: targetMsg?.id || thread.id,
    subject,
    vendorName,
    docType,
    amountString,
    currency,
    transactionDateIso,
    rawPayload,
  }
}
