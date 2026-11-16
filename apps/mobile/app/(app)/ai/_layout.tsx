import { Stack } from "expo-router"
import { theme } from "@/lib/theme"

export default function AILayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.background,
        },
        headerTintColor: theme.colors.textPrimary,
        headerTitleStyle: {
          fontWeight: "600",
        },
        contentStyle: {
          backgroundColor: theme.colors.background,
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
