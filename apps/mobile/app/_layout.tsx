import { useCallback, useEffect, useRef, useState } from "react"
import { Platform, TouchableOpacity } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import {
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from "react-native-reanimated"
import { isRunningInExpoGo } from "expo"
import { Stack, router } from "expo-router"
import * as SplashScreen from "expo-splash-screen"
import { StatusBar } from "expo-status-bar"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet"
import { X } from "lucide-react-native"
import { useI18n } from "@saturn/hooks"
import type { TranslationKey } from "@saturn/i18n"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { SpaceProvider } from "@/lib/space-context"
import { ToastProvider } from "@/components/ui/toast"
import { queryClient, persistOptions } from "@/lib/query-persister"
import { MobileThemeProvider, useTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

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

function modalCloseHeaderOptions(iconColor: string, closeLabel: string) {
  return Platform.OS === "ios"
    ? {
        unstable_headerLeftItems: () => [
          {
            type: "button" as const,
            label: closeLabel,
            icon: { type: "sfSymbol" as const, name: "xmark" as const },
            onPress: () => {
              haptics.light()
              router.back()
            },
          },
        ],
      }
    : {
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => {
              haptics.light()
              router.back()
            }}
            style={{ paddingHorizontal: 4, paddingVertical: 4 }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={closeLabel}
          >
            <X size={20} color={iconColor} />
          </TouchableOpacity>
        ),
      }
}

function LocalizedRootStack({ colors }: { colors: ReturnType<typeof useTheme>["colors"] }) {
  const { resolvedMode } = useTheme()
  const { t } = useI18n()

  const modalClose = modalCloseHeaderOptions(colors.textMuted, t("common.close"))
  const modalScreenOptions = (headerTitle: string, close = false) => ({
    presentation: "modal" as const,
    headerTitle,
    ...(close ? modalClose : {}),
    ...(Platform.OS !== "ios" && {
      headerStyle: {
        backgroundColor: colors.surface,
      },
    }),
  })

  const headerTitleKeys: Record<string, TranslationKey> = {
    "modal/add-transaction": "finance.transactions.create.mobile.newTransaction",
    "modal/switch-space": "space.switchTitle",
    "server-settings": "settings.server.title",
    "modal/create-space": "settings.spaces.mobile.createHeader",
    "modal/manage-budget": "finance.budgets.mobile.manageHeader",
    "modal/manage-account": "finance.accounts.mobile.manageHeader",
    "modal/manage-recurring": "finance.recurring.mobile.templateHeader",
    "modal/manage-borrowing": "finance.borrowing.mobile.manageHeader",
    "modal/adjust-balance": "finance.accounts.card.adjust",
    "modal/adjust-borrowing": "finance.borrowing.mobile.adjustDebtHeader",
    "modal/manage-event": "calendar.mobile.manageHeader",
    "modal/compose-mail": "mail.newMessage",
    "modal/manage-api-key": "settings.apiKeys.mobile.headerTitle",
    "modal/generate-workflow": "workflows.mobile.generateWorkflowTitle",
    "+not-found": "common.notFound.title",
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
      <Stack.Screen name="(app)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen
        name="modal/add-transaction"
        options={modalScreenOptions(
          t(headerTitleKeys["modal/add-transaction"]),
          true
        )}
      />
      <Stack.Screen
        name="modal/switch-space"
        options={modalScreenOptions(t(headerTitleKeys["modal/switch-space"]), true)}
      />
      <Stack.Screen
        name="server-settings"
        options={{
          headerTitle: t(headerTitleKeys["server-settings"]),
          ...(Platform.OS !== "ios" && {
            headerStyle: {
              backgroundColor: colors.surface,
            },
          }),
        }}
      />
      <Stack.Screen
        name="modal/create-space"
        options={modalScreenOptions(
          t(headerTitleKeys["modal/create-space"]),
          true
        )}
      />
      <Stack.Screen
        name="modal/manage-budget"
        options={modalScreenOptions(t(headerTitleKeys["modal/manage-budget"]))}
      />
      <Stack.Screen
        name="modal/manage-account"
        options={modalScreenOptions(t(headerTitleKeys["modal/manage-account"]))}
      />
      <Stack.Screen
        name="modal/manage-recurring"
        options={modalScreenOptions(
          t(headerTitleKeys["modal/manage-recurring"])
        )}
      />
      <Stack.Screen
        name="modal/manage-borrowing"
        options={modalScreenOptions(
          t(headerTitleKeys["modal/manage-borrowing"])
        )}
      />
      <Stack.Screen
        name="modal/adjust-balance"
        options={modalScreenOptions(t(headerTitleKeys["modal/adjust-balance"]))}
      />
      <Stack.Screen
        name="modal/adjust-borrowing"
        options={modalScreenOptions(
          t(headerTitleKeys["modal/adjust-borrowing"])
        )}
      />
      <Stack.Screen
        name="modal/manage-event"
        options={modalScreenOptions(t(headerTitleKeys["modal/manage-event"]))}
      />
      <Stack.Screen
        name="modal/compose-mail"
        options={{
          presentation: "modal",
          headerShown: false,
          headerTitle: t(headerTitleKeys["modal/compose-mail"]),
          ...(Platform.OS !== "ios" && {
            headerStyle: {
              backgroundColor: colors.surface,
            },
          }),
        }}
      />
      <Stack.Screen
        name="modal/manage-api-key"
        options={modalScreenOptions(
          t(headerTitleKeys["modal/manage-api-key"]),
          true
        )}
      />
      <Stack.Screen
        name="modal/generate-workflow"
        options={modalScreenOptions(
          t(headerTitleKeys["modal/generate-workflow"]),
          true
        )}
      />
      <Stack.Screen
        name="+not-found"
        options={{ title: t(headerTitleKeys["+not-found"]) }}
      />
    </Stack>
  )
}

function RootNavigationShell({
  onRootLayout,
  isLayoutReady,
}: {
  onRootLayout: () => void
  isLayoutReady: boolean
}) {
  const { resolvedMode, colors } = useTheme()

  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: colors.background }}
      onLayout={onRootLayout}
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
                  <StatusBar
                    style={resolvedMode === "dark" ? "light" : "dark"}
                  />
                  <LocalizedRootStack colors={colors} />
                </ToastProvider>
              </BottomSheetModalProvider>
            </SpaceProvider>
          </AuthProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

export default function RootLayout() {
  const [isLayoutReady, setIsLayoutReady] = useState(false)

  const handleRootLayout = useCallback(() => {
    setIsLayoutReady(true)
  }, [])

  return (
    <MobileThemeProvider>
      <RootNavigationShell
        onRootLayout={handleRootLayout}
        isLayoutReady={isLayoutReady}
      />
    </MobileThemeProvider>
  )
}
