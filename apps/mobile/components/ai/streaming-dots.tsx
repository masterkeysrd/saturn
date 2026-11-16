import { useEffect } from "react"
import { StyleSheet, View } from "react-native"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated"
import { theme } from "@/lib/theme"

function PulseDot({ delayMs }: { delayMs: number }) {
  const opacity = useSharedValue(0.35)
  const scale = useSharedValue(0.85)

  useEffect(() => {
    opacity.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 420 }),
          withTiming(0.35, { duration: 420 })
        ),
        -1,
        false
      )
    )
    scale.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(1.15, { duration: 420 }),
          withTiming(0.85, { duration: 420 })
        ),
        -1,
        false
      )
    )
  }, [delayMs, opacity, scale])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }))

  return <Animated.View style={[styles.dot, animatedStyle]} />
}

export function StreamingDots() {
  return (
    <View style={styles.row} accessibilityLabel="Streaming indicator">
      <PulseDot delayMs={0} />
      <PulseDot delayMs={140} />
      <PulseDot delayMs={280} />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: theme.colors.primary,
  },
})
