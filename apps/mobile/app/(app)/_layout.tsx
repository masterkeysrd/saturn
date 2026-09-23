import React from "react"
import { ActivityIndicator, View, StyleSheet } from "react-native"
import { Redirect, Stack } from "expo-router"
import { useAuth } from "../../lib/auth-context"
import { theme } from "../../lib/theme"

export default function AppLayout() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: theme.colors.background,
        },
      }}
    >
      <Stack.Screen name="(tabs)" />
    </Stack>
  )
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
})
