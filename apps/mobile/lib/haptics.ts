import * as Haptics from "expo-haptics"
import { Platform } from "react-native"

/**
 * Safe haptic feedback helpers with silent fallback on web or unsupported devices.
 */
export const haptics = {
  light: async () => {
    if (Platform.OS === "web") return
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } catch {
      // Ignored
    }
  },

  medium: async () => {
    if (Platform.OS === "web") return
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    } catch {
      // Ignored
    }
  },

  heavy: async () => {
    if (Platform.OS === "web") return
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    } catch {
      // Ignored
    }
  },

  selection: async () => {
    if (Platform.OS === "web") return
    try {
      await Haptics.selectionAsync()
    } catch {
      // Ignored
    }
  },

  success: async () => {
    if (Platform.OS === "web") return
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch {
      // Ignored
    }
  },

  warning: async () => {
    if (Platform.OS === "web") return
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    } catch {
      // Ignored
    }
  },

  error: async () => {
    if (Platform.OS === "web") return
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } catch {
      // Ignored
    }
  },
}
