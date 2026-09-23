import React, { useState } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native"
import { useRouter } from "expo-router"
import {
  Landmark,
  CreditCard,
  Wallet,
  ArrowRightLeft,
  Coins,
} from "lucide-react-native"
import { formatAmount } from "@saturn/core"
import {
  useListAccountsQuery,
  useGetFinanceSettingsQuery,
  type Account,
  type Account_Type,
} from "@saturn/api/saturn/finance/v1/finance"
import { useCurrencyConversionPreview } from "@saturn/hooks/finance"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { Card } from "@/components/ui/card"
import { MonoAmount, Caption } from "@/components/ui/typography"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { EmptyState } from "@/components/ui/empty-state"
import { haptics } from "@/lib/haptics"

function getAccountIcon(type: Account_Type) {
  switch (type) {
    case "BANK":
      return <Landmark size={20} color={theme.colors.primary} />
    case "CREDIT_CARD":
      return <CreditCard size={20} color={theme.colors.destructive} />
    case "CASH":
      return <Coins size={20} color={theme.colors.success} />
    default:
      return <Wallet size={20} color={theme.colors.accent} />
  }
}

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
          ACTIVE ACCOUNTS ({accounts.length})
        </Caption>

        {isLoading ? (
          <View style={{ gap: 10 }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
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
              const isCredit = acc.type === "CREDIT_CARD"
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
                <Card
                  key={acc.id}
                  style={styles.accountCard}
                  onPress={() => haptics.light()}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.iconWrapper}>
                      {getAccountIcon(acc.type)}
                    </View>
                    <View style={styles.accountInfo}>
                      <Text style={styles.accountName}>{acc.name}</Text>
                      <Text style={styles.accountSub}>
                        {acc.type.replace(/_/g, " ")}
                        {acc.lastFour ? ` •••• ${acc.lastFour}` : ""}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.balanceContainer}>
                    <MonoAmount
                      size="md"
                      color={
                        isCredit && balanceNum > 0
                          ? theme.colors.destructive
                          : theme.colors.textPrimary
                      }
                    >
                      {formatAmount(balanceCents, acc.currency)}
                    </MonoAmount>
                    {convertedStr ? (
                      <Caption style={styles.convertedText}>
                        {convertedStr}
                      </Caption>
                    ) : null}
                  </View>
                </Card>
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
    gap: 10,
  },
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  iconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  accountInfo: {
    flex: 1,
    gap: 2,
  },
  accountName: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  accountSub: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textTransform: "capitalize",
  },
  balanceContainer: {
    alignItems: "flex-end",
    gap: 2,
  },
  convertedText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
})
