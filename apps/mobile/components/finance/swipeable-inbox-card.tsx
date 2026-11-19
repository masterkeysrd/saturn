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
  AlertTriangle,
  Landmark,
  PiggyBank,
  ChevronDown,
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
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import {
  canQuickApproveInboxItem,
  getInboxDocTypeLabel,
  resolveInboxTransactionType,
} from "@/lib/inbox-triage"
import { Badge } from "@/components/ui/badge"
import { MonoAmount } from "@/components/ui/typography"

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
  const { colors } = useTheme()
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
          <Check size={22} color={colors.primaryForeground} strokeWidth={2.5} />
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
  const { colors } = useTheme()
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
          <Trash2 size={21} color={colors.primaryForeground} />
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
  const docTypeLabel = getInboxDocTypeLabel(item.docType)
  const currency = item.currency || baseCurrency || "USD"

  const dateLabel = item.transactionDate
    ? tz.formatDate(item.transactionDate, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "No date"

  const budgetColors = budget
    ? getBudgetColors(budget.color || "indigo")
    : undefined

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
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          {/* Top Row: Vendor & Amount */}
          <View style={styles.topRow}>
            <View style={styles.vendorCol}>
              <Text style={styles.vendorName} numberOfLines={1}>
                {item.vendorName || "Unknown Vendor"}
              </Text>
              <Text style={styles.dateText}>{dateLabel}</Text>
            </View>
            <MonoAmount size="md" color={amountColor} style={styles.amount}>
              {amountPrefix}
              {formatAmount(item.amount || "0", currency)}
            </MonoAmount>
          </View>

          {/* Badges Row: Doc Type, Flow Type, Potential Duplicate */}
          <View style={styles.badgesRow}>
            <Badge size="sm" variant="outline" label={docTypeLabel} />
            <Badge
              size="sm"
              variant={
                txnType === "INCOME"
                  ? "success"
                  : txnType === "TRANSFER"
                    ? "primary"
                    : "default"
              }
              icon={
                txnType === "INCOME" ? (
                  <ArrowDownLeft size={11} color={colors.success} />
                ) : txnType === "TRANSFER" ? (
                  <ArrowLeftRight size={11} color={colors.primary} />
                ) : (
                  <ArrowUpRight size={11} color={colors.textSecondary} />
                )
              }
              label={
                txnType === "INCOME"
                  ? "Income"
                  : txnType === "TRANSFER"
                    ? "Transfer"
                    : "Expense"
              }
            />
            {hasDuplicate && (
              <Badge
                size="sm"
                variant="warning"
                icon={<AlertTriangle size={11} color={colors.warning} />}
                label="Duplicate?"
              />
            )}
          </View>

          {/* Quick-Assignment Chips Row */}
          <View style={styles.chipsRow}>
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
                  budget
                    ? styles.assignChipFilled
                    : styles.assignChipHighlighted,
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
                  <PiggyBank size={13} color={colors.warning} />
                )}
                <Text
                  style={[
                    styles.assignChipText,
                    !budget && styles.assignChipTextHighlighted,
                  ]}
                  numberOfLines={1}
                >
                  {budget ? budget.name : "Assign Budget"}
                </Text>
                <ChevronDown
                  size={12}
                  color={budget ? colors.textMuted : colors.warning}
                />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              activeOpacity={0.7}
              disabled={!isWritable || isBusy}
              onPress={() => {
                haptics.selection()
                onPickAccount(item)
              }}
              style={[
                styles.assignChip,
                account ? styles.assignChipFilled : styles.assignChipDefault,
              ]}
              testID={`inbox-chip-account-${item.id}`}
            >
              <Landmark
                size={13}
                color={account ? colors.primary : colors.textMuted}
              />
              <Text style={styles.assignChipText} numberOfLines={1}>
                {account ? account.name : "Assign Account"}
              </Text>
              <ChevronDown size={12} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Accessible 1-Tap Action Row */}
          {isWritable && (
            <View style={styles.actionsRow}>
              <TouchableOpacity
                activeOpacity={0.75}
                disabled={isBusy}
                onPress={() => {
                  haptics.warning()
                  onDiscard(item)
                }}
                style={styles.discardBtn}
                testID={`inbox-discard-btn-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Discard ${item.vendorName || "item"}`}
              >
                <Trash2 size={14} color={colors.destructive} />
                <Text style={styles.discardBtnText}>{t("common.discard")}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.75}
                disabled={isBusy}
                onPress={() => onApprove(item)}
                style={[
                  styles.approveBtn,
                  !readyForQuickApprove && styles.approveBtnReview,
                ]}
                testID={`inbox-approve-btn-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel={
                  readyForQuickApprove
                    ? `Approve ${item.vendorName || "item"}`
                    : `Review and approve ${item.vendorName || "item"}`
                }
              >
                <Check
                  size={14}
                  color={
                    readyForQuickApprove
                      ? colors.primaryForeground
                      : colors.primary
                  }
                />
                <Text
                  style={[
                    styles.approveBtnText,
                    !readyForQuickApprove && styles.approveBtnTextReview,
                  ]}
                >
                  {readyForQuickApprove
                    ? t("common.approve")
                    : "Review & Approve"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      </ReanimatedSwipeable>
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  outerWrapper: {
    borderRadius: t.radius.md,
    overflow: "hidden" as const,
  },
  card: {
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    padding: 14,
    gap: 10,
  },
  cardPressed: {
    backgroundColor: t.colors.surfaceElevated,
  },
  topRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    justifyContent: "space-between" as const,
    gap: 12,
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
  dateText: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  amount: {
    flexShrink: 0,
    fontWeight: "700" as const,
  },
  badgesRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  chipsRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  assignChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: t.radius.full,
    borderWidth: 1,
    maxWidth: "100%" as const,
  },
  assignChipFilled: {
    backgroundColor: t.colors.surfaceElevated,
    borderColor: t.colors.border,
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
  actionsRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "flex-end" as const,
    gap: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
  },
  discardBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.destructiveSubtle,
    borderWidth: 1,
    borderColor: t.colors.destructiveBorder,
  },
  discardBtnText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.destructive,
  },
  approveBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.primary,
  },
  approveBtnReview: {
    backgroundColor: t.colors.primarySubtle,
    borderWidth: 1,
    borderColor: t.colors.borderFocus,
  },
  approveBtnText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.primaryForeground,
  },
  approveBtnTextReview: {
    color: t.colors.primary,
  },
  leftAction: {
    backgroundColor: t.colors.success,
    justifyContent: "center" as const,
    alignItems: "flex-start" as const,
    width: 100,
  },
  rightAction: {
    backgroundColor: t.colors.destructive,
    justifyContent: "center" as const,
    alignItems: "flex-end" as const,
    width: 100,
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
    color: t.colors.primaryForeground,
    fontSize: 12,
    fontWeight: "700" as const,
  },
})
