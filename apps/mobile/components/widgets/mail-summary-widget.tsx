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
} from "@saturn/hooks"
import { formatThreadParticipants, parseDate } from "@saturn/core"
import type { Thread } from "@saturn/api/saturn/mail/v1/mail"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton-loader"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

function formatWidgetThreadTime(
  dateStr: string | undefined,
  tz: ReturnType<typeof useTimezone>
): string {
  if (!dateStr) return ""
  const parsed = parseDate(dateStr)
  if (!parsed) return ""
  if (tz.isToday(parsed)) {
    return tz.formatTime(parsed)
  }
  if (tz.isYesterday(parsed)) {
    return "Yesterday"
  }
  return tz.format(parsed, { month: "short", day: "numeric" })
}

export function MailSummaryWidget() {
  const router = useRouter()
  const tz = useTimezone()

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
      if (a.id) map.set(a.id, a.color || theme.colors.primary)
    }
    return map
  }, [mailAccounts])

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
            <Mail size={16} color={theme.colors.primary} />
            <Text style={styles.titleText}>Unread Mail</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.subtitleText}>
              {inboxUnreadCount === 0
                ? "Inbox zero"
                : `${inboxUnreadCount} unread`}
            </Text>
            <ChevronRight size={16} color={theme.colors.textMuted} />
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
              style={{ borderRadius: theme.radius.sm }}
            />
            <Skeleton
              width="100%"
              height={38}
              style={{ borderRadius: theme.radius.sm, marginTop: 8 }}
            />
          </View>
        ) : visibleThreads.length === 0 ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleNavigateMail}
            style={styles.emptyContainer}
          >
            <CheckCircle2 size={18} color={theme.colors.success} />
            <Text style={styles.emptyText}>
              All caught up. Tap to open inbox.
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.threadsList}>
            {visibleThreads.map((thread, idx) => {
              const color =
                accountColorMap.get(thread.connectedAccountId) ||
                theme.colors.primary
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
                tz
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
                          <Paperclip size={11} color={theme.colors.textMuted} />
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  headerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  titleText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  subtitleText: {
    fontSize: 12,
    color: theme.colors.textMuted,
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
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  threadsList: {
    gap: 0,
  },
  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  threadRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  senderText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  threadMetaRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  timeText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  subjectText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
})
