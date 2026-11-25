import React, { useRef } from "react"
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  StyleSheet,
} from "react-native"
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable"
import Animated, {
  useAnimatedStyle,
  interpolate,
  type SharedValue,
} from "react-native-reanimated"
import {
  Check,
  Trash2,
  Landmark,
  PiggyBank,
  ChevronDown,
  Receipt,
  Mail,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
} from "lucide-react-native"
import type {
  Account,
  Budget,
  InboxItem,
} from "@saturn/api/saturn/finance/v1/finance"
import { formatAmount } from "@saturn/core"
import { useI18n, useTimezone } from "@saturn/hooks"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../../lib/theme"
import { haptics } from "../../lib/haptics"
import {
  canQuickApproveInboxItem,
  getInboxDocTypeLabelKey,
  resolveInboxTransactionType,
} from "../../lib/inbox-triage"
import { MonoAmount } from "../ui/typography"

export interface SwipeableInboxCardProps {
  item: InboxItem
  account?: Account
  budget?: Budget
  baseCurrency: string
  isWritable: boolean
  isBusy?: boolean
  onPress: (item: InboxItem) => void
  onApprove: (item: InboxItem) => void
  onDiscard: (item: InboxItem) => void
  onPickBudget: (item: InboxItem) => void
  onPickAccount: (item: InboxItem) => void
}

function LeftApproveAction({
  drag,
  testID,
  onPress,
}: {
  drag: SharedValue<number>
  testID: string
  onPress: () => void
}) {
  const styles = useThemedStyles(createStyles)
  const { t } = useI18n()

  const containerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(drag.value, [12, 32], [0, 1], "clamp")
    return { opacity }
  })

  const contentStyle = useAnimatedStyle(() => {
    const scale = interpolate(drag.value, [12, 80], [0.6, 1], "clamp")
    const opacity = interpolate(drag.value, [16, 44], [0, 1], "clamp")
    return { transform: [{ scale }], opacity }
  })

  return (
    <Animated.View style={[styles.leftAction, containerStyle]}>
      <Pressable
        testID={testID}
        onPress={onPress}
        style={styles.actionPressable}
      >
        <Animated.View style={[styles.actionContent, contentStyle]}>
          <Check size={22} color="#ffffff" strokeWidth={2.5} />
          <Text style={styles.actionText}>{t("common.approve")}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

function RightDiscardAction({
  drag,
  testID,
  onPress,
}: {
  drag: SharedValue<number>
  testID: string
  onPress: () => void
}) {
  const styles = useThemedStyles(createStyles)
  const { t } = useI18n()

  const containerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(drag.value, [-32, -12], [1, 0], "clamp")
    return { opacity }
  })

  const contentStyle = useAnimatedStyle(() => {
    const scale = interpolate(drag.value, [-80, -12], [1, 0.6], "clamp")
    const opacity = interpolate(drag.value, [-44, -16], [1, 0], "clamp")
    return { transform: [{ scale }], opacity }
  })

  return (
    <Animated.View style={[styles.rightAction, containerStyle]}>
      <Pressable
        testID={testID}
        onPress={onPress}
        style={styles.actionPressable}
      >
        <Animated.View style={[styles.actionContent, contentStyle]}>
          <Trash2 size={21} color="#ffffff" />
          <Text style={styles.actionText}>{t("common.discard")}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

export function SwipeableInboxCard({
  item,
  account,
  budget,
  baseCurrency,
  isWritable,
  isBusy = false,
  onPress,
  onApprove,
  onDiscard,
  onPickBudget,
  onPickAccount,
}: SwipeableInboxCardProps) {
  const { colors, getBudgetColors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const tz = useTimezone()
  const { t } = useI18n()
  const swipeableRef = useRef<SwipeableMethods>(null)

  const txnType = resolveInboxTransactionType(item)
  const readyForQuickApprove = canQuickApproveInboxItem(item)
  const hasDuplicate = Boolean(item.metadata?.potential_duplicate_id)
  const docTypeLabel = t(getInboxDocTypeLabelKey(item.docType))
  const currency = item.currency || baseCurrency || "USD"

  const dateLabel = item.transactionDate
    ? tz.format(item.transactionDate, {
        month: "short",
        day: "numeric",
        year: undefined,
      })
    : t("finance.inbox.card.noDate")

  const budgetColors = budget
    ? getBudgetColors(budget.color || "indigo")
    : undefined

  const requiresAccount = item.docType !== "INVOICE"
  const accountMissing = requiresAccount && !account
  const requiresBudget =
    txnType === "EXPENSE" && !item.scheduledTransactionId && !item.borrowingId
  const budgetMissing = requiresBudget && !budget

  const typeBadgeBg =
    txnType === "INCOME"
      ? colors.successSubtle
      : txnType === "TRANSFER" || item.docType === "RECEIPT"
        ? colors.primarySubtle
        : item.docType === "INVOICE" || item.docType === "BANK_NOTIFICATION"
          ? colors.infoSubtle
          : colors.surfaceSubtle

  const renderTypeIcon = () => {
    if (txnType === "INCOME") {
      return <ArrowDownLeft size={17} color={colors.success} />
    }
    if (txnType === "TRANSFER") {
      return <ArrowLeftRight size={17} color={colors.primary} />
    }
    if (item.docType === "RECEIPT") {
      return <Receipt size={17} color={colors.primary} />
    }
    if (item.docType === "INVOICE" || item.docType === "BANK_NOTIFICATION") {
      return <Mail size={17} color={colors.info} />
    }
    return <ArrowUpRight size={17} color={colors.textSecondary} />
  }

  const amountPrefix =
    txnType === "INCOME" ? "+" : txnType === "EXPENSE" ? "-" : ""
  const amountColor =
    txnType === "INCOME"
      ? colors.success
      : txnType === "TRANSFER"
        ? colors.primary
        : colors.textPrimary

  const handleSwipeApprove = () => {
    swipeableRef.current?.close()
    onApprove(item)
  }

  const handleSwipeDiscard = () => {
    swipeableRef.current?.close()
    onDiscard(item)
  }

  return (
    <View style={styles.shadowWrapper}>
      <View style={styles.outerWrapper}>
        <ReanimatedSwipeable
          ref={swipeableRef}
          testID={`inbox-card-swipeable-${item.id}`}
          enabled={isWritable && !isBusy}
          renderLeftActions={(_progress, drag) => (
            <LeftApproveAction
              drag={drag}
              testID={`inbox-swipe-approve-${item.id}`}
              onPress={handleSwipeApprove}
            />
          )}
          renderRightActions={(_progress, drag) => (
            <RightDiscardAction
              drag={drag}
              testID={`inbox-swipe-discard-${item.id}`}
              onPress={handleSwipeDiscard}
            />
          )}
          onSwipeableWillOpen={() => haptics.selection()}
          dragOffsetFromLeft={24}
          dragOffsetFromRight={-24}
          leftThreshold={48}
          rightThreshold={48}
          friction={1.5}
          overshootLeft={false}
          overshootRight={false}
        >
          <Pressable
            testID={`inbox-card-${item.id}`}
            onPress={() => {
              haptics.light()
              onPress(item)
            }}
            style={({ pressed }) => [
              styles.card,
              pressed && styles.cardPressed,
            ]}
          >
            {/* Zone 1: Identity Row */}
            <View style={styles.identityRow}>
              <View style={styles.identityLeft}>
                <View
                  style={[styles.typeBadge, { backgroundColor: typeBadgeBg }]}
                >
                  {renderTypeIcon()}
                </View>
                <View style={styles.vendorCol}>
                  <Text style={styles.vendorName} numberOfLines={1}>
                    {item.vendorName || t("finance.inbox.unknownVendor")}
                  </Text>
                  <Text style={styles.subtitleText} numberOfLines={1}>
                    {dateLabel} · {docTypeLabel}
                    {hasDuplicate ? (
                      <Text style={styles.duplicateInlineText}>
                        {" "}
                        • {t("finance.inbox.card.badgeDuplicate")}
                      </Text>
                    ) : null}
                  </Text>
                </View>
              </View>
              <MonoAmount size="md" color={amountColor} style={styles.amount}>
                {amountPrefix}
                {formatAmount(item.amount || "0", currency)}
              </MonoAmount>
            </View>

            {/* Zone 2: Account & Budget Chips + Primary Approve Action */}
            <View style={styles.footerZone}>
              <View style={styles.chipsGroup}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  disabled={!isWritable || isBusy}
                  onPress={() => {
                    haptics.selection()
                    onPickAccount(item)
                  }}
                  style={[
                    styles.assignChip,
                    accountMissing
                      ? styles.assignChipHighlighted
                      : styles.assignChipDefault,
                  ]}
                  testID={`inbox-chip-account-${item.id}`}
                >
                  <Landmark
                    size={12}
                    color={
                      accountMissing
                        ? colors.warning
                        : account
                          ? colors.primary
                          : colors.textMuted
                    }
                  />
                  <Text
                    style={[
                      styles.assignChipText,
                      accountMissing && styles.assignChipTextHighlighted,
                    ]}
                    numberOfLines={1}
                  >
                    {account
                      ? account.name
                      : t("finance.inbox.card.assignAccount")}
                  </Text>
                  <ChevronDown
                    size={11}
                    color={accountMissing ? colors.warning : colors.textMuted}
                  />
                </TouchableOpacity>

                {txnType === "EXPENSE" && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    disabled={!isWritable || isBusy}
                    onPress={() => {
                      haptics.selection()
                      onPickBudget(item)
                    }}
                    style={[
                      styles.assignChip,
                      budgetMissing
                        ? styles.assignChipHighlighted
                        : styles.assignChipDefault,
                    ]}
                    testID={`inbox-chip-budget-${item.id}`}
                  >
                    {budget && budgetColors ? (
                      <View
                        style={[
                          styles.budgetDot,
                          { backgroundColor: budgetColors.bar },
                        ]}
                      />
                    ) : (
                      <PiggyBank
                        size={12}
                        color={
                          budgetMissing ? colors.warning : colors.textMuted
                        }
                      />
                    )}
                    <Text
                      style={[
                        styles.assignChipText,
                        budgetMissing && styles.assignChipTextHighlighted,
                      ]}
                      numberOfLines={1}
                    >
                      {budget
                        ? budget.name
                        : t("finance.inbox.card.assignBudget")}
                    </Text>
                    <ChevronDown
                      size={11}
                      color={budgetMissing ? colors.warning : colors.textMuted}
                    />
                  </TouchableOpacity>
                )}
              </View>

              {isWritable && (
                <TouchableOpacity
                  activeOpacity={0.75}
                  disabled={isBusy}
                  onPress={() => onApprove(item)}
                  style={styles.approveBtn}
                  testID={`inbox-approve-btn-${item.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={
                    readyForQuickApprove
                      ? t("finance.inbox.aria.approveItem", {
                          name:
                            item.vendorName ||
                            t("finance.inbox.toast.itemFallback"),
                        })
                      : t("finance.inbox.aria.reviewApproveItem", {
                          name:
                            item.vendorName ||
                            t("finance.inbox.toast.itemFallback"),
                        })
                  }
                >
                  <Check
                    size={14}
                    color={colors.primaryForeground}
                    strokeWidth={2.5}
                  />
                  <Text style={styles.approveBtnText}>
                    {t("common.approve")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </Pressable>
        </ReanimatedSwipeable>
      </View>
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  shadowWrapper: {
    borderRadius: t.radius.lg,
    ...(!t.isDark ? t.shadows.sm : {}),
  },
  outerWrapper: {
    borderRadius: t.radius.lg,
    overflow: "hidden" as const,
  },
  card: {
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardPressed: {
    backgroundColor: t.colors.surfaceSubtle,
  },
  identityRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 10,
  },
  identityLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  typeBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexShrink: 0,
  },
  vendorCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  vendorName: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  subtitleText: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  duplicateInlineText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.warning,
  },
  amount: {
    flexShrink: 0,
    fontWeight: "700" as const,
  },
  footerZone: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  chipsGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  assignChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  assignChipDefault: {
    backgroundColor: t.colors.surfaceSubtle,
    borderColor: t.colors.border,
  },
  assignChipHighlighted: {
    backgroundColor: t.colors.warningSubtle,
    borderColor: t.colors.warningBorder,
  },
  budgetDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  assignChipText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
    flexShrink: 1,
  },
  assignChipTextHighlighted: {
    color: t.colors.warning,
  },
  approveBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: t.colors.primary,
    flexShrink: 0,
  },
  approveBtnText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.primaryForeground,
  },
  leftAction: {
    backgroundColor: t.colors.success,
    justifyContent: "center" as const,
    alignItems: "flex-start" as const,
    width: 100,
    marginRight: -t.radius.lg,
    paddingRight: t.radius.lg,
  },
  rightAction: {
    backgroundColor: t.colors.destructive,
    justifyContent: "center" as const,
    alignItems: "flex-end" as const,
    width: 100,
    marginLeft: -t.radius.lg,
    paddingLeft: t.radius.lg,
  },
  actionPressable: {
    flex: 1,
    width: "100%" as const,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    paddingHorizontal: 12,
  },
  actionContent: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 4,
  },
  actionText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700" as const,
  },
})
