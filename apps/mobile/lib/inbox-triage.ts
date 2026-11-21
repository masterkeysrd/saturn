import { decodeBase64Utf8 } from "@saturn/core"
import type { TranslationKey } from "@saturn/i18n"
import type {
  BorrowingLinkType,
  InboxItem,
  InboxItem_DocType,
  UpdateInboxItemRequest,
} from "@saturn/api/saturn/finance/v1/finance"

export type InboxFlowType = "EXPENSE" | "INCOME" | "TRANSFER"
export type InboxEditableDocType = "RECEIPT" | "INVOICE" | "BANK_NOTIFICATION"

export interface InboxItemDraftPatch {
  docType?: InboxItem_DocType
  transactionType?: InboxFlowType
  amount?: string
  currency?: string
  vendorName?: string
  transactionDate?: string
  accountId?: string
  destinationAccountId?: string
  budgetId?: string
  scheduledTransactionId?: string
  transactionId?: string
  borrowingId?: string
  borrowingLinkType?: BorrowingLinkType
}

export function resolveInboxTransactionType(
  item: Pick<InboxItem, "metadata">
): InboxFlowType {
  const raw = (item.metadata?.transaction_type || "").trim().toUpperCase()
  if (raw === "INCOME") return "INCOME"
  if (raw === "TRANSFER") return "TRANSFER"
  return "EXPENSE"
}

export function canQuickApproveInboxItem(
  item: Pick<
    InboxItem,
    | "amount"
    | "vendorName"
    | "budgetId"
    | "accountId"
    | "scheduledTransactionId"
    | "borrowingId"
    | "metadata"
  >
): boolean {
  const amountCents = Number(item.amount || 0)
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return false
  }
  if (!item.vendorName || item.vendorName.trim().length === 0) {
    return false
  }

  const txnType = resolveInboxTransactionType(item)
  if (txnType === "TRANSFER") {
    return (
      Boolean(item.accountId) &&
      Boolean(item.metadata?.destination_account_id) &&
      item.accountId !== item.metadata?.destination_account_id
    )
  }

  if (
    txnType === "EXPENSE" &&
    !item.scheduledTransactionId &&
    !item.borrowingId
  ) {
    return Boolean(item.budgetId)
  }

  return true
}

export function getInboxDocTypeLabelKey(
  docType?: InboxItem_DocType | string
): TranslationKey {
  switch (docType) {
    case "RECEIPT":
      return "finance.inbox.docTypes.receipt"
    case "INVOICE":
      return "finance.inbox.docTypes.invoice"
    case "BANK_NOTIFICATION":
      return "finance.inbox.docTypes.bankAlert"
    default:
      return "finance.inbox.card.document"
  }
}

export function decodeInboxRawPayload(rawPayload?: string): string {
  if (!rawPayload) return ""
  const compact = rawPayload.replace(/[\r\n]/g, "")
  const looksLikeBase64 =
    compact.length >= 4 &&
    compact.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(compact)
  if (!looksLikeBase64) {
    return rawPayload
  }
  try {
    const decoded = decodeBase64Utf8(compact)
    if (
      decoded &&
      decoded !== compact &&
      !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/.test(decoded)
    ) {
      return decoded
    }
  } catch {
    return rawPayload
  }
  return rawPayload
}

export function parseDecimalToCentsString(
  amountStr: string,
  fallbackCents = "0"
): string {
  const normalized = amountStr.replace(/,/g, "").trim()
  if (!normalized) return fallbackCents
  const parsed = Number.parseFloat(normalized)
  if (!Number.isFinite(parsed) || parsed < 0) return fallbackCents
  return String(Math.round(parsed * 100))
}

export function buildUpdateInboxItemRequest(
  item: InboxItem,
  patch: InboxItemDraftPatch
): { id: string; req: UpdateInboxItemRequest } {
  const id = item.id || ""
  const paths = new Set<string>()

  const nextDocType = patch.docType ?? item.docType ?? "RECEIPT"
  if (patch.docType !== undefined) paths.add("doc_type")

  const nextAmount = patch.amount ?? item.amount ?? "0"
  if (patch.amount !== undefined) paths.add("amount")

  const nextCurrency = patch.currency ?? item.currency ?? "USD"
  if (patch.currency !== undefined) paths.add("currency")

  const nextVendorName = patch.vendorName ?? item.vendorName ?? ""
  if (patch.vendorName !== undefined) paths.add("vendor_name")

  const nextTransactionDate =
    patch.transactionDate ?? item.transactionDate ?? ""
  if (patch.transactionDate !== undefined) paths.add("transaction_date")

  const nextAccountId = patch.accountId ?? item.accountId ?? ""
  if (patch.accountId !== undefined) paths.add("account_id")

  const nextBudgetId = patch.budgetId ?? item.budgetId ?? ""
  if (patch.budgetId !== undefined) paths.add("budget_id")

  const nextScheduledId =
    patch.scheduledTransactionId ?? item.scheduledTransactionId ?? ""
  if (patch.scheduledTransactionId !== undefined) {
    paths.add("scheduled_transaction_id")
  }

  const nextTransactionId = patch.transactionId ?? item.transactionId ?? ""
  if (patch.transactionId !== undefined) paths.add("transaction_id")

  const nextBorrowingId = patch.borrowingId ?? item.borrowingId ?? ""
  if (patch.borrowingId !== undefined) paths.add("borrowing_id")

  const nextBorrowingLinkType =
    patch.borrowingLinkType ?? item.borrowingLinkType
  if (patch.borrowingLinkType !== undefined) {
    paths.add("borrowing_link_type")
  }

  const nextMetadata: Record<string, string> = { ...(item.metadata || {}) }
  if (patch.transactionType !== undefined) {
    nextMetadata.transaction_type = patch.transactionType
    paths.add("metadata")
  }
  if (patch.destinationAccountId !== undefined) {
    if (patch.destinationAccountId) {
      nextMetadata.destination_account_id = patch.destinationAccountId
    } else {
      delete nextMetadata.destination_account_id
    }
    paths.add("metadata")
  }

  const inboxItem: InboxItem = {
    id,
    spaceId: item.spaceId,
    flowRunId: item.flowRunId,
    status: item.status,
    docType: nextDocType,
    amount: nextAmount,
    currency: nextCurrency,
    vendorName: nextVendorName,
    transactionDate: nextTransactionDate,
    accountId: nextAccountId,
    budgetId: nextBudgetId,
    scheduledTransactionId: nextScheduledId,
    transactionId: nextTransactionId,
    borrowingId: nextBorrowingId || undefined,
    borrowingLinkType: nextBorrowingLinkType,
    rawPayload: item.rawPayload,
    metadata: nextMetadata,
  }

  return {
    id,
    req: {
      id,
      inboxItem,
      updateMask: {
        paths: Array.from(paths),
      },
    },
  }
}
