import React, { useState, useMemo } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
} from "react-native"
import { useRouter } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import { useTimezone } from "@saturn/hooks"
import { Send, Sparkles } from "lucide-react-native"
import { useAuth } from "@/lib/auth-context"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
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
  const { refetchSpaces } = useSpace()
  const tz = useTimezone()
  const [refreshing, setRefreshing] = useState(false)
  const [aiQuery, setAiQuery] = useState("")

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
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
            progressBackgroundColor={theme.colors.surfaceElevated}
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
            <Sparkles size={16} color={theme.colors.primary} />
            <TextInput
              style={styles.aiInput}
              value={aiQuery}
              onChangeText={setAiQuery}
              placeholder="Ask Saturn AI anything..."
              placeholderTextColor={theme.colors.textMuted}
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
              <Send size={14} color={theme.colors.primaryForeground} />
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
    paddingTop: 12,
    paddingBottom: 80,
    gap: 12,
  },
  greetingHeader: {
    paddingHorizontal: 4,
    gap: 0,
  },
  dateLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  greetingTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
  aiLauncherWrap: {
    gap: 8,
  },
  aiInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
  },
  aiInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textPrimary,
    paddingVertical: 4,
  },
  aiSendBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  aiChipsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 2,
  },
  aiChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  aiChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
})
