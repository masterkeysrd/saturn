import { Stack } from "expo-router"
import { Platform } from "react-native"
import { useTheme } from "@/lib/theme"

export default function AILayout() {
  const { colors, resolvedMode } = useTheme()

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
          title: "AI Assistant",
        }}
      />
      <Stack.Screen
        name="threads/[threadId]"
        options={{
          title: "Chat",
        }}
      />
      <Stack.Screen
        name="agents"
        options={{
          title: "Agents & Recent Runs",
        }}
      />
      <Stack.Screen
        name="runs/[runId]"
        options={{
          title: "AI Run Trace",
        }}
      />
    </Stack>
  )
}
