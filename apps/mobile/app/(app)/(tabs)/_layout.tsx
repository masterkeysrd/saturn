import { TouchableOpacity, StyleSheet, Text } from "react-native"
import { Tabs, useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  Home,
  ReceiptText,
  PiggyBank,
  Settings,
  Plus,
  Layers,
} from "lucide-react-native"
import { theme } from "@/lib/theme"
import { useAuth } from "@/lib/auth-context"

export default function TabsLayout() {
  const router = useRouter()
  const { activeSpaceId } = useAuth()
  const insets = useSafeAreaInsets()

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.background,
          borderBottomColor: theme.colors.border,
          borderBottomWidth: 1,
          shadowOpacity: 0,
          elevation: 0,
        },
        headerTintColor: theme.colors.textPrimary,
        headerTitleStyle: {
          fontWeight: "600",
          fontSize: 17,
        },
        tabBarStyle: {
          backgroundColor: theme.colors.tabBar,
          borderTopColor: theme.colors.tabBarBorder,
          borderTopWidth: 1,
          height: 56 + (insets.bottom > 0 ? insets.bottom : 8),
          paddingBottom: insets.bottom > 0 ? insets.bottom : 6,
          paddingTop: 6,
        },
        tabBarActiveTintColor: theme.colors.tabBarActive,
        tabBarInactiveTintColor: theme.colors.tabBarInactive,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
        },
        headerLeft: () => (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push("/modal/switch-space")}
          >
            <Layers size={18} color={theme.colors.primary} />
            <Text style={styles.spaceBadge} numberOfLines={1}>
              {activeSpaceId || "Personal"}
            </Text>
          </TouchableOpacity>
        ),
        headerRight: () => (
          <TouchableOpacity
            style={styles.addActionButton}
            onPress={() => router.push("/modal/add-transaction")}
          >
            <Plus size={18} color="#090d16" />
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Overview",
          tabBarIcon: ({ color, size }) => (
            <Home size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: "Transactions",
          tabBarIcon: ({ color, size }) => (
            <ReceiptText size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: "Budgets",
          tabBarIcon: ({ color, size }) => (
            <PiggyBank size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Settings size={size ?? 22} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  headerButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
    marginLeft: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    maxWidth: 160,
  },
  spaceBadge: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "600",
  },
  addActionButton: {
    backgroundColor: theme.colors.primary,
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
})
