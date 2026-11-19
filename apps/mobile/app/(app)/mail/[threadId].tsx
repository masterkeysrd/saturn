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
  Reply,
  ReplyAll,
  Forward,
  ChevronDown,
  ChevronRight,
  Download,
  Paperclip,
} from "lucide-react-native"
import { useMailThread, useModifyThread, useTimezone } from "@saturn/hooks"
import type { Message, Attachment } from "@saturn/api/saturn/mail/v1/mail"
import { formatAttachmentBytes } from "@saturn/core"
import { getApiBaseUrl } from "@/lib/config"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { useToast } from "@/components/ui/toast"
import { MessageWebView } from "@/components/mail/message-webview"

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

  const messages = useMemo(() => thread?.messages || [], [thread?.messages])

  // By default, in short threads expand all; in long threads, expand the latest and any unread
  useEffect(() => {
    if (messages.length > 0) {
      if (messages.length <= 2) {
        setExpandedIds(new Set(messages.map((m) => m.id)))
      } else {
        const initial = new Set<string>()
        // Expand latest message
        initial.add(messages[messages.length - 1].id)
        // Expand unread messages
        for (const m of messages) {
          if (m.isUnread) initial.add(m.id)
        }
        setExpandedIds(initial)
      }
    }
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

  // Header quick actions
  const handleToggleStar = () => {
    if (!thread) return
    haptics.selection()
    modifyMutation.mutate({
      id: thread.id,
      req: { id: thread.id, isStarred: !thread.isStarred },
    })
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
      title: "Conversation archived",
      type: "success",
      action: {
        label: "Undo",
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
      title: "Conversation moved to trash",
      type: "success",
      action: {
        label: "Undo",
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
        initialTitle: thread.subject || "Meeting from email",
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
  const handleDownloadAttachment = useCallback(async (att: Attachment) => {
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
            dialogTitle: `Share ${filename}`,
          })
        } else {
          Alert.alert("Downloaded", `Saved attachment to ${filename}`)
        }
      } else {
        Alert.alert("Download Error", "Could not download attachment.")
      }
    } catch (e: unknown) {
      const err = e as Error
      Alert.alert("Error", err.message || "Failed to download attachment")
    } finally {
      setDownloadingId(null)
    }
  }, [])

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (error || !thread) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Conversation not found</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go back</Text>
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
          ...(Platform.OS === "ios"
            ? {
                unstable_headerRightItems: () => [
                  {
                    type: "button",
                    label: thread.isStarred ? "Unstar" : "Star",
                    icon: {
                      type: "sfSymbol",
                      name: thread.isStarred ? "star.fill" : "star",
                    },
                    tintColor: thread.isStarred
                      ? "#eab308"
                      : colors.textPrimary,
                    onPress: handleToggleStar,
                  },
                  {
                    type: "button",
                    label: "Archive",
                    icon: { type: "sfSymbol", name: "archivebox" },
                    onPress: handleArchive,
                  },
                  {
                    type: "button",
                    label: "Delete",
                    icon: { type: "sfSymbol", name: "trash" },
                    tintColor: colors.destructive,
                    onPress: handleTrash,
                  },
                  {
                    type: "button",
                    label: "Create Event",
                    icon: { type: "sfSymbol", name: "calendar.badge.plus" },
                    tintColor: colors.primary,
                    sharesBackground: false,
                    onPress: handleCreateEvent,
                  },
                ],
              }
            : {
                headerRight: () => (
                  <View style={styles.headerRightActions}>
                    <Pressable
                      testID="mobile-thread-action-star"
                      hitSlop={8}
                      onPress={handleToggleStar}
                      style={styles.headerBtn}
                    >
                      <Star
                        size={19}
                        color={thread.isStarred ? "#eab308" : colors.textMuted}
                        fill={thread.isStarred ? "#eab308" : "transparent"}
                      />
                    </Pressable>

                    <Pressable
                      testID="mobile-thread-action-archive"
                      hitSlop={8}
                      onPress={handleArchive}
                      style={styles.headerBtn}
                    >
                      <Archive size={19} color={colors.textMuted} />
                    </Pressable>

                    <Pressable
                      testID="mobile-thread-action-trash"
                      hitSlop={8}
                      onPress={handleTrash}
                      style={styles.headerBtn}
                    >
                      <Trash2 size={19} color={colors.textMuted} />
                    </Pressable>

                    {/* Create Calendar Event from Email Button */}
                    <Pressable
                      testID="mobile-thread-action-create-event"
                      hitSlop={8}
                      onPress={handleCreateEvent}
                      style={[styles.headerBtn, styles.createEventBtn]}
                    >
                      <CalendarPlus size={18} color={colors.primary} />
                    </Pressable>
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
          <Text style={styles.subjectText}>
            {thread.subject || "(No Subject)"}
          </Text>
          <Text style={styles.subjectMeta}>
            {messages.length} {messages.length === 1 ? "message" : "messages"}
          </Text>
        </View>

        {/* Message Cards List */}
        <View style={styles.messagesList}>
          {messages.map((msg, index) => {
            const isExpanded = expandedIds.has(msg.id)
            const senderName = msg.from?.name || msg.from?.email || "Unknown"
            const timeStr = msg.sentAt ? tz.formatDateTime(msg.sentAt) : ""
            const initials = senderName.slice(0, 2).toUpperCase()

            if (!isExpanded) {
              // Collapsed 1-line accordion row
              return (
                <Pressable
                  key={msg.id}
                  testID={`message-collapsed-${msg.id}`}
                  onPress={() => toggleExpand(msg.id)}
                  style={styles.collapsedCard}
                >
                  <View style={styles.collapsedHeader}>
                    <View style={styles.avatarTiny}>
                      <Text style={styles.avatarTinyText}>{initials}</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.collapsedSender}>
                      {senderName}
                    </Text>
                    <Text numberOfLines={1} style={styles.collapsedSnippet}>
                      {msg.snippet || ""}
                    </Text>
                    <ChevronRight size={15} color={colors.textMuted} />
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
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>

                  <View style={styles.senderCol}>
                    <View style={styles.nameRow}>
                      <Text numberOfLines={1} style={styles.senderFullName}>
                        {senderName}
                      </Text>
                      <Text style={styles.msgTimeText}>{timeStr}</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.recipientSubText}>
                      to{" "}
                      {msg.to?.map((t) => t.name || t.email).join(", ") || "me"}
                    </Text>
                  </View>

                  <ChevronDown size={16} color={colors.textMuted} />
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
                      Attachments (
                      {msg.attachments.filter((a) => !a.isInline).length})
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

                {/* Message Quick Reply Button */}
                <View style={styles.msgFooter}>
                  <Pressable
                    testID={`quick-reply-btn-${msg.id}`}
                    onPress={() => handleReply("DRAFT_MODE_REPLY", msg)}
                    style={styles.quickReplyBtn}
                  >
                    <Reply size={13} color={colors.textSecondary} />
                    <Text style={styles.quickReplyBtnText}>Reply</Text>
                  </Pressable>
                </View>
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
          onPress={() => handleReply("DRAFT_MODE_REPLY")}
          style={styles.replyActionBarBtn}
        >
          <Reply size={15} color={colors.textPrimary} />
          <Text style={styles.replyActionBarText}>Reply</Text>
        </Pressable>

        <Pressable
          testID="mobile-reply-all-btn"
          onPress={() => handleReply("DRAFT_MODE_REPLY_ALL")}
          style={styles.replyActionBarBtn}
        >
          <ReplyAll size={15} color={colors.textPrimary} />
          <Text style={styles.replyActionBarText}>Reply All</Text>
        </Pressable>

        <Pressable
          testID="mobile-forward-btn"
          onPress={() => handleReply("DRAFT_MODE_FORWARD")}
          style={styles.replyActionBarBtn}
        >
          <Forward size={15} color={colors.textPrimary} />
          <Text style={styles.replyActionBarText}>Forward</Text>
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
    gap: 14,
    paddingRight: 6,
  },
  headerBtn: {
    padding: 2,
  },
  createEventBtn: {
    backgroundColor: t.colors.primarySubtle,
    borderRadius: t.radius.sm,
    padding: 4,
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
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  subjectText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    lineHeight: 24,
  },
  subjectMeta: {
    fontSize: 12,
    color: t.colors.textMuted,
    marginTop: 4,
  },
  messagesList: {
    paddingVertical: 10,
    gap: 10,
  },
  collapsedCard: {
    marginHorizontal: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
  },
  collapsedHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  avatarTiny: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: t.colors.surfaceElevated,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  avatarTinyText: {
    fontSize: 9,
    fontWeight: "700" as const,
    color: t.colors.textSecondary,
  },
  collapsedSender: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    width: 90,
  },
  collapsedSnippet: {
    fontSize: 12,
    color: t.colors.textMuted,
    flex: 1,
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
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: t.colors.primarySubtle,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: t.colors.primary,
  },
  senderCol: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  senderFullName: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    flex: 1,
    marginRight: 6,
  },
  msgTimeText: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  recipientSubText: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  bodyWrapper: {
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  msgFooter: {
    flexDirection: "row" as const,
    justifyContent: "flex-end" as const,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  quickReplyBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    backgroundColor: t.colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: t.radius.sm,
  },
  quickReplyBtnText: {
    fontSize: 12,
    color: t.colors.textSecondary,
    fontWeight: "500" as const,
  },
  bottomActionBar: {
    backgroundColor: t.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-around" as const,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  replyActionBarBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.surfaceHighlight,
  },
  replyActionBarText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
})
