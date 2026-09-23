import React, { useState, useMemo } from "react"
import { StyleSheet, View, ScrollView, RefreshControl } from "react-native"
import { Landmark } from "lucide-react-native"
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
        <Caption style={styles.sectionHeader}>
          ACTIVE CARDS & ACCOUNTS ({accounts.length})
        </Caption>

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
        ) : (
          <View style={styles.accountsList}>
            {accounts.map((acc: Account) => {
              const balanceCents = acc.currentBalance || "0"
              const balanceNum = Number(balanceCents)
              const isDifferentCurrency =
                acc.currency && acc.currency !== baseCurrency

              // Converted preview if account is in foreign currency (e.g. DOP)
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
                    acc.institutionId
                      ? instMap.get(acc.institutionId)
                      : undefined
                  }
                  baseCurrency={baseCurrency}
                  convertedText={convertedStr}
                />
              )
            })}
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
    paddingBottom: 80,
    gap: 14,
  },
  sectionHeader: {
    letterSpacing: 0.8,
    paddingHorizontal: 4,
  },
  accountsList: {
    gap: 14,
  },
})
