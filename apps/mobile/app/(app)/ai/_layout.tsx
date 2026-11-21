import { Stack } from "expo-router"
import { Platform } from "react-native"
import { useI18n } from "@saturn/hooks"
import { useTheme } from "@/lib/theme"

export default function AILayout() {
  const { colors, resolvedMode } = useTheme()
  const { t } = useI18n()

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor:
            Platform.OS === "ios" ? "transparent" : colors.background,
        },
        headerUserInterfaceStyle: resolvedMode,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        headerTintColor: colors.textPrimary,
        headerTitleStyle: {
          fontWeight: "600",
        },
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: t("menu.aiAssistant"),
        }}
      />
      <Stack.Screen
        name="threads/[threadId]"
        options={{
          title: t("ai.chatMobile.chatTitle"),
        }}
      />
      <Stack.Screen
        name="agents"
        options={{
          title: t("ai.agentsMobile.title"),
        }}
      />
      <Stack.Screen
        name="runs/[runId]"
        options={{
          title: t("ai.chatMobile.runTraceTitle"),
        }}
      />
    </Stack>
  )
}
