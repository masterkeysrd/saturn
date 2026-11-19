import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Keyboard,
} from "react-native"
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileText,
  HandCoins,
  Landmark,
  PiggyBank,
  Trash2,
  X,
} from "lucide-react-native"
import type {
  Account,
  Borrowing,
  Budget,
  InboxItem,
  InboxItem_DocType,
  RecurringTransaction,
  ScheduledTransaction,
} from "@saturn/api/saturn/finance/v1/finance"
import {
  formatAmount,
  getCurrencySymbol,
  getScheduledDisplayName,
} from "@saturn/core"
import { useTimezone } from "@saturn/hooks"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import {
  decodeInboxRawPayload,
  parseDecimalToCentsString,
  resolveInboxTransactionType,
  type InboxEditableDocType,
  type InboxFlowType,
  type InboxItemDraftPatch,
} from "@/lib/inbox-triage"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"

export interface InboxReviewDraft {
  docType: InboxEditableDocType
  transactionType: InboxFlowType
  vendorName: string
  amountStr: string
  currency: string
  accountId: string
  destinationAccountId: string
  budgetId: string
  scheduledTransactionId: string
  borrowingId: string
}

export function createInitialInboxReviewDraft(
  item: InboxItem,
  baseCurrency: string
): InboxReviewDraft {
  const docRaw = (item.docType || "RECEIPT").toUpperCase()
  const docType: InboxEditableDocType =
    docRaw === "INVOICE" || docRaw === "BANK_NOTIFICATION" ? docRaw : "RECEIPT"

  const cents = Number(item.amount || 0)
  const amountStr =
    Number.isFinite(cents) && cents > 0 ? (cents / 100).toFixed(2) : ""

  return {
    docType,
    transactionType: resolveInboxTransactionType(item),
    vendorName: item.vendorName || "",
    amountStr,
    currency: item.currency || baseCurrency || "USD",
    accountId: item.accountId || "",
    destinationAccountId: item.metadata?.destination_account_id || "",
    budgetId: item.budgetId || "",
    scheduledTransactionId: item.scheduledTransactionId || "",
    borrowingId:
      item.borrowingId || item.metadata?.suggested_borrowing_id || "",
  }
}

export interface InboxReviewSheetProps {
  item: InboxItem | null
  draft: InboxReviewDraft | null
  onChangeDraft: (updater: (prev: InboxReviewDraft) => InboxReviewDraft) => void
  accounts: Account[]
  budgets: Budget[]
  scheduledTransactions: ScheduledTransaction[]
  recurringTemplates: RecurringTransaction[]
  borrowings: Borrowing[]
  baseCurrency: string
  isWritable: boolean
  isSubmitting: boolean
  isDiscarding: boolean
  hintMessage?: string | null
  errorMessage?: string | null
  onClose: () => void
  onOpenCurrencyPicker: () => void
  onOpenAccountPicker: () => void
  onOpenDestinationAccountPicker: () => void
  onOpenBudgetPicker: () => void
  onOpenScheduledPicker: () => void
  onOpenBorrowingPicker: () => void
  onApproveAndRecord: (item: InboxItem, patch: InboxItemDraftPatch) => void
  onDiscard: (item: InboxItem) => void
}

const FLOW_TYPE_OPTIONS: readonly { value: InboxFlowType; label: string }[] = [
  { value: "EXPENSE", label: "Expense" },
  { value: "INCOME", label: "Income" },
  { value: "TRANSFER", label: "Transfer" },
]

const DOC_TYPE_OPTIONS: readonly {
  value: InboxEditableDocType
  label: string
}[] = [
  { value: "RECEIPT", label: "Receipt" },
  { value: "INVOICE", label: "Invoice" },
  { value: "BANK_NOTIFICATION", label: "Bank Alert" },
]

export function InboxReviewSheet({
  item,
  draft,
  onChangeDraft,
  accounts,
  budgets,
  scheduledTransactions,
  recurringTemplates,
  borrowings,
  baseCurrency,
  isWritable,
  isSubmitting,
  isDiscarding,
  hintMessage,
  errorMessage,
  onClose,
  onOpenCurrencyPicker,
  onOpenAccountPicker,
  onOpenDestinationAccountPicker,
  onOpenBudgetPicker,
  onOpenScheduledPicker,
  onOpenBorrowingPicker,
  onApproveAndRecord,
  onDiscard,
}: InboxReviewSheetProps) {
  const { colors, isDark, getBudgetColors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const insets = useSafeAreaInsets()
  const tz = useTimezone()
  const sheetRef = useRef<BottomSheet>(null)

  const [payloadExpanded, setPayloadExpanded] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (item) {
      setPayloadExpanded(false)
      setLocalError(null)
      sheetRef.current?.expand()
    } else {
      sheetRef.current?.close()
    }
  }, [item])

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === draft?.accountId),
    [accounts, draft?.accountId]
  )
  const selectedDestAccount = useMemo(
    () => accounts.find((a) => a.id === draft?.destinationAccountId),
    [accounts, draft?.destinationAccountId]
  )
  const selectedBudget = useMemo(
    () => budgets.find((b) => b.id === draft?.budgetId),
    [budgets, draft?.budgetId]
  )
  const selectedScheduled = useMemo(
    () =>
      scheduledTransactions.find((s) => s.id === draft?.scheduledTransactionId),
    [scheduledTransactions, draft?.scheduledTransactionId]
  )
  const selectedBorrowing = useMemo(
    () => borrowings.find((b) => b.id === draft?.borrowingId),
    [borrowings, draft?.borrowingId]
  )

  const decodedPayload = useMemo(
    () => decodeInboxRawPayload(item?.rawPayload),
    [item?.rawPayload]
  )

  const handleClose = () => {
    Keyboard.dismiss()
    onClose()
  }

  const handleApprovePress = () => {
    if (!item || !draft || !isWritable) return
    setLocalError(null)

    const trimmedVendor = draft.vendorName.trim()
    if (!trimmedVendor) {
      haptics.warning()
      setLocalError("Vendor / Description is required.")
      return
    }

    const parsedAmount = Number.parseFloat(draft.amountStr.replace(/,/g, ""))
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      haptics.warning()
      setLocalError("Amount must be greater than zero.")
      return
    }

    if (draft.transactionType === "TRANSFER") {
      if (!draft.accountId || !draft.destinationAccountId) {
        haptics.warning()
        setLocalError(
          "Source and Destination accounts are both required for a transfer."
        )
        return
      }
      if (draft.accountId === draft.destinationAccountId) {
        haptics.warning()
        setLocalError("Source and Destination accounts must be different.")
        return
      }
    } else if (
      draft.transactionType === "EXPENSE" &&
      !draft.scheduledTransactionId &&
      !draft.borrowingId &&
      !draft.budgetId
    ) {
      haptics.warning()
      setLocalError(
        "Select a Budget category (or link a scheduled bill / loan) before approving."
      )
      return
    }

    if (draft.docType !== "INVOICE" && !draft.accountId) {
      haptics.warning()
      setLocalError("Select an Account before approving into the ledger.")
      return
    }

    Keyboard.dismiss()

    const patch: InboxItemDraftPatch = {
      docType: draft.docType as InboxItem_DocType,
      transactionType: draft.transactionType,
      vendorName: trimmedVendor,
      amount: parseDecimalToCentsString(draft.amountStr, item.amount || "0"),
      currency: draft.currency || baseCurrency || "USD",
      accountId: draft.accountId,
      destinationAccountId:
        draft.transactionType === "TRANSFER" ? draft.destinationAccountId : "",
      budgetId: draft.transactionType === "EXPENSE" ? draft.budgetId : "",
      scheduledTransactionId: draft.scheduledTransactionId,
      borrowingId: draft.borrowingId,
    }

    onApproveAndRecord(item, patch)
  }

  const budgetColors = selectedBudget
    ? getBudgetColors(selectedBudget.color || "indigo")
    : undefined

  const activeError = localError || errorMessage

  return (
    <AppBottomSheet
      ref={sheetRef}
      title="Review Inbox Item"
      snapPoints={["88%"]}
      onClose={handleClose}
    >
      {item && draft ? (
        <View style={styles.sheetRoot}>
          <BottomSheetScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {!isWritable && (
              <View style={styles.viewerBanner}>
                <Text style={styles.viewerBannerText}>
                  Read-only viewer role. Only workspace editors can approve or
                  discard inbox items.
                </Text>
              </View>
            )}

            {item.metadata?.potential_duplicate_id ? (
              <View style={styles.warningBanner}>
                <AlertTriangle size={16} color={colors.warning} />
                <View style={styles.bannerTextCol}>
                  <Text style={styles.warningTitle}>
                    Potential Duplicate Detected
                  </Text>
                  <Text style={styles.warningSubtitle}>
                    {item.metadata.duplicate_reason ||
                      "A matching transaction may already exist in your ledger."}
                  </Text>
                </View>
              </View>
            ) : null}

            {hintMessage && !activeError ? (
              <View style={styles.hintBanner}>
                <Text style={styles.hintBannerText}>{hintMessage}</Text>
              </View>
            ) : null}

            {activeError ? (
              <View style={styles.errorBanner}>
                <AlertTriangle size={16} color={colors.destructive} />
                <Text style={styles.errorBannerText}>{activeError}</Text>
              </View>
            ) : null}

            {/* Flow Type Segmented Control */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Transaction Type</Text>
              <View style={styles.segmentedTrack}>
                {FLOW_TYPE_OPTIONS.map((opt) => {
                  const selected = draft.transactionType === opt.value
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      activeOpacity={0.75}
                      disabled={!isWritable}
                      onPress={() => {
                        haptics.selection()
                        setLocalError(null)
                        onChangeDraft((prev) => ({
                          ...prev,
                          transactionType: opt.value,
                        }))
                      }}
                      style={[
                        styles.segmentedItem,
                        selected && styles.segmentedItemActive,
                      ]}
                      testID={`review-flow-type-${opt.value}`}
                    >
                      <Text
                        style={[
                          styles.segmentedText,
                          selected && styles.segmentedTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            {/* Document Type Segmented Control */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Document Type</Text>
              <View style={styles.segmentedTrack}>
                {DOC_TYPE_OPTIONS.map((opt) => {
                  const selected = draft.docType === opt.value
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      activeOpacity={0.75}
                      disabled={!isWritable}
                      onPress={() => {
                        haptics.selection()
                        setLocalError(null)
                        onChangeDraft((prev) => ({
                          ...prev,
                          docType: opt.value,
                        }))
                      }}
                      style={[
                        styles.segmentedItem,
                        selected && styles.segmentedItemActive,
                      ]}
                      testID={`review-doc-type-${opt.value}`}
                    >
                      <Text
                        style={[
                          styles.segmentedText,
                          selected && styles.segmentedTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            {/* Vendor / Description */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Vendor / Description</Text>
              <BottomSheetTextInput
                style={styles.textInput}
                editable={isWritable}
                value={draft.vendorName}
                onChangeText={(text) => {
                  setLocalError(null)
                  onChangeDraft((prev) => ({ ...prev, vendorName: text }))
                }}
                placeholder="Merchant or description"
                placeholderTextColor={colors.textMuted}
                keyboardAppearance={isDark ? "dark" : "light"}
                testID="review-vendor-input"
              />
            </View>

            {/* Amount & Currency */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Amount & Currency</Text>
              <View style={styles.amountCurrencyRow}>
                <View style={styles.amountInputWrap}>
                  <Text style={styles.currencySymbol}>
                    {getCurrencySymbol(draft.currency)}
                  </Text>
                  <BottomSheetTextInput
                    style={styles.amountInput}
                    editable={isWritable}
                    value={draft.amountStr}
                    onChangeText={(text) => {
                      setLocalError(null)
                      onChangeDraft((prev) => ({ ...prev, amountStr: text }))
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={colors.textMuted}
                    keyboardAppearance={isDark ? "dark" : "light"}
                    testID="review-amount-input"
                  />
                </View>
                <TouchableOpacity
                  activeOpacity={0.75}
                  disabled={!isWritable}
                  onPress={() => {
                    haptics.selection()
                    Keyboard.dismiss()
                    onOpenCurrencyPicker()
                  }}
                  style={styles.currencyPill}
                  testID="review-currency-btn"
                >
                  <Text style={styles.currencyPillText}>{draft.currency}</Text>
                  <ChevronDown size={14} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Account Selector */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                {draft.transactionType === "TRANSFER"
                  ? "Source Account"
                  : "Account"}
              </Text>
              <TouchableOpacity
                activeOpacity={0.75}
                disabled={!isWritable}
                onPress={() => {
                  haptics.selection()
                  Keyboard.dismiss()
                  onOpenAccountPicker()
                }}
                style={styles.pickerRow}
                testID="review-account-btn"
              >
                <View style={styles.pickerRowLeft}>
                  <Landmark size={16} color={colors.primary} />
                  <Text
                    style={[
                      styles.pickerRowText,
                      !selectedAccount && styles.pickerRowPlaceholder,
                    ]}
                    numberOfLines={1}
                  >
                    {selectedAccount
                      ? `${selectedAccount.name} (${selectedAccount.currency})`
                      : "Select account"}
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Destination Account Selector (for Transfer) */}
            {draft.transactionType === "TRANSFER" && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Destination Account</Text>
                <TouchableOpacity
                  activeOpacity={0.75}
                  disabled={!isWritable}
                  onPress={() => {
                    haptics.selection()
                    Keyboard.dismiss()
                    onOpenDestinationAccountPicker()
                  }}
                  style={styles.pickerRow}
                  testID="review-dest-account-btn"
                >
                  <View style={styles.pickerRowLeft}>
                    <Landmark size={16} color={colors.brandSecondary} />
                    <Text
                      style={[
                        styles.pickerRowText,
                        !selectedDestAccount && styles.pickerRowPlaceholder,
                      ]}
                      numberOfLines={1}
                    >
                      {selectedDestAccount
                        ? `${selectedDestAccount.name} (${selectedDestAccount.currency})`
                        : "Select destination account"}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            {/* Budget Selector (for Expense) */}
            {draft.transactionType === "EXPENSE" && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Budget Category</Text>
                <TouchableOpacity
                  activeOpacity={0.75}
                  disabled={!isWritable}
                  onPress={() => {
                    haptics.selection()
                    Keyboard.dismiss()
                    onOpenBudgetPicker()
                  }}
                  style={[
                    styles.pickerRow,
                    !selectedBudget &&
                      !draft.scheduledTransactionId &&
                      !draft.borrowingId &&
                      styles.pickerRowHighlight,
                  ]}
                  testID="review-budget-btn"
                >
                  <View style={styles.pickerRowLeft}>
                    {selectedBudget && budgetColors ? (
                      <View
                        style={[
                          styles.budgetColorDot,
                          { backgroundColor: budgetColors.bar },
                        ]}
                      />
                    ) : (
                      <PiggyBank size={16} color={colors.warning} />
                    )}
                    <Text
                      style={[
                        styles.pickerRowText,
                        !selectedBudget && styles.pickerRowPlaceholder,
                      ]}
                      numberOfLines={1}
                    >
                      {selectedBudget ? selectedBudget.name : "Select budget"}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            {/* Optional Links */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Optional Links</Text>

              <View style={styles.optionalLinksStack}>
                <View style={styles.optionalLinkRow}>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    disabled={!isWritable}
                    onPress={() => {
                      haptics.selection()
                      Keyboard.dismiss()
                      onOpenScheduledPicker()
                    }}
                    style={styles.optionalLinkMain}
                    testID="review-scheduled-btn"
                  >
                    <CalendarClock size={16} color={colors.brandSecondary} />
                    <View style={styles.optionalLinkTextCol}>
                      <Text style={styles.optionalLinkLabel}>
                        Scheduled Bill
                      </Text>
                      <Text style={styles.optionalLinkValue} numberOfLines={1}>
                        {selectedScheduled
                          ? `${getScheduledDisplayName(selectedScheduled, recurringTemplates)} • ${formatAmount(selectedScheduled.amount || "0", selectedScheduled.currency || baseCurrency)}`
                          : "None linked"}
                      </Text>
                    </View>
                    <ChevronRight size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                  {selectedScheduled && isWritable && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
                        haptics.light()
                        onChangeDraft((prev) => ({
                          ...prev,
                          scheduledTransactionId: "",
                        }))
                      }}
                      style={styles.clearLinkBtn}
                      accessibilityLabel="Unlink scheduled bill"
                    >
                      <X size={14} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.optionalLinkRow}>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    disabled={!isWritable}
                    onPress={() => {
                      haptics.selection()
                      Keyboard.dismiss()
                      onOpenBorrowingPicker()
                    }}
                    style={styles.optionalLinkMain}
                    testID="review-borrowing-btn"
                  >
                    <HandCoins size={16} color={colors.warning} />
                    <View style={styles.optionalLinkTextCol}>
                      <Text style={styles.optionalLinkLabel}>
                        Debt / Loan Agreement
                      </Text>
                      <Text style={styles.optionalLinkValue} numberOfLines={1}>
                        {selectedBorrowing
                          ? `${selectedBorrowing.counterparty || "Agreement"} • ${formatAmount(selectedBorrowing.remainingAmount || selectedBorrowing.totalAmount, selectedBorrowing.currency || baseCurrency)}`
                          : "None linked"}
                      </Text>
                    </View>
                    <ChevronRight size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                  {selectedBorrowing && isWritable && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
                        haptics.light()
                        onChangeDraft((prev) => ({
                          ...prev,
                          borrowingId: "",
                        }))
                      }}
                      style={styles.clearLinkBtn}
                      accessibilityLabel="Unlink loan agreement"
                    >
                      <X size={14} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>

            {/* Collapsible Source Payload Preview */}
            <View style={styles.payloadCard}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  haptics.selection()
                  setPayloadExpanded((v) => !v)
                }}
                style={styles.payloadHeader}
                testID="review-source-payload-toggle"
              >
                <View style={styles.payloadHeaderLeft}>
                  <FileText size={15} color={colors.textMuted} />
                  <Text style={styles.payloadTitle}>Source Payload</Text>
                </View>
                {payloadExpanded ? (
                  <ChevronUp size={16} color={colors.textMuted} />
                ) : (
                  <ChevronDown size={16} color={colors.textMuted} />
                )}
              </TouchableOpacity>

              {payloadExpanded && (
                <ScrollView
                  nestedScrollEnabled
                  style={styles.payloadBodyScroll}
                  contentContainerStyle={styles.payloadBodyContent}
                >
                  <Text style={styles.payloadText} selectable>
                    {decodedPayload || "No source payload attached."}
                  </Text>
                  {item.createTime ? (
                    <Text style={styles.payloadMeta}>
                      Ingested {tz.formatDate(item.createTime)} ·{" "}
                      {tz.formatTime(item.createTime)}
                    </Text>
                  ) : null}
                </ScrollView>
              )}
            </View>
          </BottomSheetScrollView>

          {/* Sticky Footer */}
          {isWritable && (
            <View
              style={[
                styles.stickyFooter,
                { paddingBottom: Math.max(insets.bottom, 14) },
              ]}
            >
              <Button
                variant="destructive"
                size="md"
                loading={isDiscarding}
                disabled={isSubmitting}
                leftIcon={<Trash2 size={16} color={colors.destructive} />}
                onPress={() => onDiscard(item)}
                style={styles.footerDiscardBtn}
                testID="review-discard-btn"
              >
                Discard
              </Button>
              <Button
                variant="primary"
                size="md"
                loading={isSubmitting}
                disabled={isDiscarding}
                leftIcon={<Check size={16} color={colors.primaryForeground} />}
                onPress={handleApprovePress}
                style={styles.footerApproveBtn}
                testID="review-approve-btn"
              >
                Approve & Record
              </Button>
            </View>
          )}
        </View>
      ) : null}
    </AppBottomSheet>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  sheetRoot: {
    flex: 1,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 14,
  },
  viewerBanner: {
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    padding: 12,
  },
  viewerBannerText: {
    fontSize: 13,
    color: t.colors.textSecondary,
    lineHeight: 18,
  },
  warningBanner: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 10,
    backgroundColor: t.colors.warningSubtle,
    borderWidth: 1,
    borderColor: t.colors.warningBorder,
    borderRadius: t.radius.md,
    padding: 12,
  },
  bannerTextCol: {
    flex: 1,
    gap: 2,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.warning,
  },
  warningSubtitle: {
    fontSize: 12,
    color: t.colors.textSecondary,
    lineHeight: 17,
  },
  hintBanner: {
    backgroundColor: t.colors.infoSubtle,
    borderWidth: 1,
    borderColor: t.colors.infoBorder,
    borderRadius: t.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hintBannerText: {
    fontSize: 13,
    color: t.colors.info,
    fontWeight: "500" as const,
  },
  errorBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: t.colors.destructiveSubtle,
    borderWidth: 1,
    borderColor: t.colors.destructiveBorder,
    borderRadius: t.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: t.colors.destructive,
    fontWeight: "500" as const,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: t.colors.textSecondary,
  },
  segmentedTrack: {
    flexDirection: "row" as const,
    backgroundColor: t.colors.surfaceElevated,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    padding: 3,
    gap: 3,
  },
  segmentedItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: t.radius.sm,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  segmentedItemActive: {
    backgroundColor: t.colors.primary,
  },
  segmentedText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  segmentedTextActive: {
    color: t.colors.primaryForeground,
  },
  textInput: {
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: t.colors.textPrimary,
  },
  amountCurrencyRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  amountInputWrap: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    paddingHorizontal: 12,
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 16,
    fontWeight: "600" as const,
    fontFamily: t.typography.mono,
    color: t.colors.textPrimary,
  },
  currencyPill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  currencyPillText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  pickerRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  pickerRowHighlight: {
    borderColor: t.colors.warningBorder,
    backgroundColor: t.colors.warningSubtle,
  },
  pickerRowLeft: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    minWidth: 0,
  },
  pickerRowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500" as const,
    color: t.colors.textPrimary,
  },
  pickerRowPlaceholder: {
    color: t.colors.textMuted,
  },
  budgetColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  optionalLinksStack: {
    gap: 8,
  },
  optionalLinkRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    overflow: "hidden" as const,
  },
  optionalLinkMain: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionalLinkTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  optionalLinkLabel: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  optionalLinkValue: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  clearLinkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderLeftWidth: 1,
    borderLeftColor: t.colors.border,
  },
  payloadCard: {
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    overflow: "hidden" as const,
  },
  payloadHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  payloadHeaderLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  payloadTitle: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
  },
  payloadBodyScroll: {
    maxHeight: 160,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  payloadBodyContent: {
    padding: 12,
    gap: 8,
  },
  payloadText: {
    fontFamily: t.typography.mono,
    fontSize: 12,
    lineHeight: 17,
    color: t.colors.textSecondary,
  },
  payloadMeta: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  stickyFooter: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  footerDiscardBtn: {
    flex: 1,
  },
  footerApproveBtn: {
    flex: 2,
  },
})
