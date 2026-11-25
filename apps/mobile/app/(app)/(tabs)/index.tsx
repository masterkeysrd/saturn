import React, { useState, useMemo, useRef } from "react"
import {
  Text,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
} from "react-native"
import { useRouter } from "expo-router"
import BottomSheet from "@gorhom/bottom-sheet"
import { useQueryClient } from "@tanstack/react-query"
import { normalizeDashboardWidgets, type DashboardWidgetId } from "@saturn/core"
import {
  useGetDashboardPreferencesQuery,
  useUpdateDashboardPreferencesMutation,
  type DashboardPreferences,
} from "@saturn/api/saturn/space/v1/space"
import { useI18n, useTimezone } from "@saturn/hooks"
import { Send, SlidersHorizontal, Sparkles } from "lucide-react-native"
import { useAuth } from "@/lib/auth-context"
import { useMobileCopilotView } from "@/lib/copilot-sheet-context"
import { useSpace } from "@/lib/space-context"
import { getOverviewQuickCaptureActions } from "@/lib/quick-capture"
import { buildUpdateDashboardPreferencesPayload } from "@/lib/overview-preferences"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import {
  QuickCaptureFab,
  QuickCaptureSheet,
} from "@/components/ui/quick-capture-sheet"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { useToast } from "@/components/ui/toast"
import { FinanceSummaryWidget } from "@/components/widgets/finance-summary-widget"
import { BudgetPaceWidget } from "@/components/widgets/budget-pace-widget"
import { UpcomingBillsWidget } from "@/components/widgets/upcoming-bills-widget"
import { CalendarSummaryWidget } from "@/components/widgets/calendar-summary-widget"
import { MailSummaryWidget } from "@/components/widgets/mail-summary-widget"
import { WorkflowRunsWidget } from "@/components/widgets/workflow-runs-widget"
import { CustomizeOverviewSheet } from "@/components/widgets/customize-overview-sheet"

const OVERVIEW_PROMPT_KEYS = [
  "dashboard.overview.promptSchedule",
  "dashboard.overview.promptSpend",
  "dashboard.overview.promptMail",
] as const

export default function OverviewScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { user } = useAuth()
  const { activeSpaceId, refetchSpaces, activeSpaceRole } = useSpace()
  const tz = useTimezone()
  const { t } = useI18n()
  const { colors, isDark } = useTheme()
  const styles = useThemedStyles(createStyles)
  const quickCaptureRef = useRef<BottomSheet>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [aiQuery, setAiQuery] = useState("")
  const [customizeOpen, setCustomizeOpen] = useState(false)

  useMobileCopilotView({
    viewId: "mobile.overview",
    title: t("nav.overview"),
    suggestions: [
      t("ai.copilotSheet.suggestOverview"),
      t("ai.copilotSheet.suggestFinance"),
      t("ai.copilotSheet.suggestCalendar"),
    ],
  })

  const quickCaptureActions = useMemo(
    () => getOverviewQuickCaptureActions(activeSpaceRole),
    [activeSpaceRole]
  )

  const spaceId = activeSpaceId || ""
  const { data: prefsData, isLoading: prefsLoading } =
    useGetDashboardPreferencesQuery({ spaceId }, { enabled: Boolean(spaceId) })

  const updateDashboardPreferencesMutation =
    useUpdateDashboardPreferencesMutation()

  const activeWidgets = useMemo(
    () => normalizeDashboardWidgets(prefsData?.widgets),
    [prefsData?.widgets]
  )

  const handleUpdateWidgets = (nextWidgets: DashboardWidgetId[]) => {
    if (!spaceId) return
    const queryKey = [
      `/api/v1/spaces/${spaceId}/dashboard-preferences`,
      { spaceId },
    ]
    const previousPrefs =
      queryClient.getQueryData<DashboardPreferences>(queryKey)

    queryClient.setQueryData<DashboardPreferences>(queryKey, (prev) => ({
      ...prev,
      spaceId,
      widgets: nextWidgets,
    }))

    const payload = buildUpdateDashboardPreferencesPayload(
      spaceId,
      nextWidgets,
      prefsData?.version
    )

    updateDashboardPreferencesMutation.mutate(payload, {
      onSuccess: (updated) => {
        queryClient.setQueryData<DashboardPreferences>(queryKey, updated)
      },
      onError: (err) => {
        queryClient.setQueryData<DashboardPreferences | undefined>(
          queryKey,
          previousPrefs
        )
        haptics.error()
        toast.show({
          title: t("dashboard.overview.saveLayoutFailed"),
          message:
            err instanceof Error
              ? err.message
              : t("dashboard.overview.saveLayoutTryAgain"),
          type: "error",
        })
      },
    })
  }

  const openAIWithPrompt = (promptText?: string) => {
    haptics.light()
    const trimmed = promptText?.trim()
    if (trimmed) {
      router.push({
        pathname: "/(app)/ai",
        params: { prompt: trimmed },
      } as never)
      return
    }
    router.push("/(app)/ai" as never)
  }

  const formattedDate = useMemo(() => {
    return tz.format(tz.now(), {
      weekday: "long",
      month: "short",
      day: "numeric",
    })
  }, [tz])

  const getGreeting = () => {
    const hour = tz.parts(tz.now())?.hour ?? 12
    if (hour < 12) return t("dashboard.overview.greetingMorning")
    if (hour < 18) return t("dashboard.overview.greetingAfternoon")
    return t("dashboard.overview.greetingEvening")
  }

  const firstName =
    user?.name && user.name !== "User"
      ? user.name.split(" ")[0]
      : user?.username || t("dashboard.overview.greetingFallback")

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await Promise.all([
        refetchSpaces(),
        queryClient.invalidateQueries({
          predicate: (query) => {
            const firstKey = query.queryKey[0]
            if (typeof firstKey !== "string") return false
            return (
              firstKey.startsWith("/api/v1/") ||
              firstKey === "calendar" ||
              firstKey === "mail" ||
              firstKey === "connector"
            )
          },
        }),
      ])
    } finally {
      setRefreshing(false)
    }
  }

  const renderWidget = (widgetId: DashboardWidgetId) => {
    switch (widgetId) {
      case "ai_quick_ask":
        return (
          <View key={widgetId} style={styles.aiLauncherWrap}>
            <View style={styles.aiInputRow}>
              <Sparkles size={16} color={colors.primary} />
              <TextInput
                style={styles.aiInput}
                value={aiQuery}
                onChangeText={setAiQuery}
                placeholder={t("dashboard.overview.aiPlaceholder")}
                placeholderTextColor={colors.textMuted}
                keyboardAppearance={isDark ? "dark" : "light"}
                returnKeyType="send"
                onSubmitEditing={() => {
                  const text = aiQuery
                  setAiQuery("")
                  openAIWithPrompt(text)
                }}
              />
              <TouchableOpacity
                style={styles.aiSendBtn}
                activeOpacity={0.7}
                onPress={() => {
                  const text = aiQuery
                  setAiQuery("")
                  openAIWithPrompt(text)
                }}
                accessibilityLabel={t("dashboard.overview.aiSendAria")}
              >
                <Send size={14} color={colors.primaryForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.aiChipsRow}
            >
              {OVERVIEW_PROMPT_KEYS.map((promptKey) => (
                <TouchableOpacity
                  key={promptKey}
                  style={styles.aiChip}
                  activeOpacity={0.7}
                  onPress={() => openAIWithPrompt(t(promptKey))}
                >
                  <Text style={styles.aiChipText}>{t(promptKey)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )
      case "net_worth":
        return <FinanceSummaryWidget key={widgetId} />
      case "budget_pace":
        return <BudgetPaceWidget key={widgetId} />
      case "upcoming_bills":
        return <UpcomingBillsWidget key={widgetId} />
      case "today_schedule":
        return <CalendarSummaryWidget key={widgetId} />
      case "priority_mail":
        return <MailSummaryWidget key={widgetId} />
      case "workflow_runs":
        return <WorkflowRunsWidget key={widgetId} />
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
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surfaceElevated}
          />
        }
      >
        {/* Daily Greeting, Date & Customize Button */}
        <View style={styles.greetingHeader}>
          <View style={styles.greetingTextCol}>
            <Text style={styles.dateLabel}>{formattedDate}</Text>
            <Text style={styles.greetingTitle} numberOfLines={1}>
              {getGreeting()}, {firstName}
            </Text>
          </View>

          {Boolean(spaceId) && (
            <TouchableOpacity
              style={styles.customizeBtn}
              activeOpacity={0.75}
              onPress={() => {
                haptics.light()
                setCustomizeOpen(true)
              }}
              testID="overview-customize-btn"
              accessibilityRole="button"
              accessibilityLabel={t("dashboard.overview.customizeAria")}
            >
              <SlidersHorizontal size={14} color={colors.textSecondary} />
              <Text style={styles.customizeBtnText}>
                {t("common.customize")}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Ordered Space-Scoped Widgets */}
        {prefsLoading && !prefsData ? (
          <View style={styles.loadingWrap}>
            <SkeletonCard height={110} />
            <SkeletonCard height={140} />
            <SkeletonCard height={140} />
          </View>
        ) : (
          activeWidgets.map((widgetId) => renderWidget(widgetId))
        )}
      </ScrollView>

      <QuickCaptureFab
        testID="overview-fab-quick-capture"
        accessibilityLabel={t("dashboard.overview.quickCaptureAria")}
        accessibilityHint={t("dashboard.overview.quickCaptureHint")}
        onPress={() => quickCaptureRef.current?.expand()}
      />
      <QuickCaptureSheet
        ref={quickCaptureRef}
        title={t("common.quickAction")}
        actions={quickCaptureActions}
        onClose={() => quickCaptureRef.current?.close()}
      />

      <CustomizeOverviewSheet
        open={customizeOpen}
        activeWidgets={activeWidgets}
        isSaving={updateDashboardPreferencesMutation.isPending}
        onClose={() => setCustomizeOpen(false)}
        onChangeWidgets={handleUpdateWidgets}
      />
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  content: {
    padding: 16,
    paddingTop: 12,
    paddingBottom: 96,
    gap: 12,
  },
  greetingHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 12,
    paddingHorizontal: 4,
  },
  greetingTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 0,
  },
  dateLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  greetingTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
  customizeBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  customizeBtnText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
  },
  loadingWrap: {
    gap: 12,
  },
  aiLauncherWrap: {
    gap: 8,
  },
  aiInputRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.lg,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
  },
  aiInput: {
    flex: 1,
    fontSize: 14,
    color: t.colors.textPrimary,
    paddingVertical: 4,
  },
  aiSendBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: t.colors.primary,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  aiChipsRow: {
    flexDirection: "row" as const,
    gap: 8,
    paddingHorizontal: 2,
  },
  aiChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  aiChipText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
  },
})
