import { ActivityIndicator, View, StyleSheet } from "react-native"
import { Redirect, Stack } from "expo-router"
import { useAuth } from "@/lib/auth-context"
import { theme } from "@/lib/theme"

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
      <Stack.Screen
        name="settings/index"
        options={{
          headerShown: true,
          headerTitle: "Settings",
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.textPrimary,
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="settings/space"
        options={{
          headerShown: true,
          headerTitle: "Workspace Settings",
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.textPrimary,
          headerBackTitle: "Settings",
        }}
      />
      <Stack.Screen
        name="finance/transactions/index"
        options={{
          headerShown: true,
          headerTitle: "Transactions",
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.textPrimary,
          headerBackTitle: "Finance",
        }}
      />
      <Stack.Screen
        name="finance/transactions/[id]"
        options={{
          headerShown: true,
          headerTitle: "Transaction Details",
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.textPrimary,
          headerBackTitle: "Transactions",
        }}
      />
      <Stack.Screen
        name="finance/budgets"
        options={{
          headerShown: true,
          headerTitle: "Budgets",
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.textPrimary,
          headerBackTitle: "Finance",
        }}
      />
      <Stack.Screen
        name="finance/budgets/[id]"
        options={{
          headerShown: true,
          headerTitle: "Budget Details",
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.textPrimary,
          headerBackTitle: "Budgets",
        }}
      />
      <Stack.Screen
        name="finance/accounts"
        options={{
          headerShown: true,
          headerTitle: "Accounts",
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.textPrimary,
          headerBackTitle: "Finance",
        }}
      />
      <Stack.Screen
        name="finance/accounts/[id]"
        options={{
          headerShown: true,
          headerTitle: "Account Details",
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.textPrimary,
          headerBackTitle: "Accounts",
        }}
      />
      <Stack.Screen
        name="finance/recurring"
        options={{
          headerShown: true,
          headerTitle: "Recurring & Bills",
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.textPrimary,
          headerBackTitle: "Finance",
        }}
      />
      <Stack.Screen
        name="finance/borrowing"
        options={{
          headerShown: true,
          headerTitle: "Debts & Loans",
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.textPrimary,
          headerBackTitle: "Finance",
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
