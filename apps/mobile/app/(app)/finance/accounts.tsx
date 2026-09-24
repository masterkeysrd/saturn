import { useState, useMemo } from "react"
import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native"
import { useRouter, Stack } from "expo-router"
import { Landmark, Plus, ArrowRightLeft } from "lucide-react-native"
import { formatAmount } from "@saturn/core"
import {
  useListAccountsQuery,
  useListInstitutionsQuery,
  useGetFinanceSettingsQuery,
  type Account,
  type Account_InstitutionInfo,
} from "@saturn/api/saturn/finance/v1/finance"
import { useCurrencyConversionPreview } from "@saturn/hooks/finance"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { Caption } from "@/components/ui/typography"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { EmptyState } from "@/components/ui/empty-state"
import { CardAccountItem } from "@/components/finance/card-account-item"
import { haptics } from "@/lib/haptics"

export default function AccountsScreen() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const [refreshing, setRefreshing] = useState(false)

  const { data: settingsData } = useGetFinanceSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  const {
    data: accountsData,
    isLoading,
    refetch,
  } = useListAccountsQuery({ activeOnly: true }, { enabled: !!activeSpaceId })

  const { data: instData } = useListInstitutionsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )
  const institutions = instData?.institutions || []
  const instMap = useMemo(() => {
    const map = new Map<string, Account_InstitutionInfo>()
    institutions.forEach((inst) => {
      if (inst.id) map.set(inst.id, inst as Account_InstitutionInfo)
    })
    return map
  }, [institutions])

  const { getConversionPreview } = useCurrencyConversionPreview({
    spaceId: activeSpaceId || undefined,
    enabled: !!activeSpaceId,
    baseCurrency,
  })

  const accounts = accountsData?.accounts || []

  // Group accounts by classification
  const groupedAccounts = useMemo(() => {
    const bank = accounts.filter((a) => a.type === "BANK")
    const credit = accounts.filter((a) => a.type === "CREDIT_CARD")
    const cash = accounts.filter(
      (a) => a.type === "CASH" || a.type === "DIGITAL_ACCOUNT"
    )
    const other = accounts.filter(
      (a) =>
        a.type !== "BANK" &&
        a.type !== "CREDIT_CARD" &&
        a.type !== "CASH" &&
        a.type !== "DIGITAL_ACCOUNT"
    )

    const groups: { title: string; data: Account[] }[] = []
    if (bank.length > 0)
      groups.push({ title: `DEPOSITORY & BANK (${bank.length})`, data: bank })
    if (credit.length > 0)
      groups.push({ title: `CREDIT CARDS (${credit.length})`, data: credit })
    if (cash.length > 0)
      groups.push({ title: `CASH & WALLETS (${cash.length})`, data: cash })
    if (other.length > 0)
      groups.push({ title: `OTHER ACCOUNTS (${other.length})`, data: other })

    return groups
  }, [accounts])

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const renderAccountCard = (acc: Account) => {
    const balanceCents = acc.currentBalance || "0"
    const balanceNum = Number(balanceCents)
    const isDifferentCurrency = acc.currency && acc.currency !== baseCurrency

    let convertedStr = ""
    if (isDifferentCurrency) {
      const preview = getConversionPreview(
        String(Math.abs(balanceNum) / 100),
        acc.currency
      )
      if (preview && "amount" in preview) {
        convertedStr = `≈ ${formatAmount(
          Math.round(preview.amount * 100),
          baseCurrency
        )}`
      }
    }

    return (
      <CardAccountItem
        key={acc.id}
        acc={acc}
        institution={
          acc.institutionId ? instMap.get(acc.institutionId) : undefined
        }
        baseCurrency={baseCurrency}
        convertedText={convertedStr}
        onPress={() => {
          haptics.light()
          router.push({
            pathname: "/(app)/finance/accounts/[id]",
            params: { id: acc.id },
          })
        }}
      />
    )
  }

  return (
    <View style={styles.safeArea}>
      <Stack.Screen
        options={{
          headerTitle: "Accounts",
          headerRight: () => (
            <View style={styles.headerRightActions}>
              <TouchableOpacity
                onPress={() => {
                  haptics.light()
                  router.push({
                    pathname: "/modal/add-transaction",
                    params: { type: "TRANSFER" },
                  })
                }}
                style={styles.headerIconBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <ArrowRightLeft size={18} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  haptics.light()
                  router.push("/modal/manage-account")
                }}
                style={styles.headerIconBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Plus size={20} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
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
          <View style={{ gap: 14 }}>
            <SkeletonCard height={190} />
            <SkeletonCard height={190} />
          </View>
        ) : accounts.length === 0 ? (
          <EmptyState
            icon={<Landmark size={28} color={theme.colors.textMuted} />}
            title="No accounts registered"
            description="Active accounts in this workspace will appear here."
          />
        ) : groupedAccounts.length > 0 ? (
          groupedAccounts.map((grp) => (
            <View key={grp.title} style={styles.groupContainer}>
              <Caption style={styles.sectionHeader}>{grp.title}</Caption>
              <View style={styles.accountsList}>
                {grp.data.map(renderAccountCard)}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.accountsList}>
            {accounts.map(renderAccountCard)}
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
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIconBtn: {
    padding: 4,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 80,
    gap: 20,
  },
  groupContainer: {
    gap: 10,
  },
  sectionHeader: {
    letterSpacing: 0.8,
    paddingHorizontal: 4,
  },
  accountsList: {
    gap: 14,
  },
})
