import React, { useRef, useState } from "react"
import { View, Text, StyleSheet, Pressable, Image } from "react-native"
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
  Check,
} from "lucide-react-native"
import type { Thread } from "@saturn/api/saturn/mail/v1/mail"
import { formatThreadParticipants } from "@saturn/core"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

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

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return ""
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return ""

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "Now"
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: "short" })
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

const PALETTE_COLORS = [
  { bg: "#312e81", text: "#c7d2fe" }, // Indigo
  { bg: "#064e3b", text: "#a7f3d0" }, // Emerald
  { bg: "#4c1d95", text: "#ddd6fe" }, // Violet
  { bg: "#78350f", text: "#fde68a" }, // Amber
  { bg: "#881337", text: "#fecdd3" }, // Rose
  { bg: "#0c4a6e", text: "#bae6fd" }, // Sky
  { bg: "#134e4a", text: "#99f6e4" }, // Teal
  { bg: "#7c2d12", text: "#fed7aa" }, // Orange
]

function getPalette(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  const idx = Math.abs(hash) % PALETTE_COLORS.length
  return PALETTE_COLORS[idx]
}

function getInitials(name?: string, email?: string): string {
  const cleanName = (name || "").trim()
  if (cleanName) {
    const parts = cleanName.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return cleanName.slice(0, 2).toUpperCase()
  }
  if (email) {
    return email.charAt(0).toUpperCase()
  }
  return "U"
}

interface ThreadAvatarProps {
  name?: string
  email?: string
  avatarUrl?: string
  isVerified?: boolean
  accountColor?: string
}

function ThreadAvatar({
  name,
  email,
  avatarUrl,
  isVerified,
  accountColor,
}: ThreadAvatarProps) {
  const [imgError, setImgError] = useState(false)
  const initials = getInitials(name, email)
  const palette = getPalette(name || email || "sender")
  const showImage = Boolean(avatarUrl && !imgError)

  return (
    <View
      testID="mobile-sender-avatar"
      style={[
        styles.avatarWrapper,
        accountColor ? { borderColor: accountColor } : null,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: avatarUrl }}
          onError={() => setImgError(true)}
          style={styles.avatarImage}
          resizeMode="contain"
        />
      ) : (
        <View style={[styles.avatarFallback, { backgroundColor: palette.bg }]}>
          <Text style={[styles.avatarInitialsText, { color: palette.text }]}>
            {initials}
          </Text>
        </View>
      )}

      {/* Verified Organization Checkmark Badge */}
      {isVerified && (
        <View
          testID="mobile-avatar-verified-badge"
          style={styles.verifiedCheckBadge}
        >
          <Check size={8} color="#ffffff" strokeWidth={3} />
        </View>
      )}
    </View>
  )
}

interface LeftSwipeActionProps {
  drag: SharedValue<number>
  testID: string
  onPress: () => void
}

function LeftSwipeAction({ drag, testID, onPress }: LeftSwipeActionProps) {
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
          <Text style={styles.actionText}>Archive</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

interface RightSwipeActionsProps {
  drag: SharedValue<number>
  threadId: string
  isUnread: boolean
  onToggleRead: () => void
  onTrash: () => void
}

function RightSwipeActions({
  drag,
  threadId,
  isUnread,
  onToggleRead,
  onTrash,
}: RightSwipeActionsProps) {
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
        style={[
          styles.rightAction,
          { backgroundColor: theme.colors.primaryDark },
        ]}
      >
        <Animated.View style={[styles.actionContent, contentStyle]}>
          {isUnread ? (
            <MailOpen size={20} color="#ffffff" />
          ) : (
            <Mail size={20} color="#ffffff" />
          )}
          <Text style={styles.actionText}>{isUnread ? "Read" : "Unread"}</Text>
        </Animated.View>
      </Pressable>

      {/* Trash */}
      <Pressable
        testID={`thread-row-trash-action-${threadId}`}
        onPress={onTrash}
        style={[
          styles.rightAction,
          { backgroundColor: theme.colors.destructive },
        ]}
      >
        <Animated.View style={[styles.actionContent, contentStyle]}>
          <Trash2 size={20} color="#ffffff" />
          <Text style={styles.actionText}>Trash</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

export function SwipeableThreadRow({
  thread,
  accountColor = theme.colors.primary,
  accountEmail,
  onPress,
  onArchive,
  onTrash,
  onToggleRead,
  onToggleStar,
}: SwipeableThreadRowProps) {
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

  const senderNames = formatThreadParticipants({
    participants: thread.participants,
    selfEmails: accountEmail ? [accountEmail] : [],
    isSentBucket: Boolean(thread.inSent && !thread.inInbox),
  })

  const timeDisplay = formatRelativeTime(
    thread.lastMessageAt || thread.updateTime
  )

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      testID={`thread-row-swipeable-${thread.id}`}
      renderLeftActions={(_progress, drag) => (
        <LeftSwipeAction
          drag={drag}
          testID={`thread-row-archive-action-${thread.id}`}
          onPress={handleArchive}
        />
      )}
      renderRightActions={(_progress, drag) => (
        <RightSwipeActions
          drag={drag}
          threadId={thread.id}
          isUnread={Boolean(thread.isUnread)}
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
          accountColor={accountColor}
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
              {accountColor && (
                <View
                  style={[styles.accountDot, { backgroundColor: accountColor }]}
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
            {thread.subject || "(No Subject)"}
          </Text>

          {/* Bottom Row: Snippet & Icons */}
          <View style={styles.bottomRow}>
            <Text numberOfLines={2} style={styles.snippetText}>
              {thread.snippet || ""}
            </Text>

            <View style={styles.iconTray}>
              {thread.hasAttachments && (
                <View style={styles.metaIcon}>
                  <Paperclip size={13} color={theme.colors.textMuted} />
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
                  color={thread.isStarred ? "#eab308" : theme.colors.textMuted}
                  fill={thread.isStarred ? "#eab308" : "transparent"}
                />
              </Pressable>
            </View>
          </View>
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  )
}

const styles = StyleSheet.create({
  rowContainer: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "flex-start",
    gap: 12,
  },
  rowUnread: {
    backgroundColor: theme.colors.surfaceElevated,
  },
  rowPressed: {
    backgroundColor: theme.colors.surfaceHighlight,
  },
  avatarWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: "transparent",
    position: "relative",
    marginTop: 2,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 19,
    backgroundColor: "#ffffff",
  },
  avatarFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitialsText: {
    fontSize: 13,
    fontWeight: "700",
  },
  verifiedCheckBadge: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: theme.colors.surface,
  },
  contentArea: {
    flex: 1,
    gap: 3,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  senderContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
    marginRight: 6,
  },
  senderText: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: "400",
    flexShrink: 1,
  },
  senderTextBold: {
    fontWeight: "700",
  },
  messageCount: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginLeft: 4,
    fontWeight: "500",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  accountDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  timeText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: "400",
  },
  subjectText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: "400",
  },
  subjectTextBold: {
    color: theme.colors.textPrimary,
    fontWeight: "600",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 1,
  },
  snippetText: {
    fontSize: 13,
    color: theme.colors.textMuted,
    lineHeight: 17,
    flex: 1,
    marginRight: 12,
  },
  iconTray: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 2,
  },
  metaIcon: {
    justifyContent: "center",
    alignItems: "center",
  },
  starButton: {
    padding: 2,
  },
  leftAction: {
    backgroundColor: theme.colors.success,
    width: 80,
  },
  actionPressable: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  rightActionsContainer: {
    flexDirection: "row",
    width: 140,
  },
  rightAction: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  actionContent: {
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  actionText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "600",
  },
})
