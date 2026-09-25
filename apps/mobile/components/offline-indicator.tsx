import React, { useEffect, useState } from "react"
import { StyleSheet, Text, View, Platform } from "react-native"
import { WifiOff } from "lucide-react-native"
import { onlineManager } from "@tanstack/react-query"
import NetInfo from "@react-native-community/netinfo"

interface OfflineIndicatorProps {
  bottomOffset?: number
}

export function OfflineIndicator({ bottomOffset = 0 }: OfflineIndicatorProps) {
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
      <WifiOff size={13} color="#f59e0b" />
      <Text style={styles.text}>Offline Mode — Showing cached data</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  dockedBar: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 26,
    backgroundColor: "rgba(24, 21, 15, 0.96)",
    borderTopWidth: 1,
    borderTopColor: "rgba(245, 158, 11, 0.35)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(245, 158, 11, 0.2)",
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fbbf24",
    letterSpacing: 0.2,
  },
})
