import React from "react"
import { TouchableOpacity, View, Text, StyleSheet } from "react-native"
import { useRouter } from "expo-router"
import { ChevronDown } from "lucide-react-native"
import { useSpace } from "@/lib/space-context"
import { Avatar } from "@/components/ui/avatar"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

export interface SpaceHeaderProps {
  onPress?: () => void
}

export function SpaceHeader({ onPress }: SpaceHeaderProps) {
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
      <ChevronDown size={16} color={theme.colors.textMuted} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
    gap: 8,
    maxWidth: 220,
  },
  textContainer: {
    flexShrink: 1,
  },
  spaceName: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
})
