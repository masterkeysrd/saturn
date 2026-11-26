import { useState, useMemo } from "react"
import {
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Platform,
} from "react-native"
import { useRouter, Stack } from "expo-router"
import { Landmark, Plus, ArrowRightLeft } from "lucide-react-native"
import {
  useListAccountsQuery,
  useListInstitutionsQuery,
  useGetSettingsQuery,
  type Account,
  type Account_InstitutionInfo,
} from "@saturn/api/saturn/finance/v1/finance"
import { useCurrencyConversionPreview } from "@saturn/hooks/finance"
import { useI18n, useTimezone } from "@saturn/hooks"
import type { TranslationKey } from "@saturn/i18n"
import { useSpace } from "../../../lib/space-context"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../../../lib/theme"
import { Caption } from "../../../components/ui/typography"
import { SkeletonCard } from "../../../components/ui/skeleton-loader"
import { EmptyState } from "../../../components/ui/empty-state"
import { CardAccountItem } from "../../../components/finance/card-account-item"
import { haptics } from "../../../lib/haptics"

export default function AccountsScreen() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const { t } = useI18n()
  const tz = useTimezone()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [refreshing, setRefreshing] = useState(false)

  const { data: settingsData } = useGetSettingsQuery(
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
  const institutions = useMemo(
    () => instData?.institutions || [],
    [instData?.institutions]
  )
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

  const accounts = useMemo(
    () => accountsData?.accounts || [],
    [accountsData?.accounts]
  )

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
    const groupTitle = (key: TranslationKey, count: number) =>
      t(key, { count }).toUpperCase()
    if (bank.length > 0)
      groups.push({
        title: groupTitle(
          "finance.accounts.mobile.groupDepository",
          bank.length
        ),
        data: bank,
      })
    if (credit.length > 0)
      groups.push({
        title: groupTitle(
          "finance.accounts.mobile.groupCreditCards",
          credit.length
        ),
        data: credit,
      })
    if (cash.length > 0)
      groups.push({
        title: groupTitle(
          "finance.accounts.mobile.groupCashWallets",
          cash.length
        ),
        data: cash,
      })
    if (other.length > 0)
      groups.push({
        title: groupTitle("finance.accounts.mobile.groupOther", other.length),
        data: other,
      })

    return groups
  }, [accounts, t])

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
        String(balanceNum / 100),
        acc.currency
      )
      if (preview && "amount" in preview) {
        convertedStr = `≈ ${tz.formatMoney(
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
          headerTitle: t("nav.accounts"),
          ...(Platform.OS === "ios"
            ? {
                unstable_headerRightItems: () => [
                  {
                    type: "button",
                    label: t("finance.reconcile.row.transfer"),
                    icon: { type: "sfSymbol", name: "arrow.left.arrow.right" },
                    tintColor: colors.primary,
                    onPress: () => {
                      haptics.light()
                      router.push({
                        pathname: "/modal/add-transaction",
                        params: { type: "TRANSFER" },
                      })
                    },
                  },
                  {
                    type: "button",
                    label: t("dashboard.quickAction.newAccount"),
                    icon: { type: "sfSymbol", name: "plus" },
                    tintColor: colors.primary,
                    onPress: () => {
                      haptics.light()
                      router.push("/modal/manage-account")
                    },
                  },
                ],
              }
            : {
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
                      <ArrowRightLeft size={18} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        haptics.light()
                        router.push("/modal/manage-account")
                      }}
                      style={styles.headerIconBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Plus size={20} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                ),
              }),
        }}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surfaceElevated}
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
            icon={<Landmark size={28} color={colors.textMuted} />}
            title={t("finance.accounts.mobile.emptyTitle")}
            description={t("finance.accounts.mobile.emptyDesc")}
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

const createStyles = (t: SaturnMobileTheme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  headerRightActions: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  headerIconBtn: {
    padding: 4,
  },
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
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
