import React, { useState } from "react"
import { View, Text, Image } from "react-native"
import { Check } from "lucide-react-native"
import { useThemedStyles, type SaturnMobileTheme } from "../../lib/theme"

const PALETTE_COLORS = [
  { bg: "#312e81", text: "#c7d2fe" }, // Indigo
  { bg: "#064e3b", text: "#a7f3d0" }, // Emerald
  { bg: "#4c1d95", text: "#ddd6fe" }, // Violet
  { bg: "#78350f", text: "#fde68a" }, // Amber
  { bg: "#881337", text: "#fecdd3" }, // Rose
  { bg: "#0c4a6e", text: "#bae6fd" }, // Sky
  { bg: "#134e4a", text: "#99f6e4" }, // Teal
  { bg: "#7c2d12", text: "#fed7aa" }, // Orange
]

export function getSenderPalette(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  const idx = Math.abs(hash) % PALETTE_COLORS.length
  return PALETTE_COLORS[idx]
}

export function getSenderInitials(name?: string, email?: string): string {
  const cleanName = (name || "").trim()
  if (cleanName) {
    const parts = cleanName.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return cleanName.slice(0, 2).toUpperCase()
  }
  if (email) {
    return email.charAt(0).toUpperCase()
  }
  return "U"
}

export interface ThreadAvatarProps {
  name?: string
  email?: string
  avatarUrl?: string
  isVerified?: boolean
  accountColor?: string
  size?: number
}

export function ThreadAvatar({
  name,
  email,
  avatarUrl,
  isVerified,
  accountColor,
  size = 38,
}: ThreadAvatarProps) {
  const styles = useThemedStyles(createStyles)
  const [imgError, setImgError] = useState(false)
  const initials = getSenderInitials(name, email)
  const palette = getSenderPalette(name || email || "sender")
  const showImage = Boolean(avatarUrl && !imgError)
  const radius = size / 2

  return (
    <View
      testID="mobile-sender-avatar"
      style={[
        styles.avatarWrapper,
        {
          width: size,
          height: size,
          borderRadius: radius,
          marginTop: size >= 38 ? 2 : 0,
        },
        accountColor ? { borderColor: accountColor } : null,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: avatarUrl }}
          onError={() => setImgError(true)}
          style={[styles.avatarImage, { borderRadius: radius }]}
          resizeMode="contain"
        />
      ) : (
        <View
          style={[
            styles.avatarFallback,
            { borderRadius: radius, backgroundColor: palette.bg },
          ]}
        >
          <Text
            style={[
              styles.avatarInitialsText,
              { fontSize: Math.round(size * 0.34), color: palette.text },
            ]}
          >
            {initials}
          </Text>
        </View>
      )}

      {/* Verified Organization Checkmark Badge */}
      {isVerified && (
        <View
          testID="mobile-avatar-verified-badge"
          style={styles.verifiedCheckBadge}
        >
          <Check size={8} color="#ffffff" strokeWidth={3} />
        </View>
      )}
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  avatarWrapper: {
    borderWidth: 1.5,
    borderColor: "transparent",
    position: "relative" as const,
  },
  avatarImage: {
    width: "100%" as const,
    height: "100%" as const,
    backgroundColor: "#ffffff",
  },
  avatarFallback: {
    width: "100%" as const,
    height: "100%" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  avatarInitialsText: {
    fontWeight: "700" as const,
  },
  verifiedCheckBadge: {
    position: "absolute" as const,
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#2563eb",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1.5,
    borderColor: t.colors.surface,
  },
})
