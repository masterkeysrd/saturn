import React from "react"
import { TouchableOpacity, View, Text } from "react-native"
import { useRouter } from "expo-router"
import { ChevronDown } from "lucide-react-native"
import { useSpace } from "@/lib/space-context"
import { Avatar } from "@/components/ui/avatar"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

export interface SpaceHeaderProps {
  onPress?: () => void
}

export function SpaceHeader({ onPress }: SpaceHeaderProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const router = useRouter()
  const { activeSpace } = useSpace()

  const handlePress = () => {
    haptics.light()
    if (onPress) {
      onPress()
    } else {
      router.push("/modal/switch-space")
    }
  }

  const spaceName = activeSpace?.name || "Personal Workspace"

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handlePress}
      style={styles.container}
    >
      <Avatar name={spaceName} size={28} />
      <View style={styles.textContainer}>
        <Text style={styles.spaceName} numberOfLines={1}>
          {spaceName}
        </Text>
      </View>
      <ChevronDown size={16} color={colors.textMuted} />
    </TouchableOpacity>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: t.radius.full,
    gap: 8,
    maxWidth: 220,
  },
  textContainer: {
    flexShrink: 1,
  },
  spaceName: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
})
