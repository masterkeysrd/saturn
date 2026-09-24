import { useState } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native"
import { useRouter, Stack } from "expo-router"
import { CalendarClock, Plus } from "lucide-react-native"
import {
  useListRecurringTransactionsQuery,
  useListScheduledTransactionsQuery,
  type RecurringTransaction,
  type ScheduledTransaction,
  type ListScheduledTransactionsRequest,
} from "@saturn/api/saturn/finance/v1/finance"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { haptics } from "@/lib/haptics"

export default function RecurringScreen() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const [refreshing, setRefreshing] = useState(false)

  const {
    data: recurringData,
    isLoading: isRecurringLoading,
    refetch: refetchRecurring,
  } = useListRecurringTransactionsQuery(
    { pageSize: 100, pageToken: "", status: "ACTIVE" },
    { enabled: !!activeSpaceId }
  )

  const {
    data: scheduledData,
    isLoading: isScheduledLoading,
    refetch: refetchScheduled,
  } = useListScheduledTransactionsQuery(
    {
      pageSize: 100,
      pageToken: "",
      status: "PENDING",
      startDate: "",
      endDate: "",
    } as unknown as ListScheduledTransactionsRequest,
    { enabled: !!activeSpaceId }
  )

  const recurring = recurringData?.recurringTransactions || []
  const scheduled = scheduledData?.scheduledTransactions || []

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await Promise.all([refetchRecurring(), refetchScheduled()])
    } finally {
      setRefreshing(false)
    }
  }

  const isLoading = isRecurringLoading || isScheduledLoading

  return (
    <View style={styles.safeArea}>
      <Stack.Screen
        options={{
          headerTitle: "Recurring & Bills",
          headerRight: () => (
            <TouchableOpacity
              onPress={() => {
                haptics.light()
                router.push({
                  pathname: "/modal/add-transaction",
                  params: { type: "SCHEDULED" },
                })
              }}
              style={styles.headerAddBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Plus size={20} color={theme.colors.primary} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
            progressBackgroundColor={theme.colors.surfaceElevated}
          />
        }
      >
        {isLoading ? (
          <View style={{ gap: 12 }}>
            <SkeletonCard height={90} />
            <SkeletonCard height={90} />
          </View>
        ) : recurring.length === 0 && scheduled.length === 0 ? (
          <EmptyState
            icon={<CalendarClock size={28} color={theme.colors.textMuted} />}
            title="No recurring subscriptions"
            description="Active recurring commitments and scheduled bills will appear here."
          />
        ) : (
          <View style={{ gap: 12 }}>
            {/* Will be fleshed out in Part 2 */}
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
              {recurring.length} recurring template(s), {scheduled.length}{" "}
              pending scheduled transaction(s).
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  headerAddBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
})
