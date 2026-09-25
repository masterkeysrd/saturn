import { Tabs } from "expo-router"
import { View, StyleSheet } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Home, Wallet } from "lucide-react-native"
import { AppHeader } from "@/components/app-header"
import { OfflineIndicator } from "@/components/offline-indicator"
import { theme } from "@/lib/theme"

export default function TabsLayout() {
  const insets = useSafeAreaInsets()
  const tabBarHeight = 56 + (insets.bottom > 0 ? insets.bottom : 8)

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          headerShown: true,
          header: () => <AppHeader />,
          tabBarStyle: {
            backgroundColor: theme.colors.tabBar,
            borderTopColor: theme.colors.tabBarBorder,
            borderTopWidth: 1,
            height: tabBarHeight,
            paddingBottom: insets.bottom > 0 ? insets.bottom : 6,
            paddingTop: 6,
          },
          tabBarActiveTintColor: theme.colors.tabBarActive,
          tabBarInactiveTintColor: theme.colors.tabBarInactive,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "500",
          },
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
          name="finance"
          options={{
            title: "Finance",
            tabBarIcon: ({ color, size }) => (
              <Wallet size={size ?? 22} color={color} />
            ),
          }}
        />
      </Tabs>
      <OfflineIndicator bottomOffset={tabBarHeight} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
})
