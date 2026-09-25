import React from "react"
import { StyleSheet, View, Text, Image, TouchableOpacity } from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ChevronDown, Bell, Settings } from "lucide-react-native"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

export function AppHeader() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { activeSpace } = useSpace()

  const handleSwitchSpace = () => {
    haptics.light()
    router.push("/modal/switch-space")
  }

  const handleNotifications = () => {
    haptics.light()
    router.push("/(app)/(tabs)/menu")
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
          <ChevronDown size={13} color={theme.colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconButton}
          activeOpacity={0.7}
          onPress={handleNotifications}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Bell size={17} color={theme.colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconButton}
          activeOpacity={0.7}
          onPress={handleSettings}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Settings size={17} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    ...theme.shadows.sm,
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  brandTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    letterSpacing: -0.5,
  },
  rightControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  spacePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    gap: 5,
    maxWidth: 120,
  },
  spaceName: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
})
