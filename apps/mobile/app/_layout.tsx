import { GestureHandlerRootView } from "react-native-gesture-handler"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet"
import { AuthProvider } from "@/lib/auth-context"
import { SpaceProvider } from "@/lib/space-context"
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
            <SpaceProvider>
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
                    <Stack.Screen
                      name="(app)"
                      options={{ headerShown: false }}
                    />
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
                      name="modal/create-space"
                      options={{
                        presentation: "modal",
                        headerTitle: "Create Workspace",
                        headerStyle: {
                          backgroundColor: theme.colors.surface,
                        },
                      }}
                    />
                    <Stack.Screen
                      name="modal/manage-budget"
                      options={{
                        presentation: "modal",
                        headerTitle: "Manage Budget",
                        headerStyle: {
                          backgroundColor: theme.colors.surface,
                        },
                      }}
                    />
                    <Stack.Screen
                      name="modal/manage-account"
                      options={{
                        presentation: "modal",
                        headerTitle: "Manage Account",
                        headerStyle: {
                          backgroundColor: theme.colors.surface,
                        },
                      }}
                    />
                    <Stack.Screen
                      name="modal/adjust-balance"
                      options={{
                        presentation: "modal",
                        headerTitle: "Adjust Balance",
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
            </SpaceProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
