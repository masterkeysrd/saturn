import React from "react"
import { Redirect, Stack } from "expo-router"
import { useAuth } from "../../lib/auth-context"
import { theme } from "../../lib/theme"

export default function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuth()

  if (!isLoading && isAuthenticated) {
    return <Redirect href="/(app)/(tabs)" />
  }

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
        name="login"
        options={{ title: "Sign In", headerShown: false }}
      />
      <Stack.Screen name="register" options={{ title: "Create Account" }} />
    </Stack>
  )
}
