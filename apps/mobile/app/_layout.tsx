import { GestureHandlerRootView } from "react-native-gesture-handler"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet"
import { AuthProvider } from "@/lib/auth-context"
import { ToastProvider } from "@/components/ui/toast"
import { theme } from "@/lib/theme"

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
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <BottomSheetModalProvider>
              <ToastProvider>
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
                  <Stack.Screen
                    name="(auth)"
                    options={{ headerShown: false }}
                  />
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
              </ToastProvider>
            </BottomSheetModalProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
