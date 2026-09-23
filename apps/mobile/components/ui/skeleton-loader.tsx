import React, { useEffect, useRef } from "react"
import {
  View,
  Animated,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native"
import { theme } from "@/lib/theme"

export interface SkeletonProps {
  width?: number | string
  height?: number | string
  borderRadius?: number
  style?: StyleProp<ViewStyle>
}

export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = theme.radius.sm,
  style,
}: SkeletonProps) {
  const opacityAnim = useRef(new Animated.Value(0.3)).current

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
          borderRadius,
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

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: theme.colors.surfaceHighlight,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  transactionMeta: {
    flex: 1,
  },
})
