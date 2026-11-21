import React from "react"
import { Text, View, TouchableOpacity } from "react-native"
import {
  ArrowUpRight,
  ArrowDownLeft,
  ReceiptText,
  Repeat,
  Coins,
} from "lucide-react-native"
import { formatAmount } from "@saturn/core"
import { useI18n, useTimezone } from "@saturn/hooks"
import {
  type Transaction,
  type Budget,
  type Account,
} from "@saturn/api/saturn/finance/v1/finance"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { BudgetCategoryIcon } from "@/lib/budget-icons"
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
  const { colors, getBudgetColors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { t } = useI18n()

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
    (item.accountId
      ? t("finance.pickers.account.rowLabel")
      : t("finance.pickers.account.rowPlaceholder"))
  const budgetName = budget?.name || item.budget?.name
  const budgetColor = budget?.color || "indigo"
  const budgetIcon = budget?.icon
  const nativeBudgetColors = getBudgetColors(budgetColor)
  const hasBudget = Boolean(budgetName || budgetIcon)

  const tz = useTimezone()
  const itemYear = tz.parts(item.transactionDate)?.year
  const currentYear = tz.parts(new Date())?.year
  const dateStr = tz.format(item.transactionDate, {
    month: "short",
    day: "numeric",
    year: itemYear === currentYear ? undefined : "numeric",
  })

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
              backgroundColor: colors.successSubtle,
              borderColor: `${colors.success}40`,
            },
          ]}
        >
          <Text style={[styles.tagText, { color: colors.success }]}>
            {t("finance.transactions.list.income")}
          </Text>
        </View>
      ) : null}

      {isRecurring && (
        <View
          style={[
            styles.tagPill,
            {
              backgroundColor: `${colors.accent}1F`,
              borderColor: `${colors.accent}4D`,
            },
          ]}
        >
          <Repeat size={10} color={colors.accent} />
          <Text style={[styles.tagText, { color: colors.accent }]}>
            {t("finance.transactions.recurring")}
          </Text>
        </View>
      )}

      {isBorrowing && borrowingRole && (
        <View
          style={[
            styles.tagPill,
            {
              backgroundColor: colors.warningSubtle,
              borderColor: `${colors.warning}4D`,
            },
          ]}
        >
          <Coins size={10} color={colors.warning} />
          <Text style={[styles.tagText, { color: colors.warning }]}>
            {borrowingRole === "REPAYMENT"
              ? t("finance.transactions.repayment")
              : borrowingRole === "INITIAL_FUNDING" && isExpense
                ? t("finance.transactions.lend")
                : t("finance.transactions.borrow")}
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
                  ? colors.destructiveSubtle
                  : isIncome
                    ? colors.successSubtle
                    : colors.primarySubtle,
              },
        ]}
      >
        {isExpense && hasBudget ? (
          <BudgetCategoryIcon
            icon={budgetIcon}
            name={budgetName}
            size={16}
            color={nativeBudgetColors.bar}
          />
        ) : isExpense ? (
          <ArrowUpRight size={16} color={colors.destructive} />
        ) : isIncome ? (
          <ArrowDownLeft size={16} color={colors.success} />
        ) : (
          <ReceiptText size={16} color={colors.primary} />
        )}
      </View>

      {/* 3-Row Content Column */}
      <View style={styles.contentCol}>
        {/* Row 1: Description & Primary Amount */}
        <View style={styles.row1}>
          <Text style={styles.description} numberOfLines={1}>
            {item.description || t("finance.transactions.detail.unnamed")}
          </Text>
          <MonoAmount
            size="md"
            color={
              isExpense
                ? colors.textPrimary
                : isIncome
                  ? colors.success
                  : colors.accent
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

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  borderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginRight: 12,
    marginTop: 2,
  },
  contentCol: {
    flex: 1,
    gap: 4,
  },
  row1: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  description: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    marginRight: 8,
  },
  mainAmount: {
    flexShrink: 0,
  },
  row2: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  metaLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    flex: 1,
    marginRight: 8,
    minWidth: 0,
  },
  accountText: {
    fontSize: 12,
    color: t.colors.textMuted,
    flexShrink: 1,
    minWidth: 0,
  },
  metaDot: {
    fontSize: 10,
    color: t.colors.textMuted,
    marginHorizontal: 4,
    flexShrink: 0,
  },
  dateText: {
    fontSize: 12,
    color: t.colors.textMuted,
    flexShrink: 0,
  },
  baseAmountText: {
    fontSize: 11,
    color: t.colors.textMuted,
    fontFamily: t.typography.mono,
    flexShrink: 0,
  },
  tagsContainer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    flexWrap: "wrap" as const,
    gap: 6,
    flex: 1,
    marginRight: 8,
    minWidth: 0,
  },
  row3: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    flexWrap: "wrap" as const,
    gap: 6,
    marginTop: 2,
  },
  tagPill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
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
    fontWeight: "700" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
  },
})
