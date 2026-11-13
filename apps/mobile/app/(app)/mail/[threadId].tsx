import React, { useState, useMemo, useEffect, useCallback } from "react"
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
import { useMailThread, useModifyThread } from "@saturn/hooks"
import type { Message, Attachment } from "@saturn/api/saturn/mail/v1/mail"
import { formatAttachmentBytes } from "@saturn/core"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { useToast } from "@/components/ui/toast"
import { MessageWebView } from "@/components/mail/message-webview"

export default function MobileThreadReaderScreen() {
  const router = useRouter()
  const { threadId } = useLocalSearchParams<{ threadId: string }>()

  const { data: thread, isLoading, error } = useMailThread(threadId)
  const modifyMutation = useModifyThread()
  const toast = useToast()

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

    if (Platform.OS === "web") {
      Linking.openURL(att.downloadUrl)
      return
    }

    try {
      const attKey = att.id || att.filename || "file"
      setDownloadingId(attKey)
      const filename = att.filename || "attachment"
      const destUri = `${FileSystem.cacheDirectory ?? ""}${attKey}_${filename}`

      const downloadRes = await FileSystem.downloadAsync(
        att.downloadUrl,
        destUri
      )

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
        <ActivityIndicator size="large" color={theme.colors.primary} />
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
                  color={thread.isStarred ? "#eab308" : theme.colors.textMuted}
                  fill={thread.isStarred ? "#eab308" : "transparent"}
                />
              </Pressable>

              <Pressable
                testID="mobile-thread-action-archive"
                hitSlop={8}
                onPress={handleArchive}
                style={styles.headerBtn}
              >
                <Archive size={19} color={theme.colors.textMuted} />
              </Pressable>

              <Pressable
                testID="mobile-thread-action-trash"
                hitSlop={8}
                onPress={handleTrash}
                style={styles.headerBtn}
              >
                <Trash2 size={19} color={theme.colors.textMuted} />
              </Pressable>

              {/* Create Calendar Event from Email Button */}
              <Pressable
                testID="mobile-thread-action-create-event"
                hitSlop={8}
                onPress={handleCreateEvent}
                style={[styles.headerBtn, styles.createEventBtn]}
              >
                <CalendarPlus size={18} color={theme.colors.primary} />
              </Pressable>
            </View>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
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
            const timeStr = msg.sentAt
              ? new Date(msg.sentAt).toLocaleString()
              : ""
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
                    <ChevronRight size={15} color={theme.colors.textMuted} />
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

                  <ChevronDown size={16} color={theme.colors.textMuted} />
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
                              <Paperclip
                                size={14}
                                color={theme.colors.primary}
                              />
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
                                  color={theme.colors.primary}
                                />
                              ) : (
                                <Download
                                  size={14}
                                  color={theme.colors.textMuted}
                                />
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
                    <Reply size={13} color={theme.colors.textSecondary} />
                    <Text style={styles.quickReplyBtnText}>Reply</Text>
                  </Pressable>
                </View>
              </View>
            )
          })}
        </View>
      </ScrollView>

      {/* Bottom Sticky Action Bar */}
      <View style={styles.bottomActionBar}>
        <Pressable
          testID="mobile-reply-btn"
          onPress={() => handleReply("DRAFT_MODE_REPLY")}
          style={styles.replyActionBarBtn}
        >
          <Reply size={15} color={theme.colors.textPrimary} />
          <Text style={styles.replyActionBarText}>Reply</Text>
        </Pressable>

        <Pressable
          testID="mobile-reply-all-btn"
          onPress={() => handleReply("DRAFT_MODE_REPLY_ALL")}
          style={styles.replyActionBarBtn}
        >
          <ReplyAll size={15} color={theme.colors.textPrimary} />
          <Text style={styles.replyActionBarText}>Reply All</Text>
        </Pressable>

        <Pressable
          testID="mobile-forward-btn"
          onPress={() => handleReply("DRAFT_MODE_FORWARD")}
          style={styles.replyActionBarBtn}
        >
          <Forward size={15} color={theme.colors.textPrimary} />
          <Text style={styles.replyActionBarText}>Forward</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingRight: 6,
  },
  headerBtn: {
    padding: 2,
  },
  createEventBtn: {
    backgroundColor: theme.colors.primarySubtle,
    borderRadius: theme.radius.sm,
    padding: 4,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorText: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  backBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.colors.surfaceHighlight,
    borderRadius: theme.radius.sm,
  },
  backBtnText: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  scrollContent: {
    paddingBottom: 90,
  },
  subjectCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  subjectText: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    lineHeight: 24,
  },
  subjectMeta: {
    fontSize: 12,
    color: theme.colors.textMuted,
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
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
  },
  collapsedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  avatarTiny: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTinyText: {
    fontSize: 9,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  collapsedSender: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    width: 90,
  },
  collapsedSnippet: {
    fontSize: 12,
    color: theme.colors.textMuted,
    flex: 1,
  },
  expandedCard: {
    marginHorizontal: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    overflow: "hidden",
  },
  expandedHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    gap: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.primarySubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  senderCol: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  senderFullName: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: 6,
  },
  msgTimeText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  recipientSubText: {
    fontSize: 11,
    color: theme.colors.textMuted,
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
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  attachmentsTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textMuted,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  attachmentsGrid: {
    gap: 8,
  },
  attachmentChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  attDetails: {
    flex: 1,
  },
  attFilename: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  attSize: {
    fontSize: 10,
    color: theme.colors.textMuted,
  },
  msgFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  quickReplyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.sm,
  },
  quickReplyBtnText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  bottomActionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 58,
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 16,
  },
  replyActionBarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceHighlight,
  },
  replyActionBarText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
})
