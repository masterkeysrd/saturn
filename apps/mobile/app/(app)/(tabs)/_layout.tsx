import { useMemo } from "react"
import { Tabs, useRouter } from "expo-router"
import { View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  Home,
  Calendar as CalendarIcon,
  Mail,
  Wallet,
  Menu,
} from "lucide-react-native"
import { useMailboxes, useI18n } from "@saturn/hooks"
import { useListInboxItemsQuery } from "@saturn/api/saturn/finance/v1/finance"
import { useListThreadsQuery } from "@saturn/api/saturn/platform/ai/v1/ai"
import { AppHeader } from "@/components/app-header"
import { OfflineIndicator } from "@/components/offline-indicator"
import { haptics } from "@/lib/haptics"
import { useSpace } from "@/lib/space-context"
import { formatTabBadgeCount, sumInboxUnreadCount } from "@/lib/tab-badges"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"

export const unstable_settings = {
  anchor: "index",
}

export default function TabsLayout() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { activeSpaceId } = useSpace()
  const { t } = useI18n()
  const tabBarHeight = 56 + (insets.bottom > 0 ? insets.bottom : 8)

  const { data: mailboxesData } = useMailboxes(undefined, {
    enabled: Boolean(activeSpaceId),
  })
  const unreadMailCount = useMemo(
    () => sumInboxUnreadCount(mailboxesData?.mailboxes),
    [mailboxesData?.mailboxes]
  )

  const { data: inboxData } = useListInboxItemsQuery(
    {
      status: "PENDING",
      pageSize: 50,
      pageToken: "",
      sort: "",
      view: "BASIC",
    },
    { enabled: Boolean(activeSpaceId), retry: false }
  )
  const pendingInboxCount = inboxData?.inboxItems?.length ?? 0

  const { data: threadsData } = useListThreadsQuery(
    { isArchived: false, pageSize: 20, pageToken: "" },
    { enabled: Boolean(activeSpaceId) }
  )
  const awaitingApprovalCount = useMemo(
    () =>
      (threadsData?.threads ?? []).filter(
        (t) => t.status === "awaiting_approval"
      ).length,
    [threadsData?.threads]
  )

  const tabBarBadgeStyle = useMemo(
    () => ({
      backgroundColor: colors.primary,
      color: colors.primaryForeground,
      fontSize: 10,
      fontWeight: "700" as const,
      minWidth: 18,
      height: 18,
      lineHeight: 14,
    }),
    [colors.primary, colors.primaryForeground]
  )

  return (
    <View style={styles.container}>
      <Tabs
        backBehavior="initialRoute"
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.tabBarBorder,
            borderTopWidth: 1,
            height: tabBarHeight,
            paddingBottom: insets.bottom > 0 ? insets.bottom : 6,
            paddingTop: 6,
          },
          tabBarActiveTintColor: colors.tabBarActive,
          tabBarInactiveTintColor: colors.tabBarInactive,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "500",
          },
          tabBarBadgeStyle,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t("nav.overview"),
            headerShown: true,
            header: () => <AppHeader />,
            tabBarBadge:
              awaitingApprovalCount > 0
                ? formatTabBadgeCount(awaitingApprovalCount)
                : undefined,
            tabBarIcon: ({ color, size }) => (
              <Home
                size={size ?? 22}
                color={typeof color === "string" ? color : undefined}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: t("nav.calendar"),
            headerShown: false,
            tabBarIcon: ({ color, size }) => (
              <CalendarIcon
                size={size ?? 22}
                color={typeof color === "string" ? color : undefined}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="mail"
          options={{
            title: t("nav.mail"),
            headerShown: false,
            tabBarBadge: formatTabBadgeCount(unreadMailCount),
            tabBarIcon: ({ color, size }) => (
              <Mail
                size={size ?? 22}
                color={typeof color === "string" ? color : undefined}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="finance"
          options={{
            title: t("nav.finance"),
            headerShown: false,
            tabBarBadge: formatTabBadgeCount(pendingInboxCount),
            tabBarIcon: ({ color, size }) => (
              <Wallet
                size={size ?? 22}
                color={typeof color === "string" ? color : undefined}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="menu"
          options={{
            title: t("nav.menu"),
            headerShown: false,
            tabBarIcon: ({ color, size }) => (
              <Menu
                size={size ?? 22}
                color={typeof color === "string" ? color : undefined}
              />
            ),
          }}
          listeners={{
            tabLongPress: () => {
              haptics.medium()
              router.push("/modal/switch-space")
            },
          }}
        />
      </Tabs>
      <OfflineIndicator bottomOffset={tabBarHeight} />
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
})
