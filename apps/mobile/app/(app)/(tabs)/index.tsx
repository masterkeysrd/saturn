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
import { useTimezone } from "@saturn/hooks"
import { Send, Sparkles } from "lucide-react-native"
import { useAuth } from "@/lib/auth-context"
import { useSpace } from "@/lib/space-context"
import { getOverviewQuickCaptureActions } from "@/lib/quick-capture"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import {
  QuickCaptureFab,
  QuickCaptureSheet,
} from "@/components/ui/quick-capture-sheet"
import { FinanceSummaryWidget } from "@/components/widgets/finance-summary-widget"
import { CalendarSummaryWidget } from "@/components/widgets/calendar-summary-widget"
import { MailSummaryWidget } from "@/components/widgets/mail-summary-widget"

const OVERVIEW_PROMPTS = [
  "Today's schedule",
  "This month's spend",
  "Unread mail",
]

export default function OverviewScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { refetchSpaces, activeSpaceRole } = useSpace()
  const tz = useTimezone()
  const { colors, isDark } = useTheme()
  const styles = useThemedStyles(createStyles)
  const quickCaptureRef = useRef<BottomSheet>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [aiQuery, setAiQuery] = useState("")
  const quickCaptureActions = useMemo(
    () => getOverviewQuickCaptureActions(activeSpaceRole),
    [activeSpaceRole]
  )

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
    if (hour < 12) return "Good morning"
    if (hour < 18) return "Good afternoon"
    return "Good evening"
  }

  const firstName =
    user?.name && user.name !== "User"
      ? user.name.split(" ")[0]
      : user?.username || "there"

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
        {/* Daily Greeting & Date Header */}
        <View style={styles.greetingHeader}>
          <Text style={styles.dateLabel}>{formattedDate}</Text>
          <Text style={styles.greetingTitle}>
            {getGreeting()}, {firstName}
          </Text>
        </View>

        {/* Quick AI Assistant Launcher */}
        <View style={styles.aiLauncherWrap}>
          <View style={styles.aiInputRow}>
            <Sparkles size={16} color={colors.primary} />
            <TextInput
              style={styles.aiInput}
              value={aiQuery}
              onChangeText={setAiQuery}
              placeholder="Ask Saturn AI anything..."
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
              accessibilityLabel="Ask Saturn AI"
            >
              <Send size={14} color={colors.primaryForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.aiChipsRow}
          >
            {OVERVIEW_PROMPTS.map((chip) => (
              <TouchableOpacity
                key={chip}
                style={styles.aiChip}
                activeOpacity={0.7}
                onPress={() => openAIWithPrompt(chip)}
              >
                <Text style={styles.aiChipText}>{chip}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Feature Widgets */}
        <CalendarSummaryWidget />
        <MailSummaryWidget />
        <FinanceSummaryWidget />
      </ScrollView>

      <QuickCaptureFab
        testID="overview-fab-quick-capture"
        accessibilityLabel="Quick capture"
        accessibilityHint="Opens quick actions to record transactions, events, emails, or ask AI"
        onPress={() => quickCaptureRef.current?.expand()}
      />
      <QuickCaptureSheet
        ref={quickCaptureRef}
        title="Quick Capture"
        actions={quickCaptureActions}
        onClose={() => quickCaptureRef.current?.close()}
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
    paddingHorizontal: 4,
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
