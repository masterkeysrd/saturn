import { Redirect, Stack } from "expo-router"
import { Platform } from "react-native"
import { useAuth } from "@/lib/auth-context"
import { useTheme } from "@/lib/theme"

export default function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuth()
  const { colors, resolvedMode } = useTheme()

  if (!isLoading && isAuthenticated) {
    return <Redirect href="/(app)/(tabs)" />
  }

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
        name="login"
        options={{ title: "Sign In", headerShown: false }}
      />
      <Stack.Screen
        name="register"
        options={{ title: "Create Account", headerShown: false }}
      />
    </Stack>
  )
}
