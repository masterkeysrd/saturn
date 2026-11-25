import { useRef } from "react"
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Sparkles } from "lucide-react-native"
import { useListThreadsQuery } from "@saturn/api/saturn/platform/ai/v1/ai"
import { useI18n } from "@saturn/hooks"
import { Avatar } from "./ui/avatar"
import { useToast } from "./ui/toast"
import { useOptionalMobileCopilotSheet } from "../lib/copilot-sheet-context"
import { useSpace } from "../lib/space-context"
import {
  getNextCycledSpace,
  resolveVerticalSwipeDirection,
} from "../lib/space-switcher"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "../lib/theme"
import { haptics } from "../lib/haptics"

interface TouchPoint {
  x: number
  y: number
}

function extractTouchPoint(event: unknown): TouchPoint | null {
  if (!event || typeof event !== "object") return null
  const e = event as Record<string, unknown>
  const nativeEvent =
    (e.nativeEvent as Record<string, unknown> | undefined) ?? e
  const touches =
    (nativeEvent.changedTouches as unknown[] | undefined) ??
    (nativeEvent.touches as unknown[] | undefined) ??
    (e.changedTouches as unknown[] | undefined) ??
    (e.touches as unknown[] | undefined)

  const source =
    touches && touches.length > 0 && typeof touches[0] === "object"
      ? (touches[0] as Record<string, unknown>)
      : nativeEvent

  const x =
    typeof source.pageX === "number"
      ? source.pageX
      : typeof source.clientX === "number"
        ? source.clientX
        : typeof source.locationX === "number"
          ? source.locationX
          : null
  const y =
    typeof source.pageY === "number"
      ? source.pageY
      : typeof source.clientY === "number"
        ? source.clientY
        : typeof source.locationY === "number"
          ? source.locationY
          : null

  if (x === null || y === null) return null
  return { x, y }
}

export interface SpaceAvatarButtonProps {
  size?: number
  testID?: string
}

export function SpaceAvatarButton({
  size = 30,
  testID = "space-avatar-button",
}: SpaceAvatarButtonProps) {
  const styles = useThemedStyles(createStyles)
  const router = useRouter()
  const toast = useToast()
  const { t } = useI18n()
  const { spaces, activeSpace, activeSpaceId, isSwitching, switchSpace } =
    useSpace()

  const touchStartRef = useRef<TouchPoint | null>(null)
  const swipedRef = useRef(false)
  const swipeResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const spaceName = activeSpace?.name || t("menu.personalWorkspace")

  const handlePress = () => {
    if (swipedRef.current) {
      swipedRef.current = false
      return
    }
    haptics.light()
    router.push("/modal/switch-space")
  }

  const handleTouchStart = (event: GestureResponderEvent) => {
    if (swipeResetTimerRef.current) {
      clearTimeout(swipeResetTimerRef.current)
      swipeResetTimerRef.current = null
    }
    swipedRef.current = false
    touchStartRef.current = extractTouchPoint(event)
  }

  const handleTouchEnd = async (event: GestureResponderEvent) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return

    const end = extractTouchPoint(event)
    if (!end) return

    const dy = end.y - start.y
    const dx = end.x - start.x
    const direction = resolveVerticalSwipeDirection(dy, dx)
    if (!direction) return

    swipedRef.current = true
    swipeResetTimerRef.current = setTimeout(() => {
      swipedRef.current = false
      swipeResetTimerRef.current = null
    }, 300)

    if (isSwitching) return

    if (spaces.length <= 1) {
      haptics.selection()
      router.push("/modal/switch-space")
      return
    }

    const nextSpace = getNextCycledSpace(spaces, activeSpaceId, direction)
    if (nextSpace?.id) {
      haptics.medium()
      await switchSpace(nextSpace.id)
      toast.show({
        type: "info",
        title: t("space.switchedTo", {
          name: nextSpace.name || "Workspace",
        }),
      })
    }
  }

  return (
    <View
      onTouchStart={handleTouchStart}
      onTouchEnd={(event) => {
        void handleTouchEnd(event)
      }}
    >
      <TouchableOpacity
        style={styles.avatarRing}
        activeOpacity={0.75}
        onPress={handlePress}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        accessibilityRole="button"
        accessibilityLabel={t("space.avatarAria", { name: spaceName })}
        accessibilityHint={t("space.avatarHint")}
        testID={testID}
      >
        <Avatar name={spaceName} size={size} />
        {spaces.length > 1 && <View style={styles.multiSpaceDot} />}
      </TouchableOpacity>
    </View>
  )
}

export interface AIHeaderButtonProps {
  hasPendingApproval?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function AIHeaderButton({
  hasPendingApproval: hasPendingApprovalProp,
  style,
  testID = "ai-header-button",
}: AIHeaderButtonProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { t } = useI18n()
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const copilotSheet = useOptionalMobileCopilotSheet()

  const { data: threadsData } = useListThreadsQuery(
    { isArchived: false, pageSize: 20, pageToken: "" },
    {
      enabled: Boolean(activeSpaceId) && hasPendingApprovalProp === undefined,
    }
  )

  const hasPendingApproval =
    hasPendingApprovalProp !== undefined
      ? hasPendingApprovalProp
      : (threadsData?.threads ?? []).some(
          (t) => t.status === "awaiting_approval"
        )

  const handleOpenAI = () => {
    haptics.light()
    if (copilotSheet) {
      copilotSheet.openCopilotSheet()
      return
    }
    router.push("/(app)/ai" as never)
  }

  return (
    <TouchableOpacity
      style={[styles.iconButton, styles.aiButton, style]}
      activeOpacity={0.7}
      onPress={handleOpenAI}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel={t("menu.aiAssistant")}
      testID={testID}
    >
      <Sparkles size={16} color={colors.primary} />
      {hasPendingApproval && <View style={styles.approvalDot} />}
    </TouchableOpacity>
  )
}

export function AppHeader() {
  const styles = useThemedStyles(createStyles)
  const insets = useSafeAreaInsets()

  return (
    <View
      style={[styles.container, { paddingTop: Math.max(insets.top, 12) + 6 }]}
    >
      {/* Official Brand Logo + Wordmark */}
      <View style={styles.brandContainer}>
        <View style={styles.logoWrapper}>
          <Image
            source={require("../assets/saturn_logo.jpg")}
            style={styles.logoImage}
            resizeMode="cover"
          />
        </View>
        <Text style={styles.brandTitle}>Saturn</Text>
      </View>

      {/* Right controls: AI Assistant + Gmail-style Space Avatar Switcher */}
      <View style={styles.rightControls}>
        <AIHeaderButton />
        <SpaceAvatarButton />
      </View>
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    backgroundColor: t.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  brandContainer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  logoWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: t.colors.border,
    ...t.shadows.sm,
  },
  logoImage: {
    width: "100%" as const,
    height: "100%" as const,
  },
  brandTitle: {
    fontSize: 19,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    letterSpacing: -0.5,
  },
  rightControls: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  avatarRing: {
    position: "relative" as const,
    borderWidth: 1.5,
    borderColor: t.colors.borderStrong,
    borderRadius: 999,
    padding: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  multiSpaceDot: {
    position: "absolute" as const,
    right: -1,
    bottom: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: t.colors.primary,
    borderWidth: 1.5,
    borderColor: t.colors.background,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  aiButton: {
    backgroundColor: t.colors.primarySubtle,
    borderColor: `${t.colors.primary}59`,
  },
  approvalDot: {
    position: "absolute" as const,
    top: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: t.colors.warning,
    borderWidth: 1.5,
    borderColor: t.colors.background,
  },
})
