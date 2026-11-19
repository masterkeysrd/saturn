import { useMemo } from "react"
import { StyleSheet, View, TouchableOpacity, Text } from "react-native"
import { useRouter } from "expo-router"
import {
  Mail,
  ChevronRight,
  CheckCircle2,
  Paperclip,
} from "lucide-react-native"
import {
  useConnectedAccounts,
  useMailboxes,
  useMailThreads,
  useTimezone,
  useI18n,
} from "@saturn/hooks"
import type { TranslationKey } from "@saturn/i18n"
import { formatThreadParticipants, parseDate } from "@saturn/core"
import type { Thread } from "@saturn/api/saturn/mail/v1/mail"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton-loader"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

function formatWidgetThreadTime(
  dateStr: string | undefined,
  tz: ReturnType<typeof useTimezone>,
  t: (key: TranslationKey) => string
): string {
  if (!dateStr) return ""
  const parsed = parseDate(dateStr)
  if (!parsed) return ""
  if (tz.isToday(parsed)) {
    return tz.formatTime(parsed)
  }
  if (tz.isYesterday(parsed)) {
    return t("common.yesterday")
  }
  return tz.format(parsed, { month: "short", day: "numeric" })
}

export function MailSummaryWidget() {
  const { colors, radius } = useTheme()
  const styles = useThemedStyles(createStyles)
  const router = useRouter()
  const tz = useTimezone()
  const { t } = useI18n()

  const { data: accountsData, isLoading: accountsLoading } =
    useConnectedAccounts()

  const mailAccounts = useMemo(() => {
    return (accountsData?.accounts || []).filter(
      (a) =>
        a.enabledCapabilities?.includes("mail") ||
        a.enabledCapabilities?.includes("MAIL")
    )
  }, [accountsData?.accounts])

  const hasMailAccount = mailAccounts.length > 0

  const accountColorMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of mailAccounts) {
      if (a.id) map.set(a.id, a.color || colors.primary)
    }
    return map
  }, [mailAccounts, colors.primary])

  const accountEmailMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of mailAccounts) {
      if (a.id && a.email) map.set(a.id, a.email)
    }
    return map
  }, [mailAccounts])

  const { data: mailboxesData } = useMailboxes(undefined, {
    enabled: hasMailAccount,
  })

  const { data: threadsData, isLoading: threadsLoading } = useMailThreads(
    {
      systemBucket: "MAILBOX_ROLE_INBOX",
      isUnread: true,
      pageSize: 10,
    },
    { enabled: hasMailAccount }
  )

  const unreadThreads = useMemo(
    () => threadsData?.threads || [],
    [threadsData?.threads]
  )

  const inboxUnreadCount = useMemo(() => {
    let total = 0
    for (const mbx of mailboxesData?.mailboxes || []) {
      if (mbx.systemRole === "MAILBOX_ROLE_INBOX") {
        total += mbx.unreadCount || 0
      }
    }
    return Math.max(total, unreadThreads.length)
  }, [mailboxesData?.mailboxes, unreadThreads.length])

  if (!accountsLoading && !hasMailAccount) {
    return null
  }

  const isLoading = accountsLoading || threadsLoading
  const visibleThreads = unreadThreads.slice(0, 3)

  const handleNavigateMail = () => {
    haptics.light()
    router.push("/(app)/(tabs)/mail")
  }

  const handleOpenThread = (thread: Thread) => {
    haptics.light()
    router.push(`/(app)/mail/${thread.id}`)
  }

  return (
    <Card style={styles.card} testID="mail-summary-widget">
      {/* Header */}
      <CardHeader style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleNavigateMail}
          style={styles.headerButton}
          testID="mail-widget-header-btn"
        >
          <View style={styles.headerTitleRow}>
            <Mail size={16} color={colors.primary} />
            <Text style={styles.titleText}>
              {t("dashboard.widget.priority_mail.title")}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.subtitleText}>
              {inboxUnreadCount === 0
                ? t("mail.inboxZero")
                : t("mail.unreadCount", { count: inboxUnreadCount })}
            </Text>
            <ChevronRight size={16} color={colors.textMuted} />
          </View>
        </TouchableOpacity>
      </CardHeader>

      {/* Content */}
      <CardContent style={styles.content}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <Skeleton
              width="100%"
              height={38}
              style={{ borderRadius: radius.sm }}
            />
            <Skeleton
              width="100%"
              height={38}
              style={{ borderRadius: radius.sm, marginTop: 8 }}
            />
          </View>
        ) : visibleThreads.length === 0 ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleNavigateMail}
            style={styles.emptyContainer}
          >
            <CheckCircle2 size={18} color={colors.success} />
            <Text style={styles.emptyText}>
              {t("dashboard.widget.priority_mail.empty")}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.threadsList}>
            {visibleThreads.map((thread, idx) => {
              const color =
                accountColorMap.get(thread.connectedAccountId) || colors.primary
              const accountEmail = accountEmailMap.get(
                thread.connectedAccountId
              )
              const sender = formatThreadParticipants({
                participants: thread.participants,
                selfEmails: accountEmail ? [accountEmail] : [],
                isSentBucket: Boolean(thread.inSent && !thread.inInbox),
              })
              const timeStr = formatWidgetThreadTime(
                thread.lastMessageAt || thread.updateTime,
                tz,
                t
              )

              return (
                <TouchableOpacity
                  key={thread.id}
                  activeOpacity={0.7}
                  onPress={() => handleOpenThread(thread)}
                  style={[
                    styles.threadRow,
                    idx < visibleThreads.length - 1 && styles.threadRowDivider,
                  ]}
                  testID={`mail-widget-thread-${thread.id}`}
                >
                  <View style={[styles.colorDot, { backgroundColor: color }]} />
                  <View style={styles.threadInfo}>
                    <View style={styles.threadTopRow}>
                      <Text numberOfLines={1} style={styles.senderText}>
                        {sender}
                      </Text>
                      <View style={styles.threadMetaRight}>
                        {thread.hasAttachments ? (
                          <Paperclip size={11} color={colors.textMuted} />
                        ) : null}
                        {timeStr ? (
                          <Text style={styles.timeText}>{timeStr}</Text>
                        ) : null}
                      </View>
                    </View>
                    <Text numberOfLines={1} style={styles.subjectText}>
                      {thread.subject || "(No Subject)"}
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        )}
      </CardContent>
    </Card>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  card: {
    backgroundColor: t.colors.surface,
    borderColor: t.colors.border,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  headerButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  headerTitleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  headerRight: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  titleText: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  subtitleText: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 4,
  },
  loadingContainer: {
    paddingVertical: 4,
  },
  emptyContainer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingVertical: 6,
  },
  emptyText: {
    fontSize: 13,
    color: t.colors.textSecondary,
  },
  threadsList: {
    gap: 0,
  },
  threadRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    paddingVertical: 6,
  },
  threadRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  threadInfo: {
    flex: 1,
    gap: 2,
  },
  threadTopRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  senderText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  threadMetaRight: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  timeText: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  subjectText: {
    fontSize: 12,
    color: t.colors.textSecondary,
  },
})
