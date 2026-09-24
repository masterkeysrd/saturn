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
import { HandCoins, Plus } from "lucide-react-native"
import {
  useListBorrowingsQuery,
  type Borrowing,
} from "@saturn/api/saturn/finance/v1/finance"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { haptics } from "@/lib/haptics"

export default function BorrowingScreen() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const [refreshing, setRefreshing] = useState(false)

  const {
    data: borrowingsData,
    isLoading,
    refetch,
  } = useListBorrowingsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )

  const borrowings = borrowingsData?.borrowings || []

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <View style={styles.safeArea}>
      <Stack.Screen
        options={{
          headerTitle: "Debts & Loans",
          headerRight: () => (
            <TouchableOpacity
              onPress={() => {
                haptics.light()
                router.push({
                  pathname: "/modal/add-transaction",
                  params: { type: "BORROWING" },
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
        ) : borrowings.length === 0 ? (
          <EmptyState
            icon={<HandCoins size={28} color={theme.colors.textMuted} />}
            title="No debts or loans"
            description="Active debt positions and money lent to others will appear here."
          />
        ) : (
          <View style={{ gap: 12 }}>
            {/* Will be fleshed out in Part 3 */}
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
              {borrowings.length} active borrowing record(s).
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
