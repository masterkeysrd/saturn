import React from "react"
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native"
import {
  Inbox,
  Star,
  Mail,
  Send,
  FileEdit,
  Archive,
  Trash2,
  Layers,
} from "lucide-react-native"
import type { MailboxRole } from "@saturn/api/saturn/mail/v1/mail"
import type { ConnectedAccount } from "@saturn/api/saturn/platform/connector/v1/connector"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

export interface AccountBucketBarProps {
  accounts: ConnectedAccount[]
  selectedAccountId?: string
  onSelectAccount: (accountId?: string) => void
  selectedRole?: MailboxRole
  onSelectRole: (role: MailboxRole) => void
  isUnreadFilter?: boolean
  onToggleUnreadFilter: () => void
  unreadCounts?: Record<string, number>
}

interface BucketChip {
  role: MailboxRole
  label: string
  icon: typeof Inbox
}

const BUCKET_CHIPS: BucketChip[] = [
  { role: "MAILBOX_ROLE_INBOX", label: "Inbox", icon: Inbox },
  { role: "MAILBOX_ROLE_STARRED", label: "Starred", icon: Star },
  { role: "MAILBOX_ROLE_SENT", label: "Sent", icon: Send },
  { role: "MAILBOX_ROLE_DRAFTS", label: "Drafts", icon: FileEdit },
  { role: "MAILBOX_ROLE_ARCHIVE", label: "Archive", icon: Archive },
  { role: "MAILBOX_ROLE_TRASH", label: "Trash", icon: Trash2 },
]

export function AccountBucketBar({
  accounts,
  selectedAccountId,
  onSelectAccount,
  selectedRole = "MAILBOX_ROLE_INBOX",
  onSelectRole,
  isUnreadFilter = false,
  onToggleUnreadFilter,
  unreadCounts = {},
}: AccountBucketBarProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

  const handleSelectAccount = (id?: string) => {
    haptics.selection()
    onSelectAccount(id)
  }

  const handleSelectRole = (role: MailboxRole) => {
    haptics.selection()
    onSelectRole(role)
  }

  const handleToggleUnread = () => {
    haptics.selection()
    onToggleUnreadFilter()
  }

  return (
    <View style={styles.container}>
      {/* Top Row: Account Selector Chips */}
      {accounts.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.accountRow}
        >
          {/* All Accounts Pill */}
          <Pressable
            testID="mobile-account-filter-all"
            onPress={() => handleSelectAccount(undefined)}
            style={[
              styles.accountChip,
              !selectedAccountId && styles.accountChipActive,
            ]}
          >
            <Layers
              size={14}
              color={!selectedAccountId ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.accountChipText,
                !selectedAccountId && styles.accountChipTextActive,
              ]}
            >
              All Accounts
            </Text>
          </Pressable>

          {/* Individual Connected Accounts */}
          {accounts.map((acc) => {
            const isSelected = selectedAccountId === acc.id
            const dotColor = acc.color || colors.primary
            return (
              <Pressable
                key={acc.id}
                testID={`mobile-account-filter-${acc.id}`}
                onPress={() => handleSelectAccount(acc.id)}
                style={[
                  styles.accountChip,
                  isSelected && styles.accountChipActive,
                ]}
              >
                <View
                  style={[styles.accountDot, { backgroundColor: dotColor }]}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.accountChipText,
                    isSelected && styles.accountChipTextActive,
                  ]}
                >
                  {acc.displayName || acc.email}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      )}

      {/* Bottom Row: System Bucket Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.bucketRow}
      >
        {/* Quick Filter: Unread toggle chip */}
        <Pressable
          testID="mobile-bucket-unread-toggle"
          onPress={handleToggleUnread}
          style={[styles.bucketChip, isUnreadFilter && styles.bucketChipActive]}
        >
          <Mail
            size={13}
            color={isUnreadFilter ? colors.primary : colors.textMuted}
          />
          <Text
            style={[
              styles.bucketChipText,
              isUnreadFilter && styles.bucketChipTextActive,
            ]}
          >
            Unread
          </Text>
        </Pressable>

        {/* System Buckets */}
        {BUCKET_CHIPS.map((chip) => {
          const Icon = chip.icon
          const isSelected = !isUnreadFilter && selectedRole === chip.role
          const count = unreadCounts[chip.role] || 0

          return (
            <Pressable
              key={chip.role}
              testID={`mobile-bucket-${chip.role.toLowerCase()}`}
              onPress={() => handleSelectRole(chip.role)}
              style={[styles.bucketChip, isSelected && styles.bucketChipActive]}
            >
              <Icon
                size={13}
                color={isSelected ? colors.primary : colors.textMuted}
              />
              <Text
                style={[
                  styles.bucketChipText,
                  isSelected && styles.bucketChipTextActive,
                ]}
              >
                {chip.label}
              </Text>

              {count > 0 && (
                <View
                  style={[
                    styles.badgeContainer,
                    isSelected
                      ? styles.badgeContainerActive
                      : styles.badgeContainerInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      isSelected
                        ? styles.badgeTextActive
                        : styles.badgeTextInactive,
                    ]}
                  >
                    {count > 99 ? "99+" : count}
                  </Text>
                </View>
              )}
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    backgroundColor: t.colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
  },
  accountRow: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
    alignItems: "center" as const,
  },
  accountChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  accountChipActive: {
    backgroundColor: t.colors.primarySubtle,
    borderColor: t.colors.primary,
  },
  accountDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  accountChipText: {
    fontSize: 12,
    color: t.colors.textSecondary,
    fontWeight: "500" as const,
  },
  accountChipTextActive: {
    color: t.colors.primary,
    fontWeight: "700" as const,
  },
  bucketRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    alignItems: "center" as const,
  },
  bucketChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  bucketChipActive: {
    backgroundColor: t.colors.primarySubtle,
    borderColor: t.colors.primary,
  },
  bucketChipText: {
    fontSize: 12,
    color: t.colors.textMuted,
    fontWeight: "500" as const,
  },
  bucketChipTextActive: {
    color: t.colors.primary,
    fontWeight: "700" as const,
  },
  badgeContainer: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 9,
    marginLeft: 2,
  },
  badgeContainerActive: {
    backgroundColor: t.colors.primary,
  },
  badgeContainerInactive: {
    backgroundColor: t.colors.surfaceElevated,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700" as const,
  },
  badgeTextActive: {
    color: t.colors.primaryForeground,
  },
  badgeTextInactive: {
    color: t.colors.textMuted,
  },
})
