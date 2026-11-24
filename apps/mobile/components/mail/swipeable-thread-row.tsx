import React, { useRef } from "react"
import { View, Text, StyleSheet, Pressable } from "react-native"
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable"
import Animated, {
  useAnimatedStyle,
  interpolate,
  type SharedValue,
} from "react-native-reanimated"
import {
  Archive,
  Trash2,
  Mail,
  MailOpen,
  Star,
  Paperclip,
} from "lucide-react-native"
import type { Thread } from "@saturn/api/saturn/mail/v1/mail"
import { formatThreadParticipants, parseDate } from "@saturn/core"
import { useTimezone, useI18n } from "@saturn/hooks"
import type { TranslationKey } from "@saturn/i18n"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { ThreadAvatar } from "./thread-avatar"

export interface SwipeableThreadRowProps {
  thread: Thread
  accountColor?: string
  accountEmail?: string
  onPress: (thread: Thread) => void
  onArchive: (thread: Thread) => void
  onTrash: (thread: Thread) => void
  onToggleRead: (thread: Thread) => void
  onToggleStar: (thread: Thread) => void
}

function formatRelativeTime(
  dateStr: string | undefined,
  tz: ReturnType<typeof useTimezone>,
  t: (key: TranslationKey) => string
): string {
  if (!dateStr) return ""
  const date = parseDate(dateStr)
  if (!date) return ""

  const diffMs = tz.now().getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return t("common.now")
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24 && tz.isToday(date)) return `${diffHours}h`
  if (tz.isYesterday(date)) return t("common.yesterday")
  if (diffDays < 7) {
    return tz.format(date, { weekday: "short" })
  }
  return tz.format(date, { month: "short", day: "numeric" })
}

interface LeftSwipeActionProps {
  drag: SharedValue<number>
  testID: string
  label: string
  onPress: () => void
}

function LeftSwipeAction({
  drag,
  testID,
  label,
  onPress,
}: LeftSwipeActionProps) {
  const styles = useThemedStyles(createStyles)
  const containerStyle = useAnimatedStyle(() => {
    // Only fade in container background after deliberate horizontal drag
    const opacity = interpolate(drag.value, [12, 32], [0, 1], "clamp")
    return { opacity }
  })

  const contentStyle = useAnimatedStyle(() => {
    const scale = interpolate(drag.value, [12, 80], [0.5, 1], "clamp")
    const opacity = interpolate(drag.value, [16, 44], [0, 1], "clamp")
    return { transform: [{ scale }], opacity }
  })

  return (
    <Animated.View style={[styles.leftAction, containerStyle]}>
      <Pressable
        testID={testID}
        onPress={onPress}
        style={styles.actionPressable}
      >
        <Animated.View style={[styles.actionContent, contentStyle]}>
          <Archive size={22} color="#ffffff" />
          <Text style={styles.actionText}>{label}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

interface RightSwipeActionsProps {
  drag: SharedValue<number>
  threadId: string
  isUnread: boolean
  readLabel: string
  unreadLabel: string
  trashLabel: string
  onToggleRead: () => void
  onTrash: () => void
}

function RightSwipeActions({
  drag,
  threadId,
  isUnread,
  readLabel,
  unreadLabel,
  trashLabel,
  onToggleRead,
  onTrash,
}: RightSwipeActionsProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const containerStyle = useAnimatedStyle(() => {
    // Only fade in container background after deliberate horizontal drag
    const opacity = interpolate(drag.value, [-32, -12], [1, 0], "clamp")
    return { opacity }
  })

  const contentStyle = useAnimatedStyle(() => {
    const scale = interpolate(drag.value, [-140, -40], [1, 0.5], "clamp")
    const opacity = interpolate(drag.value, [-44, -16], [1, 0], "clamp")
    return { transform: [{ scale }], opacity }
  })

  return (
    <Animated.View style={[styles.rightActionsContainer, containerStyle]}>
      {/* Toggle Read */}
      <Pressable
        testID={`thread-row-read-action-${threadId}`}
        onPress={onToggleRead}
        style={[styles.rightAction, { backgroundColor: colors.primaryDark }]}
      >
        <Animated.View style={[styles.actionContent, contentStyle]}>
          {isUnread ? (
            <MailOpen size={20} color="#ffffff" />
          ) : (
            <Mail size={20} color="#ffffff" />
          )}
          <Text style={styles.actionText}>
            {isUnread ? readLabel : unreadLabel}
          </Text>
        </Animated.View>
      </Pressable>

      {/* Trash */}
      <Pressable
        testID={`thread-row-trash-action-${threadId}`}
        onPress={onTrash}
        style={[styles.rightAction, { backgroundColor: colors.destructive }]}
      >
        <Animated.View style={[styles.actionContent, contentStyle]}>
          <Trash2 size={20} color="#ffffff" />
          <Text style={styles.actionText}>{trashLabel}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

export function SwipeableThreadRow({
  thread,
  accountColor,
  accountEmail,
  onPress,
  onArchive,
  onTrash,
  onToggleRead,
  onToggleStar,
}: SwipeableThreadRowProps) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const styles = useThemedStyles(createStyles)
  const resolvedAccountColor = accountColor ?? colors.primary
  const swipeableRef = useRef<SwipeableMethods>(null)

  const handleArchive = () => {
    haptics.selection()
    swipeableRef.current?.close()
    onArchive(thread)
  }

  const handleTrash = () => {
    haptics.selection()
    swipeableRef.current?.close()
    onTrash(thread)
  }

  const handleToggleRead = () => {
    haptics.selection()
    swipeableRef.current?.close()
    onToggleRead(thread)
  }

  const handleToggleStar = () => {
    haptics.selection()
    onToggleStar(thread)
  }

  const selfLowerSet = new Set(
    accountEmail ? [accountEmail.trim().toLowerCase()] : []
  )
  const externalParticipants = (thread.participants || []).filter(
    (p) => !p.email || !selfLowerSet.has(p.email.trim().toLowerCase())
  )
  const primarySender =
    externalParticipants.length > 0
      ? externalParticipants[0]
      : thread.participants?.[0]

  const tz = useTimezone()
  const senderNames = formatThreadParticipants({
    participants: thread.participants,
    selfEmails: accountEmail ? [accountEmail] : [],
    isSentBucket: Boolean(thread.inSent && !thread.inInbox),
  })

  const timeDisplay = formatRelativeTime(
    thread.lastMessageAt || thread.updateTime,
    tz,
    t
  )

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      testID={`thread-row-swipeable-${thread.id}`}
      renderLeftActions={(_progress, drag) => (
        <LeftSwipeAction
          drag={drag}
          testID={`thread-row-archive-action-${thread.id}`}
          label={t("mail.archive")}
          onPress={handleArchive}
        />
      )}
      renderRightActions={(_progress, drag) => (
        <RightSwipeActions
          drag={drag}
          threadId={thread.id}
          isUnread={Boolean(thread.isUnread)}
          readLabel={t("mail.read")}
          unreadLabel={t("mail.unread")}
          trashLabel={t("mail.trash")}
          onToggleRead={handleToggleRead}
          onTrash={handleTrash}
        />
      )}
      onSwipeableWillOpen={() => haptics.selection()}
      // Tuned for effortless horizontal swipes while preserving vertical scroll stability
      dragOffsetFromLeft={24}
      dragOffsetFromRight={-24}
      leftThreshold={40}
      rightThreshold={60}
      friction={1.5}
      overshootLeft={false}
      overshootRight={false}
    >
      <Pressable
        testID={`thread-row-${thread.id}`}
        onPress={() => onPress(thread)}
        style={({ pressed }) => [
          styles.rowContainer,
          thread.isUnread && styles.rowUnread,
          pressed && styles.rowPressed,
        ]}
      >
        {/* Sender Avatar */}
        <ThreadAvatar
          name={primarySender?.name}
          email={primarySender?.email}
          avatarUrl={primarySender?.avatarUrl}
          isVerified={primarySender?.isVerified}
          accountColor={resolvedAccountColor}
        />

        {/* Main Content Area */}
        <View style={styles.contentArea}>
          {/* Top Row: Sender + Timestamp */}
          <View style={styles.topRow}>
            <View style={styles.senderContainer}>
              {thread.isUnread && <View style={styles.unreadDot} />}
              <Text
                numberOfLines={1}
                style={[
                  styles.senderText,
                  thread.isUnread && styles.senderTextBold,
                ]}
              >
                {senderNames}
              </Text>
              {thread.messageCount > 1 && (
                <Text style={styles.messageCount}>({thread.messageCount})</Text>
              )}
            </View>

            <View style={styles.timeRow}>
              {resolvedAccountColor && (
                <View
                  style={[
                    styles.accountDot,
                    { backgroundColor: resolvedAccountColor },
                  ]}
                />
              )}
              <Text style={styles.timeText}>{timeDisplay}</Text>
            </View>
          </View>

          {/* Middle Row: Subject Line */}
          <Text
            numberOfLines={1}
            style={[
              styles.subjectText,
              thread.isUnread && styles.subjectTextBold,
            ]}
          >
            {thread.subject || t("mail.noSubject")}
          </Text>

          {/* Bottom Row: Snippet & Icons */}
          <View style={styles.bottomRow}>
            <Text numberOfLines={2} style={styles.snippetText}>
              {thread.snippet || ""}
            </Text>

            <View style={styles.iconTray}>
              {thread.hasAttachments && (
                <View style={styles.metaIcon}>
                  <Paperclip size={13} color={colors.textMuted} />
                </View>
              )}

              <Pressable
                testID={`thread-star-${thread.id}`}
                hitSlop={8}
                onPress={handleToggleStar}
                style={styles.starButton}
              >
                <Star
                  size={16}
                  color={thread.isStarred ? colors.warning : colors.textMuted}
                  fill={thread.isStarred ? colors.warning : "transparent"}
                />
              </Pressable>
            </View>
          </View>
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  rowContainer: {
    flexDirection: "row" as const,
    backgroundColor: t.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "flex-start" as const,
    gap: 12,
  },
  rowUnread: {
    backgroundColor: t.colors.surfaceElevated,
  },
  rowPressed: {
    backgroundColor: t.colors.surfaceHighlight,
  },
  contentArea: {
    flex: 1,
    gap: 3,
  },
  topRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  senderContainer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    flex: 1,
    marginRight: 8,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: t.colors.primary,
    marginRight: 6,
  },
  senderText: {
    fontSize: 14,
    color: t.colors.textPrimary,
    fontWeight: "400" as const,
    flexShrink: 1,
  },
  senderTextBold: {
    fontWeight: "700" as const,
  },
  messageCount: {
    fontSize: 12,
    color: t.colors.textMuted,
    marginLeft: 4,
    fontWeight: "500" as const,
  },
  timeRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
  },
  accountDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  timeText: {
    fontSize: 12,
    color: t.colors.textMuted,
    fontWeight: "400" as const,
  },
  subjectText: {
    fontSize: 14,
    color: t.colors.textSecondary,
    fontWeight: "400" as const,
  },
  subjectTextBold: {
    color: t.colors.textPrimary,
    fontWeight: "600" as const,
  },
  bottomRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    justifyContent: "space-between" as const,
    marginTop: 1,
  },
  snippetText: {
    fontSize: 13,
    color: t.colors.textMuted,
    lineHeight: 17,
    flex: 1,
    marginRight: 12,
  },
  iconTray: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingTop: 2,
  },
  metaIcon: {
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  starButton: {
    padding: 2,
  },
  leftAction: {
    backgroundColor: t.colors.success,
    width: 80,
  },
  actionPressable: {
    flex: 1,
    width: "100%" as const,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  rightActionsContainer: {
    flexDirection: "row" as const,
    width: 140,
  },
  rightAction: {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  actionContent: {
    justifyContent: "center" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  actionText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "600" as const,
  },
})
