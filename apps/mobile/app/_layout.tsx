import React from "react"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AuthProvider } from "../lib/auth-context"
import { theme } from "../lib/theme"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60,
    },
  },
})

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="light" />
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
            <Stack.Screen name="(app)" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen
              name="modal/add-transaction"
              options={{
                presentation: "modal",
                headerTitle: "New Transaction",
                headerStyle: {
                  backgroundColor: theme.colors.surface,
                },
              }}
            />
            <Stack.Screen
              name="modal/switch-space"
              options={{
                presentation: "formSheet",
                headerTitle: "Switch Workspace",
                headerStyle: {
                  backgroundColor: theme.colors.surface,
                },
              }}
            />
            <Stack.Screen
              name="+not-found"
              options={{
                title: "Not Found",
              }}
            />
          </Stack>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
