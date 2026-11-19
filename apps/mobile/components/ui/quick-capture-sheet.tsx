import React, { forwardRef, useMemo } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from "react-native"
import { useRouter } from "expo-router"
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import {
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  CalendarClock,
  Landmark,
  PiggyBank,
  CalendarPlus,
  MailPlus,
  Sparkles,
  ChevronRight,
  Inbox,
} from "lucide-react-native"
import { AppBottomSheet } from "./bottom-sheet"
import type {
  QuickCaptureIconKey,
  QuickCaptureRouteDescriptor,
} from "../../lib/quick-capture"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../../lib/theme"
import { haptics } from "../../lib/haptics"

export interface QuickCaptureFabProps {
  onPress: () => void
  onLongPress?: () => void
  icon?: React.ReactNode
  testID?: string
  accessibilityLabel?: string
  accessibilityHint?: string
  style?: StyleProp<ViewStyle>
}

export function QuickCaptureFab({
  onPress,
  onLongPress,
  icon,
  testID = "quick-capture-fab",
  accessibilityLabel = "Quick capture",
  accessibilityHint,
  style,
}: QuickCaptureFabProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      delayLongPress={320}
      onPress={() => {
        haptics.light()
        onPress()
      }}
      onLongPress={
        onLongPress
          ? () => {
              haptics.medium()
              onLongPress()
            }
          : undefined
      }
      style={[styles.fab, style]}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      {icon ?? <Plus size={24} color={colors.primaryForeground} />}
    </TouchableOpacity>
  )
}

export interface QuickCaptureSheetProps {
  title?: string
  actions: QuickCaptureRouteDescriptor[]
  onSelectAction?: (action: QuickCaptureRouteDescriptor) => void
  onClose?: () => void
}

function renderActionIcon(
  iconKey: QuickCaptureIconKey,
  color: string,
  size = 18
) {
  switch (iconKey) {
    case "expense":
      return <ArrowDownLeft size={size} color={color} />
    case "income":
      return <ArrowUpRight size={size} color={color} />
    case "transfer":
      return <ArrowRightLeft size={size} color={color} />
    case "scheduled":
      return <CalendarClock size={size} color={color} />
    case "account":
      return <Landmark size={size} color={color} />
    case "budget":
      return <PiggyBank size={size} color={color} />
    case "inbox":
      return <Inbox size={size} color={color} />
    case "event":
      return <CalendarPlus size={size} color={color} />
    case "mail":
      return <MailPlus size={size} color={color} />
    case "ai":
      return <Sparkles size={size} color={color} />
  }
}

export const QuickCaptureSheet = forwardRef<
  BottomSheet,
  QuickCaptureSheetProps
>(({ title = "Quick Capture", actions, onSelectAction, onClose }, ref) => {
  const router = useRouter()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

  const snapPoints = useMemo(() => {
    const estimated = Math.min(82, Math.max(42, 22 + actions.length * 9))
    return [`${estimated}%`]
  }, [actions.length])

  const getToneColors = (tone: QuickCaptureRouteDescriptor["tone"]) => {
    switch (tone) {
      case "destructive":
        return { fg: colors.destructive, bg: colors.destructiveSubtle }
      case "success":
        return { fg: colors.success, bg: colors.successSubtle }
      case "warning":
        return { fg: colors.warning, bg: colors.warningSubtle }
      case "accent":
        return { fg: colors.brandSecondary, bg: colors.brandSecondarySubtle }
      case "primary":
      default:
        return { fg: colors.primary, bg: colors.primarySubtle }
    }
  }

  const handlePressAction = (action: QuickCaptureRouteDescriptor) => {
    haptics.light()
    onClose?.()
    if (onSelectAction) {
      onSelectAction(action)
      return
    }
    router.push(action.route as never)
  }

  return (
    <AppBottomSheet
      ref={ref}
      title={title}
      snapPoints={snapPoints}
      onClose={onClose}
    >
      <BottomSheetScrollView
        contentContainerStyle={styles.sheetContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.listCard}>
          {actions.map((action, index) => {
            const { fg, bg } = getToneColors(action.tone)
            const isLast = index === actions.length - 1
            return (
              <TouchableOpacity
                key={action.id}
                style={[styles.actionRow, !isLast && styles.actionRowBorder]}
                activeOpacity={0.7}
                onPress={() => handlePressAction(action)}
                testID={`quick-capture-action-${action.id}`}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <View style={[styles.iconBadge, { backgroundColor: bg }]}>
                  {renderActionIcon(action.iconKey, fg)}
                </View>
                <View style={styles.actionText}>
                  <Text style={styles.actionLabel}>{action.label}</Text>
                  <Text style={styles.actionDesc} numberOfLines={1}>
                    {action.description}
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )
          })}
        </View>
      </BottomSheetScrollView>
    </AppBottomSheet>
  )
})

QuickCaptureSheet.displayName = "QuickCaptureSheet"

const createStyles = (t: SaturnMobileTheme) => ({
  fab: {
    position: "absolute" as const,
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.colors.primary,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    ...t.shadows.lg,
    zIndex: 10,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 28,
  },
  listCard: {
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surfaceElevated,
    overflow: "hidden" as const,
  },
  actionRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  actionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  actionText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  actionDesc: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
})
