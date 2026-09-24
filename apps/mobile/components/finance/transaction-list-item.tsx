import React from "react"
import { StyleSheet, Text, View, TouchableOpacity } from "react-native"
import {
  ArrowUpRight,
  ArrowDownLeft,
  ReceiptText,
  Repeat,
  Coins,
} from "lucide-react-native"
import { formatAmount } from "@saturn/core"
import {
  type Transaction,
  type Budget,
  type Account,
} from "@saturn/api/saturn/finance/v1/finance"
import { theme, getNativeBudgetColors } from "@/lib/theme"
import { getBudgetIcon } from "@/lib/budget-icons"
import { MonoAmount } from "@/components/ui/typography"

export interface TransactionListItemProps {
  item: Transaction
  baseCurrency?: string
  account?: Account
  budget?: Budget
  onPress?: () => void
  showBorderBottom?: boolean
  showDate?: boolean
  showBudget?: boolean
  showAccount?: boolean
}

function formatRowDate(dateStr?: string): string {
  if (!dateStr) return ""
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ""
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  })
}

export function TransactionListItem({
  item,
  baseCurrency = "USD",
  account,
  budget,
  onPress,
  showBorderBottom = true,
  showDate = true,
  showBudget = true,
  showAccount = true,
}: TransactionListItemProps) {
  const isExpense = item.type === "EXPENSE"
  const isIncome = item.type === "INCOME"
  const displaySign = isExpense ? "-" : isIncome ? "+" : ""

  // Cross currency check: shows base value when transaction currency differs from base
  const isCrossCurrency = Boolean(
    baseCurrency &&
    item.currency &&
    item.currency.toUpperCase() !== baseCurrency.toUpperCase() &&
    item.amountInBase
  )

  const accountName =
    account?.name ||
    item.account?.name ||
    (item.accountId ? "Account" : "No Account (Cash)")
  const budgetName = budget?.name || item.budget?.name
  const budgetColor = budget?.color || "indigo"
  const budgetIcon = budget?.icon
  const nativeBudgetColors = getNativeBudgetColors(budgetColor)
  const hasBudget = Boolean(budgetName || budgetIcon)
  const BudgetIcon = getBudgetIcon(budgetIcon, budgetName)

  const dateStr = formatRowDate(item.transactionDate)

  const isRecurring = Boolean(item.metadata?.recurring_transaction_id)
  const isBorrowing = Boolean(item.metadata?.borrowing_id)
  const borrowingRole = item.metadata?.borrowing_role

  const hasMetaLeft = Boolean(
    (showAccount && accountName) || (showDate && dateStr)
  )
  const showBudgetTag = !isIncome && budgetName && showBudget
  const hasTags = Boolean(
    showBudgetTag || isRecurring || isBorrowing || isIncome
  )

  const renderTags = () => (
    <>
      {showBudgetTag ? (
        <View
          style={[
            styles.tagPill,
            {
              backgroundColor: nativeBudgetColors.bg,
              borderColor: nativeBudgetColors.border,
            },
          ]}
        >
          <View
            style={[styles.tagDot, { backgroundColor: nativeBudgetColors.bar }]}
          />
          <Text
            style={[styles.tagText, { color: nativeBudgetColors.text }]}
            numberOfLines={1}
          >
            {budgetName}
          </Text>
        </View>
      ) : isIncome ? (
        <View
          style={[
            styles.tagPill,
            {
              backgroundColor: theme.colors.successSubtle,
              borderColor: "rgba(16, 185, 129, 0.25)",
            },
          ]}
        >
          <Text style={[styles.tagText, { color: theme.colors.success }]}>
            Income
          </Text>
        </View>
      ) : null}

      {isRecurring && (
        <View
          style={[
            styles.tagPill,
            {
              backgroundColor: "rgba(99, 102, 241, 0.12)",
              borderColor: "rgba(99, 102, 241, 0.3)",
            },
          ]}
        >
          <Repeat size={10} color="#818cf8" />
          <Text style={[styles.tagText, { color: "#818cf8" }]}>Recurring</Text>
        </View>
      )}

      {isBorrowing && borrowingRole && (
        <View
          style={[
            styles.tagPill,
            {
              backgroundColor: "rgba(245, 158, 11, 0.12)",
              borderColor: "rgba(245, 158, 11, 0.3)",
            },
          ]}
        >
          <Coins size={10} color="#fbbf24" />
          <Text style={[styles.tagText, { color: "#fbbf24" }]}>
            {borrowingRole === "REPAYMENT"
              ? "Repayment"
              : borrowingRole === "INITIAL_FUNDING" && isExpense
                ? "Lend"
                : "Borrow"}
          </Text>
        </View>
      )}
    </>
  )

  return (
    <TouchableOpacity
      style={[styles.container, showBorderBottom && styles.borderBottom]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      {/* Icon Badge */}
      <View
        style={[
          styles.iconBadge,
          isExpense && hasBudget
            ? {
                backgroundColor: nativeBudgetColors.bg,
                borderColor: nativeBudgetColors.border,
                borderWidth: 1,
              }
            : {
                backgroundColor: isExpense
                  ? theme.colors.destructiveSubtle
                  : isIncome
                    ? theme.colors.successSubtle
                    : theme.colors.primarySubtle,
              },
        ]}
      >
        {isExpense && hasBudget ? (
          <BudgetIcon size={16} color={nativeBudgetColors.bar} />
        ) : isExpense ? (
          <ArrowUpRight size={16} color={theme.colors.destructive} />
        ) : isIncome ? (
          <ArrowDownLeft size={16} color={theme.colors.success} />
        ) : (
          <ReceiptText size={16} color={theme.colors.primary} />
        )}
      </View>

      {/* 3-Row Content Column */}
      <View style={styles.contentCol}>
        {/* Row 1: Description & Primary Amount */}
        <View style={styles.row1}>
          <Text style={styles.description} numberOfLines={1}>
            {item.description || "Unnamed"}
          </Text>
          <MonoAmount
            size="md"
            color={
              isExpense
                ? theme.colors.textPrimary
                : isIncome
                  ? theme.colors.success
                  : theme.colors.accent
            }
            style={styles.mainAmount}
          >
            {displaySign}
            {formatAmount(item.amount, item.currency)}
          </MonoAmount>
        </View>

        {/* Row 2 & Row 3 Content */}
        {hasMetaLeft ? (
          <>
            <View style={styles.row2}>
              <View style={styles.metaLeft}>
                {showAccount && accountName ? (
                  <Text style={styles.accountText} numberOfLines={1}>
                    {accountName}
                  </Text>
                ) : null}
                {showAccount && accountName && showDate && dateStr ? (
                  <Text style={styles.metaDot}>•</Text>
                ) : null}
                {showDate && dateStr ? (
                  <Text style={styles.dateText}>{dateStr}</Text>
                ) : null}
              </View>

              {isCrossCurrency && item.amountInBase ? (
                <Text style={styles.baseAmountText}>
                  ≈ {displaySign}
                  {formatAmount(item.amountInBase, baseCurrency)}
                </Text>
              ) : null}
            </View>

            {hasTags && <View style={styles.row3}>{renderTags()}</View>}
          </>
        ) : (
          (hasTags || (isCrossCurrency && item.amountInBase)) && (
            <View style={styles.row2}>
              {hasTags ? (
                <View style={styles.tagsContainer}>{renderTags()}</View>
              ) : (
                <View style={{ flex: 1 }} />
              )}

              {isCrossCurrency && item.amountInBase ? (
                <Text style={styles.baseAmountText}>
                  ≈ {displaySign}
                  {formatAmount(item.amountInBase, baseCurrency)}
                </Text>
              ) : null}
            </View>
          )
        )}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  borderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    marginTop: 2,
  },
  contentCol: {
    flex: 1,
    gap: 4,
  },
  row1: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  description: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginRight: 8,
  },
  mainAmount: {
    flexShrink: 0,
  },
  row2: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
    minWidth: 0,
  },
  accountText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    flexShrink: 1,
    minWidth: 0,
  },
  metaDot: {
    fontSize: 10,
    color: theme.colors.textMuted,
    marginHorizontal: 4,
    flexShrink: 0,
  },
  dateText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    flexShrink: 0,
  },
  baseAmountText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontFamily: theme.typography.mono,
    flexShrink: 0,
  },
  tagsContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    flex: 1,
    marginRight: 8,
    minWidth: 0,
  },
  row3: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  tagDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  tagText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
})
