import React from "react"
import { View, Text, Image, TouchableOpacity } from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ChevronDown, Sparkles, Settings } from "lucide-react-native"
import { useListThreadsQuery } from "@saturn/api/saturn/platform/ai/v1/ai"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

export function AppHeader() {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { activeSpace, activeSpaceId } = useSpace()

  const { data: threadsData } = useListThreadsQuery(
    { isArchived: false, pageSize: 20, pageToken: "" },
    { enabled: Boolean(activeSpaceId) }
  )
  const hasPendingApproval = (threadsData?.threads ?? []).some(
    (t) => t.status === "awaiting_approval"
  )

  const handleSwitchSpace = () => {
    haptics.light()
    router.push("/modal/switch-space")
  }

  const handleOpenAI = () => {
    haptics.light()
    router.push("/(app)/ai" as never)
  }

  const handleSettings = () => {
    haptics.light()
    router.push("/(app)/settings")
  }

  return (
    <View
      style={[styles.container, { paddingTop: Math.max(insets.top, 12) + 6 }]}
    >
      {/* Official Brand Logo + Wordmark */}
      <View style={styles.brandContainer}>
        <View style={styles.logoWrapper}>
          <Image
            source={require("@/assets/saturn_logo.jpg")}
            style={styles.logoImage}
            resizeMode="cover"
          />
        </View>
        <Text style={styles.brandTitle}>Saturn</Text>
      </View>

      {/* Right controls: Space Switcher pill + Notification Bell + Settings */}
      <View style={styles.rightControls}>
        <TouchableOpacity
          style={styles.spacePill}
          activeOpacity={0.7}
          onPress={handleSwitchSpace}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={styles.spaceName} numberOfLines={1}>
            {activeSpace?.name || "Personal"}
          </Text>
          <ChevronDown size={13} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.iconButton, styles.aiButton]}
          activeOpacity={0.7}
          onPress={handleOpenAI}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          accessibilityLabel="Open AI Assistant"
        >
          <Sparkles size={16} color={colors.primary} />
          {hasPendingApproval && <View style={styles.approvalDot} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconButton}
          activeOpacity={0.7}
          onPress={handleSettings}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Settings size={17} color={colors.textSecondary} />
        </TouchableOpacity>
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
    gap: 6,
  },
  spacePill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: t.radius.full,
    gap: 5,
    maxWidth: 120,
  },
  spaceName: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    flexShrink: 1,
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
