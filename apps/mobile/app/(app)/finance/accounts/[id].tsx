import {
  useMobileCopilotView,
  useOptionalMobileCopilotSheet,
} from "../../../../lib/copilot-sheet-context"
import { DetailChart } from "../../../../components/finance/detail-chart"
import { useState, useMemo, useRef } from "react"
import {
  Text,
  View,
  SectionList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from "react-native"
import type BottomSheet from "@gorhom/bottom-sheet"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useRouter, useLocalSearchParams, Stack } from "expo-router"
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  ArrowRightLeft,
  Scale,
  Plus,
  Search,
  X,
  ReceiptText,
  AlertCircle,
  Calendar,
  MoreVertical,
  SlidersHorizontal,
} from "lucide-react-native"
import { Icon } from "@expo/ui"
import { ActionMenu } from "../../../../components/ui/action-menu"
import {
  useGetAccountQuery,
  useListStatementsQuery,
  useListBudgetsQuery,
  useListInstitutionsQuery,
  useGetSettingsQuery,
  type Budget,
  type Account_InstitutionInfo,
} from "@saturn/api/saturn/finance/v1/finance"
import {
  buildCopilotEntityKey,
  accountLedgerTypes,
  accountLedgerFilters,
  resolveFinancePeriodBounds,
  parseYm,
  formatYm,
  shiftYearMonth,
  type AccountLedgerFilter,
  type FinancePeriodPreset,
  type FinancePeriodValue,
} from "@saturn/core"
import {
  useDateSections,
  useDebounce,
  useI18n,
  useTimezone,
} from "@saturn/hooks"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import {
  useCurrencyConversionPreview,
  useDetailLedger,
  useAccountAnalytics,
} from "@saturn/hooks/finance"
import { useSpace } from "../../../../lib/space-context"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../../../../lib/theme"
import { haptics } from "../../../../lib/haptics"
import { AIHeaderButton } from "../../../../components/app-header"
import { Card } from "../../../../components/ui/card"
import { Badge } from "../../../../components/ui/badge"
import { MonoAmount } from "../../../../components/ui/typography"
import { EmptyState } from "../../../../components/ui/empty-state"
import { SkeletonCard } from "../../../../components/ui/skeleton-loader"
import {
  AppBottomSheet,
  BottomSheetHeader,
} from "../../../../components/ui/bottom-sheet"
import { TransactionListItem } from "../../../../components/finance/transaction-list-item"
import { DateSectionHeader } from "../../../../components/finance/date-section-header"
import { CardAccountItem } from "../../../../components/finance/card-account-item"

const editIcon = Icon.select({
  ios: "pencil",
  android: require("@expo/material-symbols/edit.xml"),
})

const statementsIcon = Icon.select({
  ios: "doc.text",
  android: require("@expo/material-symbols/description.xml"),
})

type AccountDetailTab = "transactions" | "analytics"

const DEFAULT_PERIOD_VALUE: FinancePeriodValue = {
  period: "all",
  month: "",
  dateFrom: "",
  dateTo: "",
}

const PERIOD_PRESETS = [
  { value: "all", labelKey: "finance.transactions.list.presetAllTime" },
  {
    value: "this_month",
    labelKey: "finance.transactions.list.presetThisMonth",
  },
  {
    value: "last_month",
    labelKey: "finance.transactions.list.presetLastMonth",
  },
  { value: "3m", labelKey: "finance.transactions.list.presetLast3M" },
  { value: "6m", labelKey: "finance.transactions.list.presetLast6M" },
  { value: "ytd", labelKey: "finance.transactions.list.presetYtd" },
  { value: "12m", labelKey: "finance.transactions.list.presetLast12M" },
] as const satisfies readonly {
  value: FinancePeriodPreset
  labelKey:
    | "finance.transactions.list.presetAllTime"
    | "finance.transactions.list.presetThisMonth"
    | "finance.transactions.list.presetLastMonth"
    | "finance.transactions.list.presetLast3M"
    | "finance.transactions.list.presetLast6M"
    | "finance.transactions.list.presetYtd"
    | "finance.transactions.list.presetLast12M"
}[]

export default function AccountDetailScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { activeSpaceId } = useSpace()
  const { t, language } = useI18n()
  const { colors, resolvedMode } = useTheme()
  const styles = useThemedStyles(createStyles)
  const copilotSheet = useOptionalMobileCopilotSheet()
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<AccountDetailTab>("transactions")

  // Fetch settings & base currency
  const { data: settingsData } = useGetSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  // Fetch account details
  const {
    data: account,
    isLoading: isAccountLoading,
    refetch: refetchAccount,
  } = useGetAccountQuery({ id: id || "" }, { enabled: !!id && !!activeSpaceId })

  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 300)
  const [filter, setFilter] = useState<AccountLedgerFilter>("all")
  const [periodValue, setPeriodValue] =
    useState<FinancePeriodValue>(DEFAULT_PERIOD_VALUE)
  const [notesExpanded, setNotesExpanded] = useState(false)
  const [statementsOpen, setStatementsOpen] = useState(false)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const statementsSheetRef = useRef<BottomSheet>(null)
  const filterSheetRef = useRef<BottomSheet>(null)

  const tz = useTimezone()
  const now = tz.now()
  const nowParts = tz.parts(now)
  const nowYear = nowParts?.year ?? now.getUTCFullYear()
  const nowMonth = nowParts?.month ?? now.getUTCMonth() + 1

  const periodBounds = useMemo(
    () => resolveFinancePeriodBounds(periodValue, now, tz.timezone, tz.locale),
    [periodValue, now, tz.timezone, tz.locale]
  )

  const activePreset = PERIOD_PRESETS.find(
    (p) => p.value === periodBounds.period
  )
  const periodLabel =
    periodBounds.period === "month" ||
    periodBounds.period === "this_month" ||
    periodBounds.period === "last_month"
      ? periodBounds.label
      : activePreset
        ? t(activePreset.labelKey)
        : periodBounds.label

  const handleStepMonth = (delta: -1 | 1) => {
    haptics.selection()
    const active = parseYm(periodBounds.activeMonth)
    const baseYear = active ? active.year : nowYear
    const baseMonth = active ? active.month : nowMonth
    const next = shiftYearMonth(baseYear, baseMonth, delta)
    setPeriodValue({
      period: "month",
      month: formatYm(next.year, next.month),
      dateFrom: "",
      dateTo: "",
    })
  }

  const openStatementsSheet = () => {
    haptics.light()
    setStatementsOpen(true)
    statementsSheetRef.current?.snapToIndex(0)
  }

  const closeStatementsSheet = () => {
    statementsSheetRef.current?.close()
  }

  const openFilterSheet = () => {
    haptics.light()
    setFilterSheetOpen(true)
    filterSheetRef.current?.snapToIndex(0)
  }

  const closeFilterSheet = () => {
    filterSheetRef.current?.close()
  }

  const chart = useAccountAnalytics(activeSpaceId || undefined, account)
  const ledger = useDetailLedger(
    activeSpaceId || undefined,
    {
      accountId: id,
      searchQuery: debouncedSearch,
      types: [...accountLedgerTypes[filter]],
      startDate: periodBounds.startISO || undefined,
      endDate: periodBounds.endISO || undefined,
    },
    !!id
  )
  const { isLoading: isTxnsLoading, refetch: refetchTxns } = ledger
  useMobileCopilotView(
    account?.id
      ? {
          viewId: "mobile.finance.account.detail",
          title: account.name,
          activeEntity: {
            kind: "account",
            id: account.id,
            key: buildCopilotEntityKey("account", account.id),
            label: account.name,
          },
          suggestions: [t("ai.copilotSheet.suggestAccount")],
        }
      : null
  )
  const statements = useListStatementsQuery(
    { accountId: id, pageSize: 100, pageToken: "" },
    { enabled: statementsOpen && !!id && !!activeSpaceId }
  )
  // Fetch budgets to map budget categories on transactions
  const { data: budgetsData } = useListBudgetsQuery(
    { pageSize: 100, pageToken: "", view: "FULL" },
    { enabled: !!activeSpaceId }
  )
  const budgets = useMemo(
    () => budgetsData?.budgets || [],
    [budgetsData?.budgets]
  )
  const budgetsMap = useMemo(() => {
    const map = new Map<string, Budget>()
    budgets.forEach((b) => {
      if (b.id) map.set(b.id, b)
    })
    return map
  }, [budgets])

  // Fetch institutions
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
    institutions.forEach((i) => {
      if (i.id) map.set(i.id, i as Account_InstitutionInfo)
    })
    return map
  }, [institutions])

  const { getConversionPreview } = useCurrencyConversionPreview({
    spaceId: activeSpaceId || undefined,
    enabled: !!activeSpaceId,
    baseCurrency,
  })

  const transactions = useMemo(
    () => ledger.data?.pages.flatMap((p) => p.transactions || []) || [],
    [ledger.data]
  )

  const sections = useDateSections(transactions)

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await Promise.all([
        refetchAccount(),
        refetchTxns(),
        chart.query.refetch(),
      ])
    } finally {
      setRefreshing(false)
    }
  }

  if (isAccountLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!account) {
    return (
      <View style={styles.errorContainer}>
        <AlertCircle size={36} color={colors.destructive} />
        <Text style={styles.errorTitle}>
          {t("finance.accounts.mobile.notFoundTitle")}
        </Text>
        <Text style={styles.errorSubtitle}>
          {t("finance.accounts.mobile.notFoundSubtitle")}
        </Text>
        <TouchableOpacity
          style={styles.backToAccountsBtn}
          onPress={() => router.replace("/(app)/finance/accounts")}
          activeOpacity={0.7}
        >
          <Text style={styles.backToAccountsText}>
            {t("finance.accounts.mobile.backToAccounts")}
          </Text>
        </TouchableOpacity>
      </View>
    )
  }

  const institution = account.institutionId
    ? instMap.get(account.institutionId)
    : undefined

  // Converted preview if account is in foreign currency
  let convertedStr = ""
  if (account.currency && account.currency !== baseCurrency) {
    const balanceNum = Number(account.currentBalance || "0")
    const preview = getConversionPreview(
      String(balanceNum / 100),
      account.currency
    )
    if (preview && "amount" in preview) {
      convertedStr = `≈ ${tz.formatMoney(
        Math.round(preview.amount * 100),
        baseCurrency
      )}`
    }
  }

  function segments<T extends string>(
    values: readonly T[],
    active: T,
    onChange: (v: T) => void,
    label: (v: T) => string
  ) {
    return (
      <View style={styles.track}>
        {values.map((v) => (
          <TouchableOpacity
            key={v}
            accessibilityRole="button"
            accessibilityState={{ selected: v === active }}
            style={[styles.pill, v === active && styles.selected]}
            onPress={() => {
              haptics.selection()
              onChange(v)
            }}
          >
            <Text style={[styles.caption, v === active && styles.activeText]}>
              {label(v)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    )
  }
  const netAmount = chart.net ?? 0
  const netColor =
    netAmount > 0
      ? colors.success
      : netAmount < 0
        ? colors.destructive
        : colors.textPrimary
  const txCountBadge = `${transactions.length}${ledger.hasNextPage ? "+" : ""}`
  const activeFilterCount =
    (filter !== "all" ? 1 : 0) + (periodValue.period !== "all" ? 1 : 0)
  const hasActiveFilters = debouncedSearch.length > 0 || activeFilterCount > 0

  const handleResetFilters = () => {
    haptics.selection()
    setSearch("")
    setFilter("all")
    setPeriodValue(DEFAULT_PERIOD_VALUE)
  }

  const renderHeader = () => (
    <View style={styles.headerSection}>
      {/* Account Card Presentation */}
      <View style={styles.cardWrapper}>
        <CardAccountItem
          acc={account}
          institution={institution}
          baseCurrency={baseCurrency}
          convertedText={convertedStr}
          hideHolderName
        />
      </View>

      {account.notes ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ expanded: notesExpanded }}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
          style={styles.inlineNoteRow}
          onPress={() => {
            haptics.selection()
            setNotesExpanded((prev) => !prev)
          }}
        >
          <View style={styles.inlineNoteIcon}>
            <FileText size={13} color={colors.textMuted} />
          </View>
          <Text
            style={styles.inlineNoteText}
            numberOfLines={notesExpanded ? undefined : 1}
          >
            {account.notes}
          </Text>
        </TouchableOpacity>
      ) : null}

      {account.isActive === false ? (
        <View style={styles.archivedNotice}>
          <View style={styles.archivedNoticeLeft}>
            <AlertCircle size={14} color={colors.textMuted} />
            <Text style={styles.archivedNoticeText}>
              {t("finance.detail.inactive")}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.7}
            style={styles.archivedEditBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => {
              haptics.light()
              router.push({
                pathname: "/modal/manage-account",
                params: { id: account.id },
              })
            }}
          >
            <Text style={styles.archivedEditText}>{t("common.edit")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.actionGrid}>
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.8}
            onPress={() => {
              haptics.light()
              router.push({
                pathname: "/modal/add-transaction",
                params: {
                  accountId: account.id,
                },
              })
            }}
            style={styles.actionBtnPrimary}
          >
            <Plus size={16} color={colors.primaryForeground} />
            <Text style={styles.actionBtnPrimaryText} numberOfLines={1}>
              {t("finance.accounts.mobile.addTx")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.7}
            onPress={() => {
              haptics.light()
              router.push({
                pathname: "/modal/add-transaction",
                params: {
                  type: "TRANSFER",
                  accountId: account.id,
                },
              })
            }}
            style={styles.actionBtnSecondary}
          >
            <ArrowRightLeft size={15} color={colors.info} />
            <Text style={styles.actionBtnSecondaryText} numberOfLines={1}>
              {t("finance.reconcile.row.transfer")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.7}
            onPress={() => {
              haptics.light()
              router.push({
                pathname: "/modal/adjust-balance",
                params: { accountId: account.id },
              })
            }}
            style={styles.actionBtnSecondary}
          >
            <Scale size={15} color={colors.success} />
            <Text style={styles.actionBtnSecondaryText} numberOfLines={1}>
              {t("finance.accounts.mobile.adjust")}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.underlineTabBar} accessibilityRole="tablist">
        {(
          [
            ["transactions", t("nav.transactions")],
            ["analytics", t("finance.detail.analytics")],
          ] as const
        ).map(([tabKey, tabLabel]) => {
          const isSelected = activeTab === tabKey
          return (
            <TouchableOpacity
              key={tabKey}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              activeOpacity={0.75}
              style={[
                styles.underlineTab,
                isSelected && styles.underlineTabSelected,
              ]}
              onPress={() => {
                haptics.selection()
                setActiveTab(tabKey)
              }}
            >
              <Text
                style={[styles.tabLabel, isSelected && styles.tabLabelSelected]}
                numberOfLines={1}
              >
                {tabLabel}
              </Text>
              {tabKey === "transactions" && !isTxnsLoading && (
                <View
                  style={[
                    styles.tabCountBadge,
                    isSelected && styles.tabCountBadgeSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabCountText,
                      isSelected && styles.tabCountTextSelected,
                    ]}
                  >
                    {txCountBadge}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )
        })}
      </View>

      {activeTab === "transactions" ? (
        <>
          <View style={styles.searchFilterRow}>
            <View style={styles.searchBar}>
              <Search size={16} color={colors.textMuted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                accessibilityLabel={t("finance.detail.search")}
                placeholder={t("finance.detail.search")}
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
              />
              {search.length > 0 && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t("finance.transactions.clearSearchAria")}
                  onPress={() => {
                    haptics.selection()
                    setSearch("")
                  }}
                  style={styles.clearSearchBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={15} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("finance.transactions.filterAria")}
              activeOpacity={0.75}
              style={[
                styles.filterTriggerBtn,
                activeFilterCount > 0 && styles.filterTriggerBtnActive,
              ]}
              onPress={openFilterSheet}
            >
              <SlidersHorizontal
                size={17}
                color={
                  activeFilterCount > 0 ? colors.primary : colors.textSecondary
                }
              />
              {activeFilterCount > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>
                    {activeFilterCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {activeFilterCount > 0 ? (
            <View style={styles.activeChipsRow}>
              {filter !== "all" ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    "finance.transactions.removeTypeFilter"
                  )}
                  activeOpacity={0.7}
                  style={styles.activeFilterChip}
                  onPress={() => {
                    haptics.selection()
                    setFilter("all")
                  }}
                >
                  <Text style={styles.activeFilterChipText}>
                    {t(`finance.detail.${filter}`)}
                  </Text>
                  <X size={12} color={colors.primary} />
                </TouchableOpacity>
              ) : null}

              {periodValue.period !== "all" ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    "finance.transactions.removePeriodFilter"
                  )}
                  activeOpacity={0.7}
                  style={styles.activeFilterChip}
                  onPress={() => {
                    haptics.selection()
                    setPeriodValue(DEFAULT_PERIOD_VALUE)
                  }}
                >
                  <Text style={styles.activeFilterChipText}>{periodLabel}</Text>
                  <X size={12} color={colors.primary} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </>
      ) : (
        <>
          {chart.query.isSuccess && (
            <Card style={styles.kpiCard}>
              <View style={styles.kpiTopRow}>
                <Text style={styles.kpiLabel}>{t("finance.detail.net")}</Text>
                <MonoAmount size="lg" color={netColor}>
                  {tz.formatMoney(netAmount, account.currency, {
                    showSign: true,
                  })}
                </MonoAmount>
              </View>
              <View style={styles.kpiBottomRow}>
                <View style={styles.kpiCol}>
                  <Text style={styles.kpiLabel}>
                    {t("finance.insights.inflows")}
                  </Text>
                  <MonoAmount size="md" color={colors.success}>
                    {tz.formatMoney(chart.periodInflow ?? 0, account.currency, {
                      showSign: true,
                    })}
                  </MonoAmount>
                </View>
                <View style={styles.kpiColDivider} />
                <View style={styles.kpiCol}>
                  <Text style={styles.kpiLabel}>
                    {t("finance.insights.outflows")}
                  </Text>
                  <MonoAmount size="md" color={colors.destructive}>
                    {tz.formatMoney(
                      chart.periodOutflow ?? 0,
                      account.currency,
                      {
                        showSign: true,
                      }
                    )}
                  </MonoAmount>
                </View>
              </View>
            </Card>
          )}

          {segments(
            ["balance", "flow"] as const,
            chart.mode,
            chart.setMode,
            (v) => t(`finance.detail.${v}`)
          )}

          {chart.query.isLoading ? (
            <SkeletonCard height={220} />
          ) : chart.query.isError ? (
            <Card style={styles.chartErrorCard}>
              <AlertCircle size={16} color={colors.destructive} />
              <Text style={styles.chartErrorText}>
                {t("finance.detail.error")}
              </Text>
            </Card>
          ) : chart.query.isSuccess ? (
            <DetailChart
              valueLabel={t(
                chart.mode === "flow"
                  ? "finance.insights.inflows"
                  : "finance.accounts.adjust.currentBalance"
              )}
              comparisonLabel={t("finance.insights.outflows")}
              ceilingLabel={t("finance.budgets.thLimit")}
              points={chart.points}
              title={t(`finance.detail.${chart.mode}`)}
              currency={account.currency}
              bars={chart.mode === "flow"}
              footer={
                <View style={styles.chartFooterControls}>
                  {segments(
                    ["30D", "90D", "YTD", "1Y"] as const,
                    chart.period,
                    chart.setPeriod,
                    (v) =>
                      getLocalizedEnumLabel(
                        "finance",
                        "chartPeriod",
                        v,
                        language
                      )
                  )}
                  {chart.mode === "flow" &&
                    segments(
                      ["week", "month"] as const,
                      chart.interval,
                      chart.setInterval,
                      (v) => t(`finance.detail.${v}`)
                    )}
                </View>
              }
            />
          ) : null}
        </>
      )}
    </View>
  )

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: account.name,
          ...(Platform.OS === "ios"
            ? {
                unstable_headerRightItems: () => [
                  {
                    type: "menu",
                    label: t("finance.budgets.mobile.menuActions"),
                    icon: { type: "sfSymbol", name: "ellipsis" },
                    menu: {
                      title: account.name,
                      items: [
                        {
                          type: "action",
                          label: t("common.edit"),
                          icon: { type: "sfSymbol", name: "pencil" } as const,
                          onPress: () => {
                            haptics.light()
                            router.push({
                              pathname: "/modal/manage-account",
                              params: { id: account.id },
                            })
                          },
                        },
                        {
                          type: "action",
                          label: t("finance.detail.statement"),
                          icon: { type: "sfSymbol", name: "doc.text" } as const,
                          onPress: openStatementsSheet,
                        },
                      ],
                    },
                  },
                  {
                    type: "button",
                    label: t("menu.aiAssistant"),
                    icon: { type: "sfSymbol", name: "sparkles" },
                    tintColor: colors.primary,
                    sharesBackground: false,
                    onPress: () => {
                      haptics.light()
                      copilotSheet?.openCopilotSheet()
                    },
                  },
                ],
              }
            : {
                headerRight: () => (
                  <View style={styles.headerRightRow}>
                    <AIHeaderButton testID="account-detail-header-ai" />
                    <ActionMenu
                      title={account.name}
                      colorScheme={resolvedMode}
                      onPressAction={({ nativeEvent }) => {
                        if (nativeEvent.event === "edit") {
                          haptics.light()
                          router.push({
                            pathname: "/modal/manage-account",
                            params: { id: account.id },
                          })
                        } else if (nativeEvent.event === "statements") {
                          openStatementsSheet()
                        }
                      }}
                      actions={[
                        {
                          id: "edit",
                          title: t("common.edit"),
                          image: editIcon,
                        },
                        {
                          id: "statements",
                          title: t("finance.detail.statement"),
                          image: statementsIcon,
                        },
                      ]}
                    >
                      <View style={styles.headerDotsBtn}>
                        <MoreVertical size={20} color={colors.textPrimary} />
                      </View>
                    </ActionMenu>
                  </View>
                ),
              }),
        }}
      />

      <View style={styles.container}>
        <SectionList
          keyboardShouldPersistTaps="handled"
          onEndReached={() => {
            if (
              activeTab === "transactions" &&
              ledger.hasNextPage &&
              !ledger.isFetchingNextPage
            )
              void ledger.fetchNextPage()
          }}
          sections={activeTab === "transactions" ? sections : []}
          keyExtractor={(item) => item.id || ""}
          ListHeaderComponent={renderHeader()}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
              progressBackgroundColor={colors.surfaceElevated}
            />
          }
          renderSectionHeader={({ section: { title } }) => (
            <DateSectionHeader title={title} />
          )}
          renderItem={({ item }) => (
            <TransactionListItem
              item={item}
              account={account}
              budget={item.budgetId ? budgetsMap.get(item.budgetId) : undefined}
              baseCurrency={baseCurrency}
              showDate={false}
              showAccount={false}
              onPress={() => {
                haptics.light()
                router.push({
                  pathname: "/(app)/finance/transactions/[id]",
                  params: { id: item.id },
                })
              }}
            />
          )}
          ListEmptyComponent={
            activeTab === "analytics" ? undefined : isTxnsLoading ? (
              <View style={{ gap: 10, paddingHorizontal: 16 }}>
                <SkeletonCard />
                <SkeletonCard />
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
                <EmptyState
                  icon={<ReceiptText size={28} color={colors.textMuted} />}
                  title={t("finance.transactions.list.emptyTitle")}
                  description={t(
                    hasActiveFilters
                      ? "finance.transactions.list.emptyFiltered"
                      : "finance.accounts.mobile.ledgerEmptyDesc"
                  )}
                  actionLabel={
                    hasActiveFilters
                      ? t("finance.transactions.resetFilters")
                      : undefined
                  }
                  onAction={hasActiveFilters ? handleResetFilters : undefined}
                />
              </View>
            )
          }
        />

        <AppBottomSheet
          ref={statementsSheetRef}
          snapPoints={["55%", "82%"]}
          onClose={() => setStatementsOpen(false)}
        >
          <View style={styles.sheetHeaderWrap}>
            <BottomSheetHeader
              title={t("finance.detail.statement")}
              onClose={closeStatementsSheet}
            />
          </View>
          {statementsOpen ? (
            <BottomSheetScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {statements.isLoading ? (
                <View style={styles.sheetStatusRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.caption}>{t("common.loading")}</Text>
                </View>
              ) : statements.isError ? (
                <View style={styles.sheetStatusRow}>
                  <AlertCircle size={16} color={colors.destructive} />
                  <Text style={styles.chartErrorText}>
                    {t("finance.detail.error")}
                  </Text>
                </View>
              ) : statements.data?.statements?.length ? (
                statements.data.statements.map((s, idx) => (
                  <View
                    key={s.id}
                    style={[
                      styles.statement,
                      idx === 0 && styles.statementFirst,
                    ]}
                  >
                    <View style={styles.statementInfo}>
                      <Text style={styles.statementName} numberOfLines={1}>
                        {s.filename}
                      </Text>
                      <Text style={styles.caption}>
                        {tz.format(s.statementDate)}
                      </Text>
                      <MonoAmount size="sm">
                        {tz.formatMoney(
                          s.statementEndingBalance,
                          account.currency
                        )}
                      </MonoAmount>
                    </View>
                    <Badge
                      label={t(
                        s.status === "COMPLETED"
                          ? "finance.detail.reconciled"
                          : "finance.detail.reconciling"
                      )}
                      color={
                        s.status === "COMPLETED"
                          ? colors.success
                          : colors.primary
                      }
                      bg={
                        s.status === "COMPLETED"
                          ? colors.successSubtle
                          : colors.primarySubtle
                      }
                    />
                  </View>
                ))
              ) : (
                <View style={styles.sheetStatusRow}>
                  <Text style={styles.caption}>
                    {t("finance.detail.noStatements")}
                  </Text>
                </View>
              )}
            </BottomSheetScrollView>
          ) : null}
        </AppBottomSheet>

        <AppBottomSheet
          ref={filterSheetRef}
          snapPoints={["62%", "82%"]}
          onClose={() => setFilterSheetOpen(false)}
        >
          <View style={styles.sheetHeaderWrap}>
            <BottomSheetHeader
              title={t("finance.detail.filtersAndPeriod")}
              onClose={closeFilterSheet}
            />
          </View>
          {filterSheetOpen ? (
            <BottomSheetScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.filterSheetScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.filterSheetSection}>
                <Text style={styles.filterSheetSectionTitle}>
                  {t("finance.transactions.list.periodSection")}
                </Text>

                <View style={styles.sheetMonthStepper}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={t("calendar.prevMonth")}
                    style={styles.sheetMonthStepBtn}
                    onPress={() => handleStepMonth(-1)}
                    activeOpacity={0.7}
                  >
                    <ChevronLeft size={16} color={colors.textSecondary} />
                  </TouchableOpacity>

                  <View style={styles.sheetMonthCenter}>
                    <Calendar
                      size={14}
                      color={
                        periodValue.period !== "all"
                          ? colors.primary
                          : colors.textMuted
                      }
                    />
                    <Text
                      style={[
                        styles.sheetMonthCenterText,
                        periodValue.period !== "all" &&
                          styles.sheetMonthCenterTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {periodLabel}
                    </Text>
                  </View>

                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={t("calendar.nextMonth")}
                    style={styles.sheetMonthStepBtn}
                    onPress={() => handleStepMonth(1)}
                    activeOpacity={0.7}
                  >
                    <ChevronRight size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.sheetPillsGrid}>
                  {PERIOD_PRESETS.map((preset) => {
                    const isSelected = periodBounds.period === preset.value
                    return (
                      <TouchableOpacity
                        key={preset.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        activeOpacity={0.7}
                        style={[
                          styles.sheetOptionPill,
                          isSelected && styles.sheetOptionPillActive,
                        ]}
                        onPress={() => {
                          haptics.selection()
                          setPeriodValue({
                            period: preset.value,
                            month: "",
                            dateFrom: "",
                            dateTo: "",
                          })
                        }}
                      >
                        <Text
                          style={[
                            styles.sheetOptionPillText,
                            isSelected && styles.sheetOptionPillTextActive,
                          ]}
                        >
                          {t(preset.labelKey)}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>

              <View
                style={[
                  styles.filterSheetSection,
                  styles.filterSheetSectionBorder,
                ]}
              >
                <Text style={styles.filterSheetSectionTitle}>
                  {t("finance.transactions.facetType")}
                </Text>

                <View style={styles.sheetPillsGrid}>
                  {accountLedgerFilters.map((v) => {
                    const active = filter === v
                    return (
                      <TouchableOpacity
                        key={v}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        activeOpacity={0.7}
                        style={[
                          styles.sheetOptionPill,
                          active && styles.sheetOptionPillActive,
                        ]}
                        onPress={() => {
                          haptics.selection()
                          setFilter(v)
                        }}
                      >
                        <Text
                          style={[
                            styles.sheetOptionPillText,
                            active && styles.sheetOptionPillTextActive,
                          ]}
                        >
                          {t(`finance.detail.${v}`)}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>

              {hasActiveFilters ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  activeOpacity={0.7}
                  style={styles.sheetResetBtn}
                  onPress={() => {
                    handleResetFilters()
                    closeFilterSheet()
                  }}
                >
                  <Text style={styles.sheetResetText}>
                    {t("finance.transactions.resetFilters")}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </BottomSheetScrollView>
          ) : null}
        </AppBottomSheet>
      </View>
    </>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  loadingContainer: {
    flex: 1,
    backgroundColor: t.colors.background,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: t.colors.background,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: 24,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  errorSubtitle: {
    fontSize: 14,
    color: t.colors.textMuted,
    textAlign: "center" as const,
  },
  backToAccountsBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: t.colors.surfaceSubtle,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  backToAccountsText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  listContent: {
    paddingBottom: 40,
  },
  headerRightRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  headerDotsBtn: {
    width: 40,
    height: 40,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: t.radius.md,
  },
  inlineNoteRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  inlineNoteIcon: {
    marginTop: 2,
  },
  inlineNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: t.colors.textMuted,
  },
  archivedNotice: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSubtle,
  },
  archivedNoticeLeft: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  archivedNoticeText: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: t.colors.textMuted,
  },
  archivedEditBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.surface,
  },
  archivedEditText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  underlineTabBar: {
    flexDirection: "row" as const,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
    gap: 20,
  },
  underlineTab: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginBottom: -StyleSheet.hairlineWidth,
  },
  underlineTabSelected: {
    borderBottomColor: t.colors.primary,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: t.colors.textMuted,
  },
  tabLabelSelected: {
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  tabCountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceSubtle,
  },
  tabCountBadgeSelected: {
    backgroundColor: t.colors.primarySubtle,
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
    fontVariant: ["tabular-nums" as const],
  },
  tabCountTextSelected: {
    color: t.colors.primary,
  },
  searchFilterRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: t.colors.surfaceSubtle,
    borderRadius: t.radius.md,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: t.colors.textPrimary,
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 4,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  filterTriggerBtn: {
    width: 40,
    height: 40,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSubtle,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  filterTriggerBtnActive: {
    backgroundColor: t.colors.primarySubtle,
  },
  filterBadge: {
    position: "absolute" as const,
    top: 4,
    right: 4,
    minWidth: 15,
    height: 15,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.primary,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 3,
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: t.colors.primaryForeground,
    fontVariant: ["tabular-nums" as const],
  },
  activeChipsRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  activeFilterChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.primarySubtle,
  },
  activeFilterChipText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  kpiCard: {
    padding: 16,
    gap: 12,
  },
  kpiTopRow: {
    gap: 4,
  },
  kpiBottomRow: {
    flexDirection: "row" as const,
    alignItems: "stretch" as const,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
  },
  kpiCol: {
    flex: 1,
    gap: 4,
  },
  kpiColDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: t.colors.border,
    marginHorizontal: 12,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: "500" as const,
    color: t.colors.textMuted,
  },
  chartErrorCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    padding: 14,
  },
  chartErrorText: {
    flex: 1,
    fontSize: 13,
    color: t.colors.destructive,
  },
  chartFooterControls: {
    gap: 8,
  },
  sheetHeaderWrap: {
    paddingHorizontal: 16,
  },
  sheetScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 6,
  },
  filterSheetScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  filterSheetSection: {
    gap: 12,
  },
  filterSheetSectionBorder: {
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
  },
  filterSheetSectionTitle: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
  },
  sheetMonthStepper: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    height: 42,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSubtle,
    overflow: "hidden" as const,
  },
  sheetMonthStepBtn: {
    width: 44,
    height: 42,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  sheetMonthCenter: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingHorizontal: 8,
  },
  sheetMonthCenterText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  sheetMonthCenterTextActive: {
    color: t.colors.primary,
  },
  sheetPillsGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  sheetOptionPill: {
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceSubtle,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  sheetOptionPillActive: {
    backgroundColor: t.colors.primarySubtle,
  },
  sheetOptionPillText: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: t.colors.textSecondary,
  },
  sheetOptionPillTextActive: {
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  sheetResetBtn: {
    marginTop: 4,
    minHeight: 44,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSubtle,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sheetResetText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  sheetStatusRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingVertical: 16,
  },
  statementInfo: { flex: 1, gap: 4 },
  statementName: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: t.colors.textPrimary,
  },
  statement: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  statementFirst: {
    borderTopWidth: 0,
  },
  caption: { fontSize: 12, color: t.colors.textMuted },
  activeText: { color: t.colors.textPrimary, fontWeight: "600" as const },
  track: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 2,
    padding: 3,
    backgroundColor: t.colors.surfaceSubtle,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  pill: {
    flexGrow: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: t.radius.sm,
  },
  selected: {
    backgroundColor: t.colors.surface,
    borderColor: t.colors.border,
    ...(!t.isDark ? t.shadows.sm : {}),
  },
  headerSection: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  cardWrapper: {
    marginBottom: 0,
  },
  actionGrid: {
    flexDirection: "row" as const,
    gap: 8,
  },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 5,
    height: 44,
    paddingHorizontal: 8,
    overflow: "hidden" as const,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.primary,
  },
  actionBtnPrimaryText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.primaryForeground,
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 5,
    height: 44,
    paddingHorizontal: 8,
    overflow: "hidden" as const,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSubtle,
  },
  actionBtnSecondaryText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
})
