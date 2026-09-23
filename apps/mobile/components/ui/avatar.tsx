import React from "react"
import {
  View,
  Text,
  Image,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type ImageStyle,
} from "react-native"
import { getAvatarColor, theme } from "@/lib/theme"

export interface AvatarProps {
  name: string
  imageUri?: string | null
  size?: number
  style?: StyleProp<ViewStyle & ImageStyle>
}

export function Avatar({ name, imageUri, size = 36, style }: AvatarProps) {
  const getInitials = (str: string) => {
    if (!str) return "S"
    const parts = str.trim().split(/\s+/)
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return str.slice(0, 2).toUpperCase()
  }

  const bgColor = getAvatarColor(name)
  const initials = getInitials(name)
  const fontSize = Math.floor(size * 0.4)

  if (imageUri) {
    return (
      <Image
        source={{ uri: imageUri }}
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: theme.colors.surfaceElevated,
          },
          style,
        ]}
      />
    )
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bgColor,
        },
        style,
      ]}
    >
      <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: "#ffffff",
    fontWeight: "700",
  },
})
