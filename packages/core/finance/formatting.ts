export function formatCents(cents: string | number | undefined | null): number {
  if (cents === undefined || cents === null) return 0
  const val = typeof cents === "number" ? cents : parseFloat(cents)
  return isNaN(val) ? 0 : val / 100
}

export function formatAmount(
  cents: string | number | undefined | null,
  currency?: string
): string {
  const amount = formatCents(cents)
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return currency ? `${formatted} ${currency}` : formatted
}

export function toCentsString(amountStr: string | number): string {
  const val = typeof amountStr === "number" ? amountStr : parseFloat(amountStr)
  return isNaN(val) ? "0" : Math.round(val * 100).toString()
}

export function formatInterval(interval: string | undefined | null): string {
  if (!interval) return "Monthly"
  const clean = interval.replace(/^(INTERVAL_|STATUS_)/i, "").toLowerCase()
  if (!clean) return "Monthly"
  if (clean === "one_time") return "One-Time"
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

export function formatNextDueDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "N/A"
  const d = new Date(dateStr)
  if (isNaN(d.getTime()) || d.getFullYear() <= 1970) return "N/A"
  const now = new Date()
  const showYear = d.getFullYear() !== now.getFullYear()
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: showYear ? "numeric" : undefined,
    timeZone: "UTC",
  })
}

export function formatStatus(status: string | undefined | null): string {
  if (!status) return "Active"
  const clean = status
    .replace(
      /^(STATUS_|RECURRING_EXPENSE_STATUS_|RECURRING_TRANSACTION_STATUS_)/i,
      ""
    )
    .toLowerCase()
  if (!clean || clean === "unspecified") return "Active"
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

export function isStatusActive(status: string | undefined | null): boolean {
  if (!status) return true
  const clean = status
    .replace(
      /^(STATUS_|RECURRING_EXPENSE_STATUS_|RECURRING_TRANSACTION_STATUS_)/i,
      ""
    )
    .toUpperCase()
  return clean === "ACTIVE" || clean === "UNSPECIFIED"
}

export function formatSourceType(
  sourceType: string | undefined | null
): string {
  if (!sourceType) return "Scheduled Payment"
  const clean = sourceType
    .replace(/^SOURCE_TYPE_/i, "")
    .replace(/_/g, " ")
    .toLowerCase()
  if (!clean || clean === "unspecified") return "Scheduled Payment"
  if (clean === "recurrent expense" || clean === "recurring expense")
    return "Recurring Expense"
  return clean
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
