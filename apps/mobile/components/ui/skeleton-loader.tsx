import React, { useEffect } from "react"
import {
  View,
  Animated,
  useAnimatedValue,
  type StyleProp,
  type ViewStyle,
} from "react-native"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"

export interface SkeletonProps {
  width?: number | string
  height?: number | string
  borderRadius?: number
  style?: StyleProp<ViewStyle>
}

export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius,
  style,
}: SkeletonProps) {
  const { radius } = useTheme()
  const styles = useThemedStyles(createStyles)
  const resolvedRadius = borderRadius ?? radius.sm
  const opacityAnim = useAnimatedValue(0.3)

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    )
    pulse.start()

    return () => pulse.stop()
  }, [opacityAnim])

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width: width as any,
          height: height as any,
          borderRadius: resolvedRadius,
          opacity: opacityAnim,
        },
        style,
      ]}
    />
  )
}

export function SkeletonCard({
  height,
  style,
}: {
  height?: number | string
  style?: StyleProp<ViewStyle>
}) {
  const styles = useThemedStyles(createStyles)
  return (
    <View
      style={[
        styles.card,
        height !== undefined ? { height: height as any } : undefined,
        style,
      ]}
    >
      <View style={styles.cardHeader}>
        <Skeleton width="40%" height={16} />
        <Skeleton width="20%" height={14} />
      </View>
      <Skeleton width="60%" height={32} style={{ marginVertical: 12 }} />
      <Skeleton width="80%" height={12} />
    </View>
  )
}

export function SkeletonTransactionItem({
  style,
}: {
  style?: StyleProp<ViewStyle>
}) {
  const styles = useThemedStyles(createStyles)
  return (
    <View style={[styles.transactionRow, style]}>
      <Skeleton width={40} height={40} borderRadius={20} />
      <View style={styles.transactionMeta}>
        <Skeleton width="60%" height={15} style={{ marginBottom: 6 }} />
        <Skeleton width="35%" height={12} />
      </View>
      <Skeleton width={60} height={18} />
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  skeleton: {
    backgroundColor: t.colors.surfaceHighlight,
  },
  card: {
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  transactionRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 12,
    gap: 12,
  },
  transactionMeta: {
    flex: 1,
  },
})
