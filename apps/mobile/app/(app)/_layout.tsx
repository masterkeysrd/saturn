import { ActivityIndicator, Platform, View } from "react-native"
import { Redirect, Stack } from "expo-router"
import { useI18n } from "@saturn/hooks"
import { useAuth } from "@/lib/auth-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"

export const unstable_settings = {
  anchor: "(tabs)",
}

export default function AppLayout() {
  const { isAuthenticated, isLoading } = useAuth()
  const { colors, resolvedMode } = useTheme()
  const { t } = useI18n()
  const styles = useThemedStyles(createStyles)

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
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
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="ai" />
      <Stack.Screen
        name="settings/index"
        options={{
          headerShown: true,
          headerTitle: t("nav.settings"),
          headerBackTitle: t("common.back"),
        }}
      />
      <Stack.Screen
        name="settings/space"
        options={{
          headerShown: true,
          headerTitle: "Workspace Settings",
          headerBackTitle: t("nav.settings"),
        }}
      />
      <Stack.Screen
        name="settings/security"
        options={{
          headerShown: true,
          headerTitle: "Active Sessions & Security",
          headerBackTitle: t("nav.settings"),
        }}
      />
      <Stack.Screen
        name="settings/api-keys"
        options={{
          headerShown: true,
          headerTitle: "API Keys",
          headerBackTitle: "Security",
        }}
      />
      <Stack.Screen
        name="settings/connected-accounts"
        options={{
          headerShown: true,
          headerTitle: "Connected Accounts",
          headerBackTitle: t("nav.settings"),
        }}
      />
      <Stack.Screen
        name="settings/design-system"
        options={{
          headerShown: true,
          headerTitle: "Design System",
          headerBackTitle: t("nav.menu"),
        }}
      />
      <Stack.Screen
        name="finance/transactions/index"
        options={{
          headerShown: true,
          headerTitle: t("nav.transactions"),
          headerBackTitle: t("nav.finance"),
        }}
      />
      <Stack.Screen
        name="finance/transactions/[id]"
        options={{
          headerShown: true,
          headerTitle: "Transaction Details",
          headerBackTitle: t("nav.transactions"),
        }}
      />
      <Stack.Screen
        name="finance/inbox"
        options={{
          headerShown: true,
          headerTitle: t("nav.inbox"),
          headerBackTitle: t("nav.finance"),
        }}
      />
      <Stack.Screen
        name="finance/budgets"
        options={{
          headerShown: true,
          headerTitle: t("nav.budgets"),
          headerBackTitle: t("nav.finance"),
        }}
      />
      <Stack.Screen
        name="finance/budgets/[id]"
        options={{
          headerShown: true,
          headerTitle: "Budget Details",
          headerBackTitle: t("nav.budgets"),
        }}
      />
      <Stack.Screen
        name="finance/accounts"
        options={{
          headerShown: true,
          headerTitle: t("nav.accounts"),
          headerBackTitle: t("nav.finance"),
        }}
      />
      <Stack.Screen
        name="finance/accounts/[id]"
        options={{
          headerShown: true,
          headerTitle: "Account Details",
          headerBackTitle: t("nav.accounts"),
        }}
      />
      <Stack.Screen
        name="finance/recurring"
        options={{
          headerShown: true,
          headerTitle: t("nav.recurring"),
          headerBackTitle: t("nav.finance"),
        }}
      />
      <Stack.Screen
        name="finance/borrowing"
        options={{
          headerShown: true,
          headerTitle: t("nav.borrowing"),
          headerBackTitle: t("nav.finance"),
        }}
      />
      <Stack.Screen
        name="finance/borrowing/[id]"
        options={{
          headerShown: true,
          headerTitle: "Agreement Details",
          headerBackTitle: t("nav.borrowing"),
        }}
      />
      <Stack.Screen
        name="mail/[threadId]"
        options={{
          headerShown: true,
          headerTitle: "Conversation",
          headerBackTitle: t("nav.mail"),
        }}
      />
      <Stack.Screen
        name="workflows/index"
        options={{
          headerShown: true,
          headerTitle: t("nav.workflows"),
          headerBackTitle: t("common.back"),
        }}
      />
      <Stack.Screen
        name="workflows/[id]"
        options={{
          headerShown: true,
          headerTitle: "Workflow Editor",
          headerBackTitle: t("nav.workflows"),
        }}
      />
      <Stack.Screen
        name="workflows/runs/[runId]"
        options={{
          headerShown: true,
          headerTitle: "Run Trace",
          headerBackTitle: t("nav.workflows"),
        }}
      />
    </Stack>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  loadingContainer: {
    flex: 1,
    backgroundColor: t.colors.background,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
})
