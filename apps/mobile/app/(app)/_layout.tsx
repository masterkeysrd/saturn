import { ActivityIndicator, Platform, View, StyleSheet } from "react-native"
import { Redirect, Stack } from "expo-router"
import { useAuth } from "@/lib/auth-context"
import { theme } from "@/lib/theme"

export const unstable_settings = {
  anchor: "(tabs)",
}

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
        headerStyle: {
          backgroundColor:
            Platform.OS === "ios" ? "transparent" : theme.colors.background,
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
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="ai" />
      <Stack.Screen
        name="settings/index"
        options={{
          headerShown: true,
          headerTitle: "Settings",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="settings/space"
        options={{
          headerShown: true,
          headerTitle: "Workspace Settings",
          headerBackTitle: "Settings",
        }}
      />
      <Stack.Screen
        name="settings/security"
        options={{
          headerShown: true,
          headerTitle: "Active Sessions & Security",
          headerBackTitle: "Settings",
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
          headerBackTitle: "Settings",
        }}
      />
      <Stack.Screen
        name="settings/design-system"
        options={{
          headerShown: true,
          headerTitle: "Design System",
          headerBackTitle: "Menu",
        }}
      />
      <Stack.Screen
        name="finance/transactions/index"
        options={{
          headerShown: true,
          headerTitle: "Transactions",
          headerBackTitle: "Finance",
        }}
      />
      <Stack.Screen
        name="finance/transactions/[id]"
        options={{
          headerShown: true,
          headerTitle: "Transaction Details",
          headerBackTitle: "Transactions",
        }}
      />
      <Stack.Screen
        name="finance/budgets"
        options={{
          headerShown: true,
          headerTitle: "Budgets",
          headerBackTitle: "Finance",
        }}
      />
      <Stack.Screen
        name="finance/budgets/[id]"
        options={{
          headerShown: true,
          headerTitle: "Budget Details",
          headerBackTitle: "Budgets",
        }}
      />
      <Stack.Screen
        name="finance/accounts"
        options={{
          headerShown: true,
          headerTitle: "Accounts",
          headerBackTitle: "Finance",
        }}
      />
      <Stack.Screen
        name="finance/accounts/[id]"
        options={{
          headerShown: true,
          headerTitle: "Account Details",
          headerBackTitle: "Accounts",
        }}
      />
      <Stack.Screen
        name="finance/recurring"
        options={{
          headerShown: true,
          headerTitle: "Recurring & Bills",
          headerBackTitle: "Finance",
        }}
      />
      <Stack.Screen
        name="finance/borrowing"
        options={{
          headerShown: true,
          headerTitle: "Debts & Loans",
          headerBackTitle: "Finance",
        }}
      />
      <Stack.Screen
        name="finance/borrowing/[id]"
        options={{
          headerShown: true,
          headerTitle: "Agreement Details",
          headerBackTitle: "Debts & Loans",
        }}
      />
      <Stack.Screen
        name="mail/[threadId]"
        options={{
          headerShown: true,
          headerTitle: "Conversation",
          headerBackTitle: "Mail",
        }}
      />
      <Stack.Screen
        name="workflows/index"
        options={{
          headerShown: true,
          headerTitle: "Workflows",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="workflows/[id]"
        options={{
          headerShown: true,
          headerTitle: "Workflow Editor",
          headerBackTitle: "Workflows",
        }}
      />
      <Stack.Screen
        name="workflows/runs/[runId]"
        options={{
          headerShown: true,
          headerTitle: "Run Trace",
          headerBackTitle: "Workflows",
        }}
      />
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
