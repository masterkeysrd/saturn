import React, { useState, useMemo, useEffect, useCallback, useRef } from "react"
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Linking,
  Platform,
} from "react-native"
import { useLocalSearchParams, useRouter, Stack } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import * as FileSystem from "expo-file-system/legacy"
import * as Sharing from "expo-sharing"
import {
  Archive,
  Trash2,
  Star,
  CalendarPlus,
  Mail,
  Reply,
  ReplyAll,
  Forward,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CornerUpLeft,
  Download,
  Paperclip,
  Sparkles,
  RefreshCw,
} from "lucide-react-native"
import {
  useMailThread,
  useModifyThread,
  useSummarizeMailThread,
  useTimezone,
  useI18n,
} from "@saturn/hooks"
import type { Message, Attachment } from "@saturn/api/saturn/mail/v1/mail"
import {
  buildCopilotEntityKey,
  formatAttachmentBytes,
  computeHumanizedMailTimestamp,
  partitionThreadMessagesForSuperCollapse,
  type HumanizedMailTimestamp,
} from "@saturn/core"
import { getApiBaseUrl } from "../../../lib/config"
import {
  useMobileCopilotView,
  useOptionalMobileCopilotSheet,
} from "../../../lib/copilot-sheet-context"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../../../lib/theme"
import { haptics } from "../../../lib/haptics"
import { AIHeaderButton } from "../../../components/app-header"
import { useToast } from "../../../components/ui/toast"
import { MessageWebView } from "../../../components/mail/message-webview"
import { ThreadAvatar } from "../../../components/mail/thread-avatar"
import type { TranslationKey } from "@saturn/i18n"

function translateHumanizedMailTimestamp(
  stamp: HumanizedMailTimestamp,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): string {
  switch (stamp.kind) {
    case "just_now":
      return t("mail.threadTime.justNow")
    case "minutes_ago":
      return t("mail.threadTime.minutesAgo", { count: stamp.count })
    case "hours_ago":
      return stamp.count === 1
        ? t("mail.threadTime.hourAgo")
        : t("mail.threadTime.hoursAgo", { count: stamp.count })
    case "today":
      return t("common.today")
    case "yesterday":
      return t("common.yesterday")
    case "days_ago":
      return t("mail.threadTime.daysAgo", { count: stamp.count })
    case "date_dmy":
      return stamp.formatted
  }
}

export default function MobileThreadReaderScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { threadId } = useLocalSearchParams<{ threadId: string }>()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

  const { data: thread, isLoading, error } = useMailThread(threadId)
  const modifyMutation = useModifyThread()
  const { mutate: modifyThread } = modifyMutation
  const toast = useToast()
  const tz = useTimezone()
  const { t, language } = useI18n()
  const copilotSheet = useOptionalMobileCopilotSheet()

  useMobileCopilotView(
    thread?.id
      ? {
          viewId: "mobile.mail.thread",
          title: thread.subject || t("mail.noSubject"),
          activeEntity: {
            key: buildCopilotEntityKey("mail_thread", thread.id),
            kind: "mail_thread",
            id: thread.id,
            label: thread.subject || t("mail.noSubject"),
            summary: {
              isUnread: Boolean(thread.isUnread),
              messageCount: thread.messageCount,
            },
          },
          suggestions: [
            t("mail.suggestion.threadSummarize"),
            t("mail.suggestion.threadReply"),
            t("mail.suggestion.threadDeadlines"),
          ],
        }
      : null
  )

  const summarizeMutation = useSummarizeMailThread({
    onError: () => {
      toast.show({ title: t("mail.summary.failed"), type: "error" })
    },
  })
  const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false)

  useEffect(() => {
    setIsSummaryCollapsed(false)
  }, [threadId])

  const handleSummarize = () => {
    if (!thread) return
    haptics.light()
    setIsSummaryCollapsed(false)
    if (!thread.summary) {
      summarizeMutation.mutate({
        id: thread.id,
        forceRegenerate: false,
        language,
      })
    } else if (thread.summary.isStale) {
      summarizeMutation.mutate({
        id: thread.id,
        forceRegenerate: true,
        language,
      })
    }
  }

  const handleRegenerateSummary = () => {
    if (!thread) return
    haptics.light()
    setIsSummaryCollapsed(false)
    summarizeMutation.mutate({ id: thread.id, forceRegenerate: true, language })
  }

  // Auto-mark conversation as read when opened
  const markedAsReadRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!thread?.id || !thread.isUnread) return
    if (markedAsReadRef.current.has(thread.id)) return

    const threadToMark = thread.id
    const timer = setTimeout(() => {
      markedAsReadRef.current.add(threadToMark)
      modifyThread({
        id: threadToMark,
        req: { id: threadToMark, isUnread: false },
      })
    }, 750)

    return () => clearTimeout(timer)
  }, [thread?.id, thread?.isUnread, modifyThread])

  // Track which messages are collapsed/expanded
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [isMiddleUnfolded, setIsMiddleUnfolded] = useState(false)
  const [detailsExpandedIds, setDetailsExpandedIds] = useState<Set<string>>(
    new Set()
  )

  useEffect(() => {
    setIsMiddleUnfolded(false)
    setDetailsExpandedIds(new Set())
  }, [threadId])

  const messages = useMemo(() => thread?.messages || [], [thread?.messages])

  // Gmail canvas: expand only the latest message plus any unread ones
  useEffect(() => {
    if (messages.length === 0) return
    if (messages.length === 1) {
      setExpandedIds(new Set([messages[0].id]))
      return
    }
    const initial = new Set<string>()
    initial.add(messages[messages.length - 1].id)
    for (const m of messages) {
      if (m.isUnread) initial.add(m.id)
    }
    setExpandedIds(initial)
  }, [messages])

  const toggleExpand = (id: string) => {
    haptics.selection()
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleDetailsExpanded = (id: string) => {
    haptics.selection()
    setDetailsExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const humanizedTimeText = useCallback(
    (date: string | undefined): string => {
      if (!date) return ""
      const stamp = computeHumanizedMailTimestamp(date, {
        now: tz.now(),
        timeZone: tz.timezone,
      })
      if (!stamp) return ""
      return translateHumanizedMailTimestamp(stamp, t)
    },
    [t, tz]
  )

  // Header quick actions
  const handleToggleStar = () => {
    if (!thread) return
    haptics.selection()
    modifyMutation.mutate({
      id: thread.id,
      req: { id: thread.id, isStarred: !thread.isStarred },
    })
  }

  const handleMarkUnread = () => {
    if (!thread) return
    haptics.medium()
    modifyMutation.mutate({
      id: thread.id,
      req: { id: thread.id, isUnread: true },
    })
    router.back()
  }

  const handleArchive = () => {
    if (!thread) return
    haptics.medium()
    modifyMutation.mutate({
      id: thread.id,
      req: { id: thread.id, inInbox: false },
    })
    router.back()
    toast.show({
      title: t("mail.conversationArchived"),
      type: "success",
      action: {
        label: t("common.undo"),
        onPress: () => {
          modifyMutation.mutate({
            id: thread.id,
            req: { id: thread.id, inInbox: true },
          })
        },
      },
    })
  }

  const handleTrash = () => {
    if (!thread) return
    haptics.medium()
    modifyMutation.mutate({
      id: thread.id,
      req: { id: thread.id, inTrash: true },
    })
    router.back()
    toast.show({
      title: t("mail.conversationTrash"),
      type: "success",
      action: {
        label: t("common.undo"),
        onPress: () => {
          modifyMutation.mutate({
            id: thread.id,
            req: { id: thread.id, inTrash: false, inInbox: true },
          })
        },
      },
    })
  }

  // Create Calendar Event handoff
  const handleCreateEvent = () => {
    if (!thread) return
    haptics.selection()
    const latestMsg = messages[messages.length - 1]

    const attendees: { email: string; displayName?: string }[] = []
    if (latestMsg?.from?.email) {
      attendees.push({
        email: latestMsg.from.email,
        displayName: latestMsg.from.name || "",
      })
    }
    if (latestMsg?.to) {
      for (const p of latestMsg.to) {
        if (p.email && !attendees.some((a) => a.email === p.email)) {
          attendees.push({ email: p.email, displayName: p.name || "" })
        }
      }
    }

    router.push({
      pathname: "/modal/manage-event",
      params: {
        initialTitle: thread.subject || t("mail.meetingFromEmail"),
        initialDescription: `Created from email thread: ${thread.subject}\nSnippet: ${thread.snippet}`,
        sourceMailMessageId: latestMsg?.id || "",
        initialAttendees: JSON.stringify(attendees),
      },
    })
  }

  // Reply / Forward Composer Launchers
  const handleReply = (
    mode: "DRAFT_MODE_REPLY" | "DRAFT_MODE_REPLY_ALL" | "DRAFT_MODE_FORWARD",
    msg?: Message
  ) => {
    if (!thread) return
    haptics.selection()
    const targetMsg = msg || messages[messages.length - 1]

    router.push({
      pathname: "/modal/compose-mail",
      params: {
        threadId: thread.id,
        replyToMessageId: targetMsg?.id || "",
        mode,
        defaultAccountId: thread.connectedAccountId,
      },
    })
  }

  // Download & Share attachment via expo-file-system and expo-sharing
  const handleDownloadAttachment = useCallback(
    async (att: Attachment) => {
      if (!att.downloadUrl) return
      haptics.selection()

      const fullUrl = att.downloadUrl.startsWith("http")
        ? att.downloadUrl
        : `${getApiBaseUrl().replace(/\/$/, "")}${att.downloadUrl}`

      if (Platform.OS === "web") {
        Linking.openURL(fullUrl)
        return
      }

      try {
        const attKey = att.id || att.filename || "file"
        setDownloadingId(attKey)
        const filename = att.filename || "attachment"
        const safeKey = attKey.replace(/[^a-zA-Z0-9._-]/g, "_")
        const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_")
        const destUri = `${FileSystem.cacheDirectory ?? ""}${safeKey}_${safeFilename}`

        const downloadRes = await FileSystem.downloadAsync(fullUrl, destUri)

        if (downloadRes.status === 200) {
          const canShare = await Sharing.isAvailableAsync()
          if (canShare) {
            await Sharing.shareAsync(downloadRes.uri, {
              mimeType: att.contentType || "application/octet-stream",
              dialogTitle: t("mail.shareAttachment", { filename }),
            })
          } else {
            Alert.alert(
              t("mail.downloaded"),
              t("mail.savedAttachmentTo", { filename })
            )
          }
        } else {
          Alert.alert(
            t("mail.downloadError"),
            t("mail.couldNotDownloadAttachment")
          )
        }
      } catch (e: unknown) {
        const err = e as Error
        Alert.alert(
          t("common.error"),
          err.message || t("mail.failedToDownloadAttachment")
        )
      } finally {
        setDownloadingId(null)
      }
    },
    [t]
  )

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <Stack.Screen
          options={{
            headerShown: true,
            headerTitle: "",
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
          }}
        />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (error || !thread) {
    return (
      <View style={styles.centerContainer}>
        <Stack.Screen
          options={{
            headerShown: true,
            headerTitle: "",
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
          }}
        />
        <Text style={styles.errorText}>{t("mail.conversationNotFound")}</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>{t("common.back")}</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: "",
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          ...(Platform.OS === "ios"
            ? {
                unstable_headerRightItems: () => [
                  {
                    type: "button",
                    label: t("mail.archive"),
                    icon: { type: "sfSymbol", name: "archivebox" },
                    onPress: handleArchive,
                  },
                  {
                    type: "menu",
                    label: t("mail.threadHeader.moreActions"),
                    icon: { type: "sfSymbol", name: "ellipsis" },
                    menu: {
                      title: thread.subject || t("mail.noSubject"),
                      items: [
                        {
                          type: "action",
                          label: thread.isStarred
                            ? t("mail.unstar")
                            : t("mail.star"),
                          icon: {
                            type: "sfSymbol",
                            name: thread.isStarred ? "star.fill" : "star",
                          },
                          onPress: handleToggleStar,
                        },
                        {
                          type: "action",
                          label: t("mail.threadHeader.markUnread"),
                          icon: { type: "sfSymbol", name: "envelope" },
                          onPress: handleMarkUnread,
                        },
                        {
                          type: "action",
                          label: t("mail.createEventShort"),
                          icon: {
                            type: "sfSymbol",
                            name: "calendar.badge.plus",
                          },
                          onPress: handleCreateEvent,
                        },
                        {
                          type: "action",
                          label: t("common.delete"),
                          icon: { type: "sfSymbol", name: "trash" },
                          destructive: true,
                          onPress: handleTrash,
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
                  <View style={styles.headerRightActions}>
                    <Pressable
                      testID="mobile-thread-action-mark-unread"
                      hitSlop={8}
                      accessibilityLabel={t("mail.threadHeader.markUnread")}
                      onPress={handleMarkUnread}
                      style={styles.headerBtn}
                    >
                      <Mail size={19} color={colors.textMuted} />
                    </Pressable>

                    <Pressable
                      testID="mobile-thread-action-archive"
                      hitSlop={8}
                      accessibilityLabel={t("mail.archive")}
                      onPress={handleArchive}
                      style={styles.headerBtn}
                    >
                      <Archive size={19} color={colors.textMuted} />
                    </Pressable>

                    <Pressable
                      testID="mobile-thread-action-trash"
                      hitSlop={8}
                      accessibilityLabel={t("common.delete")}
                      onPress={handleTrash}
                      style={styles.headerBtn}
                    >
                      <Trash2 size={19} color={colors.textMuted} />
                    </Pressable>

                    {/* Create Calendar Event from Email Button */}
                    <Pressable
                      testID="mobile-thread-action-create-event"
                      hitSlop={8}
                      accessibilityLabel={t("mail.createEventShort")}
                      onPress={handleCreateEvent}
                      style={[styles.headerBtn, styles.createEventBtn]}
                    >
                      <CalendarPlus size={18} color={colors.primary} />
                    </Pressable>

                    <AIHeaderButton
                      testID="mobile-thread-action-ai"
                      style={styles.headerBtn}
                    />
                  </View>
                ),
              }),
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Thread Subject Header */}
        <View style={styles.subjectCard}>
          <View style={styles.subjectTitleRow}>
            <Text style={styles.subjectText}>
              {thread.subject || t("mail.noSubject")}
            </Text>
            <Pressable
              testID="mobile-thread-action-star"
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={
                thread.isStarred ? t("mail.unstar") : t("mail.star")
              }
              onPress={handleToggleStar}
              style={styles.subjectStarBtn}
            >
              <Star
                size={20}
                color={thread.isStarred ? "#eab308" : colors.textMuted}
                fill={thread.isStarred ? "#eab308" : "transparent"}
              />
            </Pressable>
          </View>
          <View style={styles.subjectMetaRow}>
            <Pressable
              testID="mobile-summarize-thread-btn"
              onPress={handleSummarize}
              hitSlop={8}
              style={styles.summarizePill}
            >
              <Sparkles size={13} color={colors.brandSecondary} />
              <Text style={styles.summarizePillText}>
                {t("mail.summarize")}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* In-Place AI Summary Card */}
        {(Boolean(thread.summary) || summarizeMutation.isPending) && (
          <View testID="mobile-thread-summary-card" style={styles.summaryCard}>
            <View style={styles.summaryHeaderRow}>
              <View style={styles.summaryHeaderLeft}>
                <Sparkles size={14} color={colors.brandSecondary} />
                <Text style={styles.summaryTitle}>
                  {t("mail.summary.title")}
                </Text>
                {thread.summary?.isStale && !summarizeMutation.isPending && (
                  <Pressable
                    testID="mobile-summary-update-btn"
                    onPress={handleRegenerateSummary}
                    hitSlop={8}
                    style={styles.stalePill}
                  >
                    <Text style={styles.stalePillText}>
                      {t("mail.summary.staleBadge")} ·{" "}
                      {t("mail.summary.updateSummary")}
                    </Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.summaryHeaderRight}>
                <Pressable
                  testID="mobile-summary-regenerate-btn"
                  onPress={handleRegenerateSummary}
                  hitSlop={8}
                  style={styles.summaryIconBtn}
                >
                  <RefreshCw
                    size={14}
                    color={colors.textMuted}
                    style={
                      summarizeMutation.isPending
                        ? styles.spinningIcon
                        : undefined
                    }
                  />
                </Pressable>
                <Pressable
                  testID="mobile-summary-toggle-btn"
                  onPress={() => {
                    haptics.selection()
                    setIsSummaryCollapsed((prev) => !prev)
                  }}
                  hitSlop={8}
                  style={styles.summaryIconBtn}
                >
                  {isSummaryCollapsed ? (
                    <ChevronDown size={15} color={colors.textMuted} />
                  ) : (
                    <ChevronUp size={15} color={colors.textMuted} />
                  )}
                </Pressable>
              </View>
            </View>

            {summarizeMutation.isPending && !thread.summary && (
              <View style={styles.summaryLoadingRow}>
                <ActivityIndicator size="small" color={colors.brandSecondary} />
                <Text style={styles.summaryLoadingText}>
                  {t("mail.summary.summarizing")}
                </Text>
              </View>
            )}

            {!isSummaryCollapsed && thread.summary && (
              <View style={styles.summaryBody}>
                <Text style={styles.summaryTldr}>{thread.summary.tldr}</Text>

                {thread.summary.keyPoints.length > 0 && (
                  <View style={styles.summarySection}>
                    <View style={styles.summarySectionDivider} />
                    <Text style={styles.summarySectionTitle}>
                      {t("mail.summary.keyPoints")}
                    </Text>
                    {thread.summary.keyPoints.map((point) => (
                      <View key={point} style={styles.summaryBulletRow}>
                        <Text style={styles.summaryBulletDot}>•</Text>
                        <Text style={styles.summaryBulletText}>{point}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {thread.summary.actionItems.length > 0 && (
                  <View style={styles.summarySection}>
                    <View style={styles.summarySectionDivider} />
                    <Text style={styles.summarySectionTitle}>
                      {t("mail.summary.actionItems")}
                    </Text>
                    {thread.summary.actionItems.map((item, idx) => (
                      <View
                        key={item}
                        style={[
                          styles.actionItemRow,
                          idx > 0 && styles.actionItemDivider,
                        ]}
                      >
                        <ChevronRight size={13} color={colors.brandSecondary} />
                        <Text style={styles.summaryBulletText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Message Cards List */}
        <View style={styles.messagesList}>
          {partitionThreadMessagesForSuperCollapse(
            messages,
            isMiddleUnfolded
          ).map((segment) => {
            if (segment.type === "folded") {
              return (
                <Pressable
                  key={segment.key}
                  testID="mobile-super-collapse-btn"
                  accessibilityLabel={t(
                    "mail.superCollapse.hiddenMessagesCount",
                    {
                      count: segment.count,
                    }
                  )}
                  onPress={() => {
                    haptics.selection()
                    setIsMiddleUnfolded(true)
                  }}
                  style={styles.superCollapseRow}
                >
                  <View style={styles.superCollapseTrack}>
                    <View style={styles.superCollapseHairline} />
                    <View style={styles.stackedDeckLip} />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      haptics.selection()
                      setIsMiddleUnfolded(true)
                    }}
                    style={styles.superCollapsePill}
                  >
                    <Text style={styles.superCollapsePillText}>
                      {segment.count}
                    </Text>
                  </Pressable>
                  <View style={styles.superCollapseTrack}>
                    <View style={styles.superCollapseHairline} />
                    <View style={styles.stackedDeckLip} />
                  </View>
                </Pressable>
              )
            }

            const msg = segment.message
            const isExpanded = expandedIds.has(msg.id)
            const senderName =
              msg.from?.name || msg.from?.email || t("mail.unknown")
            const humanizedStamp = humanizedTimeText(msg.sentAt)
            const detailsOpen = detailsExpandedIds.has(msg.id)

            if (!isExpanded) {
              // Collapsed 2-line accordion row (Gmail canvas)
              return (
                <Pressable
                  key={msg.id}
                  testID={`message-collapsed-${msg.id}`}
                  onPress={() => toggleExpand(msg.id)}
                  style={styles.collapsedCard}
                >
                  <ThreadAvatar
                    name={msg.from?.name}
                    email={msg.from?.email}
                    avatarUrl={msg.from?.avatarUrl}
                    isVerified={msg.from?.isVerified}
                    size={36}
                  />
                  <View style={styles.collapsedContent}>
                    <View style={styles.collapsedTopRow}>
                      {msg.isUnread && <View style={styles.unreadDot} />}
                      <Text numberOfLines={1} style={styles.collapsedSender}>
                        {senderName}
                      </Text>
                      {msg.attachments && msg.attachments.length > 0 && (
                        <Paperclip size={13} color={colors.textMuted} />
                      )}
                      <Text style={styles.collapsedTimeText}>
                        {humanizedStamp}
                      </Text>
                    </View>
                    <Text numberOfLines={1} style={styles.collapsedSnippet}>
                      {msg.snippet || ""}
                    </Text>
                  </View>
                </Pressable>
              )
            }

            // Expanded Full Message Card
            return (
              <View
                key={msg.id}
                testID={`message-expanded-${msg.id}`}
                style={styles.expandedCard}
              >
                {/* Header */}
                <Pressable
                  onPress={() => toggleExpand(msg.id)}
                  style={styles.expandedHeader}
                >
                  <ThreadAvatar
                    name={msg.from?.name}
                    email={msg.from?.email}
                    avatarUrl={msg.from?.avatarUrl}
                    isVerified={msg.from?.isVerified}
                    size={36}
                  />

                  <View style={styles.senderCol}>
                    <View style={styles.nameRow}>
                      <Text numberOfLines={1} style={styles.senderFullName}>
                        {senderName}
                      </Text>
                      <Text style={styles.msgTimeText}>{humanizedStamp}</Text>
                      <Pressable
                        testID={`quick-reply-btn-${msg.id}`}
                        hitSlop={8}
                        accessibilityLabel={t("mail.reply")}
                        onPress={(e) => {
                          e.stopPropagation()
                          handleReply("DRAFT_MODE_REPLY", msg)
                        }}
                        style={styles.quickReplyIconBtn}
                      >
                        <CornerUpLeft size={15} color={colors.textSecondary} />
                      </Pressable>
                    </View>
                    <Pressable
                      testID={`message-details-toggle-${msg.id}`}
                      hitSlop={4}
                      onPress={(e) => {
                        e.stopPropagation()
                        toggleDetailsExpanded(msg.id)
                      }}
                      style={styles.recipientRow}
                    >
                      <Text numberOfLines={1} style={styles.recipientSubText}>
                        {t("mail.toPrefix")}{" "}
                        {msg.to?.map((p) => p.name || p.email).join(", ") ||
                          t("mail.me")}
                      </Text>
                      {detailsOpen ? (
                        <ChevronUp size={13} color={colors.textMuted} />
                      ) : (
                        <ChevronDown size={13} color={colors.textMuted} />
                      )}
                    </Pressable>
                    {detailsOpen && (
                      <View style={styles.detailsBlock}>
                        <Text style={styles.detailsLine}>
                          {t("mail.threadHeader.fromLabel")}{" "}
                          {msg.from?.name || ""}{" "}
                          {msg.from?.email ? `<${msg.from.email}>` : ""}
                        </Text>
                        <Text style={styles.detailsLine}>
                          {t("mail.threadHeader.toLabel")}{" "}
                          {msg.to?.map((p) => p.name || p.email).join(", ") ||
                            t("mail.me")}
                        </Text>
                        {msg.cc && msg.cc.length > 0 && (
                          <Text style={styles.detailsLine}>
                            {t("mail.threadHeader.ccLabel")}{" "}
                            {msg.cc.map((p) => p.name || p.email).join(", ")}
                          </Text>
                        )}
                        <Text style={styles.detailsLine}>
                          {t("mail.threadHeader.dateLabel")}{" "}
                          {msg.sentAt ? tz.formatDateTime(msg.sentAt) : ""}
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>

                {/* Message Body View */}
                <View style={styles.bodyWrapper}>
                  <MessageWebView
                    html={msg.bodyHtml}
                    plainText={msg.bodyPlain || msg.snippet}
                    hasRemoteImages={msg.hasRemoteImages}
                    attachments={msg.attachments}
                  />
                </View>

                {/* Attachments Section */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <View style={styles.attachmentsSection}>
                    <Text style={styles.attachmentsTitle}>
                      {t("mail.attachmentsTitle", {
                        count: msg.attachments.filter((a) => !a.isInline)
                          .length,
                      })}
                    </Text>
                    <View style={styles.attachmentsGrid}>
                      {msg.attachments
                        .filter((a) => !a.isInline)
                        .map((att) => {
                          const sizeBytes = parseInt(att.size || "0", 10) || 0
                          const formattedSize = formatAttachmentBytes(sizeBytes)
                          const isDownloading =
                            downloadingId === (att.id || att.filename)

                          return (
                            <Pressable
                              key={att.id || att.filename}
                              testID={`attachment-chip-${att.id || att.filename}`}
                              onPress={() => handleDownloadAttachment(att)}
                              style={styles.attachmentChip}
                            >
                              <Paperclip size={14} color={colors.primary} />
                              <View style={styles.attDetails}>
                                <Text
                                  numberOfLines={1}
                                  style={styles.attFilename}
                                >
                                  {att.filename}
                                </Text>
                                <Text style={styles.attSize}>
                                  {formattedSize}
                                </Text>
                              </View>
                              {isDownloading ? (
                                <ActivityIndicator
                                  size="small"
                                  color={colors.primary}
                                />
                              ) : (
                                <Download size={14} color={colors.textMuted} />
                              )}
                            </Pressable>
                          )
                        })}
                    </View>
                  </View>
                )}
              </View>
            )
          })}
        </View>
      </ScrollView>

      {/* Bottom Sticky Action Bar */}
      <View
        style={[
          styles.bottomActionBar,
          { paddingBottom: Math.max(insets.bottom, 12) + 6 },
        ]}
      >
        <Pressable
          testID="mobile-reply-btn"
          accessibilityLabel={t("mail.reply")}
          onPress={() => handleReply("DRAFT_MODE_REPLY")}
          style={styles.replyIconBtn}
        >
          <Reply size={17} color={colors.textPrimary} />
        </Pressable>

        <Pressable
          testID="mobile-reply-all-btn"
          onPress={() => handleReply("DRAFT_MODE_REPLY_ALL")}
          style={styles.replyActionBtn}
        >
          <ReplyAll size={15} color={colors.textPrimary} />
          <Text numberOfLines={1} style={styles.replyActionText}>
            {t("mail.replyAll")}
          </Text>
        </Pressable>

        <Pressable
          testID="mobile-forward-btn"
          onPress={() => handleReply("DRAFT_MODE_FORWARD")}
          style={styles.replyActionBtn}
        >
          <Forward size={15} color={colors.textPrimary} />
          <Text numberOfLines={1} style={styles.replyActionText}>
            {t("mail.forward")}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  headerRightActions: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 2,
    paddingRight: 4,
  },

  headerBtn: {
    width: 36,
    height: 36,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: t.radius.sm,
  },

  createEventBtn: {
    backgroundColor: t.colors.primarySubtle,
  },

  centerContainer: {
    flex: 1,
    backgroundColor: t.colors.background,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: 24,
  },
  errorText: {
    fontSize: 15,
    color: t.colors.textSecondary,
    marginBottom: 12,
  },
  backBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: t.colors.surfaceHighlight,
    borderRadius: t.radius.sm,
  },
  backBtnText: {
    fontSize: 13,
    color: t.colors.primary,
    fontWeight: "600" as const,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  subjectCard: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: t.colors.background,
  },

  subjectTitleRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    justifyContent: "space-between" as const,
    gap: 12,
  },

  subjectText: {
    flex: 1,
    fontSize: 20,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    lineHeight: 26,
  },

  subjectStarBtn: {
    paddingTop: 3,
    paddingLeft: 4,
  },

  subjectMetaRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "flex-end" as const,
    marginTop: 6,
  },

  summarizePill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: t.colors.brandSecondarySubtle,
    borderRadius: t.radius.full,
  },
  summarizePillText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.brandSecondary,
  },
  summaryCard: {
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.brandSecondarySubtle,
    borderRadius: t.radius.lg,
  },
  summaryHeaderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  summaryHeaderLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    flex: 1,
    flexWrap: "wrap" as const,
  },
  summaryHeaderRight: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  stalePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(245, 158, 11, 0.14)",
    borderRadius: t.radius.full,
  },
  stalePillText: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: "#d97706",
  },
  summaryIconBtn: {
    padding: 6,
    borderRadius: t.radius.sm,
  },
  spinningIcon: {
    opacity: 0.55,
  },
  summaryLoadingRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginTop: 10,
  },
  summaryLoadingText: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  summaryBody: {
    marginTop: 8,
    gap: 8,
  },
  summaryTldr: {
    fontSize: 13,
    lineHeight: 19,
    color: t.colors.textPrimary,
  },
  summarySection: {
    gap: 4,
  },
  summarySectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.colors.border,
    marginBottom: 6,
  },
  summarySectionTitle: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: t.colors.textSecondary,
    marginBottom: 2,
  },
  summaryBulletRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 6,
  },
  summaryBulletDot: {
    fontSize: 12,
    lineHeight: 18,
    color: t.colors.brandSecondary,
  },
  summaryBulletText: {
    fontSize: 12,
    lineHeight: 18,
    color: t.colors.textSecondary,
    flex: 1,
  },
  actionItemRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 6,
    paddingVertical: 6,
  },
  actionItemDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
  },
  messagesList: {
    paddingVertical: 10,
    gap: 10,
  },
  superCollapseRow: {
    marginHorizontal: 12,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingVertical: 6,
  },
  superCollapseTrack: {
    flex: 1,
    position: "relative" as const,
    paddingVertical: 10,
  },
  superCollapseHairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.colors.border,
  },
  stackedDeckLip: {
    position: "absolute" as const,
    left: 0,
    right: 0,
    top: 4,
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.colors.border,
    opacity: 0.5,
  },
  superCollapsePill: {
    minHeight: 32,
    minWidth: 40,
    paddingHorizontal: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.full,
  },
  superCollapsePillText: {
    fontSize: 12,
    fontWeight: "700" as const,
    fontVariant: ["tabular-nums"] as const,
    color: t.colors.textSecondary,
  },
  collapsedCard: {
    marginHorizontal: 12,
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
  },
  collapsedContent: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  collapsedTopRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: t.colors.primary,
  },
  collapsedTimeText: {
    fontSize: 12,
    fontVariant: ["tabular-nums"] as const,
    color: t.colors.textMuted,
  },

  collapsedSender: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },

  collapsedSnippet: {
    fontSize: 13,
    color: t.colors.textMuted,
  },

  expandedCard: {
    marginHorizontal: 12,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.lg,
    overflow: "hidden" as const,
  },
  expandedHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
    gap: 10,
  },

  senderCol: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },

  senderFullName: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    flex: 1,
  },

  msgTimeText: {
    fontSize: 12,
    fontVariant: ["tabular-nums"] as const,
    color: t.colors.textMuted,
  },
  quickReplyIconBtn: {
    width: 32,
    height: 32,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: t.radius.sm,
  },
  recipientRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingVertical: 2,
  },
  detailsBlock: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
    gap: 3,
  },
  detailsLine: {
    fontSize: 11,
    lineHeight: 15,
    color: t.colors.textSecondary,
  },

  recipientSubText: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  bodyWrapper: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
    backgroundColor: "#ffffff",
  },

  attachmentsSection: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  attachmentsTitle: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
    marginBottom: 8,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  attachmentsGrid: {
    gap: 8,
  },
  attachmentChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  attDetails: {
    flex: 1,
  },
  attFilename: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  attSize: {
    fontSize: 10,
    color: t.colors.textMuted,
  },

  bottomActionBar: {
    backgroundColor: t.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  replyIconBtn: {
    width: 44,
    height: 44,
    shrink: 0,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceHighlight,
  },
  replyActionBtn: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceHighlight,
  },
  replyActionText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    minWidth: 0,
  },
})
