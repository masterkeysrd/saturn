import { useCallback, useEffect, useRef, useState } from "react"
import { Platform } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import {
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from "react-native-reanimated"
import { isRunningInExpoGo } from "expo"
import { Stack } from "expo-router"
import * as SplashScreen from "expo-splash-screen"
import { StatusBar } from "expo-status-bar"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { SpaceProvider } from "@/lib/space-context"
import { ToastProvider } from "@/components/ui/toast"
import { queryClient, persistOptions } from "@/lib/query-persister"
import { theme } from "@/lib/theme"

void SplashScreen.preventAutoHideAsync().catch(() => {})
if (!isRunningInExpoGo()) {
  SplashScreen.setOptions({
    duration: 250,
    fade: true,
  })
}

// Suppress Reanimated 4.7+ warnings triggered by @gorhom/bottom-sheet passing
// explicit dependency arrays to worklet hooks on native.
configureReanimatedLogger({
  level: ReanimatedLogLevel.error,
  strict: false,
})

function SplashScreenController({ isLayoutReady }: { isLayoutReady: boolean }) {
  const { isLoading } = useAuth()
  const hiddenRef = useRef(false)

  useEffect(() => {
    if (!isLoading && isLayoutReady && !hiddenRef.current) {
      hiddenRef.current = true
      void SplashScreen.hideAsync()
    }
  }, [isLoading, isLayoutReady])

  return null
}

export default function RootLayout() {
  const [isLayoutReady, setIsLayoutReady] = useState(false)

  const handleRootLayout = useCallback(() => {
    setIsLayoutReady(true)
  }, [])

  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      onLayout={handleRootLayout}
    >
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={persistOptions}
        >
          <AuthProvider>
            <SplashScreenController isLayoutReady={isLayoutReady} />
            <SpaceProvider>
              <BottomSheetModalProvider>
                <ToastProvider>
                  <StatusBar style="light" />
                  <Stack
                    screenOptions={{
                      headerStyle: {
                        backgroundColor:
                          Platform.OS === "ios"
                            ? "transparent"
                            : theme.colors.background,
                      },
                      headerUserInterfaceStyle: "dark",
                      headerShadowVisible: false,
                      headerBackButtonDisplayMode: "minimal",
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
                        ...(Platform.OS !== "ios" && {
                          headerStyle: {
                            backgroundColor: theme.colors.surface,
                          },
                        }),
                      }}
                    />
                    <Stack.Screen
                      name="modal/switch-space"
                      options={{
                        presentation: "formSheet",
                        headerTitle: "Switch Workspace",
                        ...(Platform.OS !== "ios" && {
                          headerStyle: {
                            backgroundColor: theme.colors.surface,
                          },
                        }),
                      }}
                    />
                    <Stack.Screen
                      name="server-settings"
                      options={{
                        headerTitle: "Settings",
                        ...(Platform.OS !== "ios" && {
                          headerStyle: {
                            backgroundColor: theme.colors.surface,
                          },
                        }),
                      }}
                    />
                    <Stack.Screen
                      name="modal/create-space"
                      options={{
                        presentation: "modal",
                        headerTitle: "Create Workspace",
                        ...(Platform.OS !== "ios" && {
                          headerStyle: {
                            backgroundColor: theme.colors.surface,
                          },
                        }),
                      }}
                    />
                    <Stack.Screen
                      name="modal/manage-budget"
                      options={{
                        presentation: "modal",
                        headerTitle: "Manage Budget",
                        ...(Platform.OS !== "ios" && {
                          headerStyle: {
                            backgroundColor: theme.colors.surface,
                          },
                        }),
                      }}
                    />
                    <Stack.Screen
                      name="modal/manage-account"
                      options={{
                        presentation: "modal",
                        headerTitle: "Manage Account",
                        ...(Platform.OS !== "ios" && {
                          headerStyle: {
                            backgroundColor: theme.colors.surface,
                          },
                        }),
                      }}
                    />
                    <Stack.Screen
                      name="modal/manage-recurring"
                      options={{
                        presentation: "modal",
                        headerTitle: "Recurring Template",
                        ...(Platform.OS !== "ios" && {
                          headerStyle: {
                            backgroundColor: theme.colors.surface,
                          },
                        }),
                      }}
                    />
                    <Stack.Screen
                      name="modal/manage-borrowing"
                      options={{
                        presentation: "modal",
                        headerTitle: "Manage Debt / Loan",
                        ...(Platform.OS !== "ios" && {
                          headerStyle: {
                            backgroundColor: theme.colors.surface,
                          },
                        }),
                      }}
                    />
                    <Stack.Screen
                      name="modal/adjust-balance"
                      options={{
                        presentation: "modal",
                        headerTitle: "Adjust Balance",
                        ...(Platform.OS !== "ios" && {
                          headerStyle: {
                            backgroundColor: theme.colors.surface,
                          },
                        }),
                      }}
                    />
                    <Stack.Screen
                      name="modal/adjust-borrowing"
                      options={{
                        presentation: "modal",
                        headerTitle: "Adjust Debt Balance",
                        ...(Platform.OS !== "ios" && {
                          headerStyle: {
                            backgroundColor: theme.colors.surface,
                          },
                        }),
                      }}
                    />
                    <Stack.Screen
                      name="modal/manage-event"
                      options={{
                        presentation: "modal",
                        headerTitle: "Manage Event",
                        ...(Platform.OS !== "ios" && {
                          headerStyle: {
                            backgroundColor: theme.colors.surface,
                          },
                        }),
                      }}
                    />
                    <Stack.Screen
                      name="modal/compose-mail"
                      options={{
                        presentation: "modal",
                        headerTitle: "New Message",
                        ...(Platform.OS !== "ios" && {
                          headerStyle: {
                            backgroundColor: theme.colors.surface,
                          },
                        }),
                      }}
                    />
                    <Stack.Screen
                      name="modal/manage-api-key"
                      options={{
                        presentation: "modal",
                        headerTitle: "API Key",
                        ...(Platform.OS !== "ios" && {
                          headerStyle: {
                            backgroundColor: theme.colors.surface,
                          },
                        }),
                      }}
                    />
                    <Stack.Screen
                      name="modal/generate-workflow"
                      options={{
                        presentation: "modal",
                        headerTitle: "Generate Workflow",
                        ...(Platform.OS !== "ios" && {
                          headerStyle: {
                            backgroundColor: theme.colors.surface,
                          },
                        }),
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
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
