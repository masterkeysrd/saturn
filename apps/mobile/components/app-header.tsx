import React from "react"
import { View, Text, Image, TouchableOpacity } from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ChevronDown, Sparkles, Settings } from "lucide-react-native"
import { useListThreadsQuery } from "@saturn/api/saturn/platform/ai/v1/ai"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

export interface SpaceSwitcherChipProps {
  compact?: boolean
  testID?: string
}

export function SpaceSwitcherChip({
  compact = false,
  testID = "space-switcher-chip",
}: SpaceSwitcherChipProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const router = useRouter()
  const { activeSpace } = useSpace()

  const handleSwitchSpace = () => {
    haptics.light()
    router.push("/modal/switch-space")
  }

  return (
    <TouchableOpacity
      style={[styles.spacePill, compact && styles.spacePillCompact]}
      activeOpacity={0.7}
      onPress={handleSwitchSpace}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel={`Switch workspace, current ${activeSpace?.name || "Personal"}`}
      testID={testID}
    >
      <Text
        style={[styles.spaceName, compact && styles.spaceNameCompact]}
        numberOfLines={1}
      >
        {activeSpace?.name || "Personal"}
      </Text>
      <ChevronDown size={compact ? 12 : 13} color={colors.textMuted} />
    </TouchableOpacity>
  )
}

export interface AIHeaderButtonProps {
  hasPendingApproval?: boolean
  testID?: string
}

export function AIHeaderButton({
  hasPendingApproval: hasPendingApprovalProp,
  testID = "ai-header-button",
}: AIHeaderButtonProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const router = useRouter()
  const { activeSpaceId } = useSpace()

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
    router.push("/(app)/ai" as never)
  }

  return (
    <TouchableOpacity
      style={[styles.iconButton, styles.aiButton]}
      activeOpacity={0.7}
      onPress={handleOpenAI}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel="Open AI Assistant"
      testID={testID}
    >
      <Sparkles size={16} color={colors.primary} />
      {hasPendingApproval && <View style={styles.approvalDot} />}
    </TouchableOpacity>
  )
}

export function AppHeader() {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const router = useRouter()
  const insets = useSafeAreaInsets()

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

      {/* Right controls: Space Switcher pill + AI Assistant + Settings */}
      <View style={styles.rightControls}>
        <SpaceSwitcherChip />
        <AIHeaderButton />

        <TouchableOpacity
          style={styles.iconButton}
          activeOpacity={0.7}
          onPress={handleSettings}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel="Open Settings"
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
  spacePillCompact: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 4,
    maxWidth: 96,
  },
  spaceName: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    flexShrink: 1,
  },
  spaceNameCompact: {
    fontSize: 12,
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
