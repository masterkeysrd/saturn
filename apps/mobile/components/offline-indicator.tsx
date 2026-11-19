import React, { useEffect, useState } from "react"
import { Text, View, Platform } from "react-native"
import { WifiOff } from "lucide-react-native"
import { onlineManager } from "@tanstack/react-query"
import NetInfo from "@react-native-community/netinfo"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"

interface OfflineIndicatorProps {
  bottomOffset?: number
}

export function OfflineIndicator({ bottomOffset = 0 }: OfflineIndicatorProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    // Initial check on native devices
    if (Platform.OS !== "web") {
      NetInfo.fetch().then((state) => {
        const offline =
          state.isConnected === false ||
          (state.isConnected === true && state.isInternetReachable === false)
        setIsOffline(offline)
      })
    }

    // Subscribe to TanStack onlineManager
    return onlineManager.subscribe(() => {
      setIsOffline(!onlineManager.isOnline())
    })
  }, [])

  if (!isOffline) {
    return null
  }

  return (
    <View
      style={[
        styles.dockedBar,
        {
          bottom: bottomOffset,
        },
      ]}
      pointerEvents="none"
    >
      <WifiOff size={13} color={colors.warning} />
      <Text style={styles.text}>Offline Mode — Showing cached data</Text>
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  dockedBar: {
    position: "absolute" as const,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    height: 26,
    backgroundColor: t.isDark
      ? "rgba(24, 21, 15, 0.96)"
      : "rgba(254, 243, 199, 0.96)",
    borderTopWidth: 1,
    borderTopColor: `${t.colors.warning}59`,
    borderBottomWidth: 1,
    borderBottomColor: `${t.colors.warning}33`,
  },
  text: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.warning,
    letterSpacing: 0.2,
  },
})
