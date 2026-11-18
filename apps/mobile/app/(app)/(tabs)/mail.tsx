import React, { useState, useMemo, useCallback, useEffect } from "react"
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native"
import { FlatList, RefreshControl } from "react-native-gesture-handler"
import { useRouter } from "expo-router"
import {
  Search,
  X,
  Edit,
  Inbox,
  AlertCircle,
  FileEdit,
} from "lucide-react-native"
import {
  useInfiniteMailThreads,
  useMailboxes,
  useModifyThread,
  useConnectedAccounts,
  useSyncConnectedAccount,
  useDrafts,
  useTimezone,
} from "@saturn/hooks"
import type {
  Thread,
  MailboxRole,
  Draft,
} from "@saturn/api/saturn/mail/v1/mail"
import { stripHtmlToPlainText } from "@saturn/core"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { useToast } from "@/components/ui/toast"
import { SwipeableThreadRow, AccountBucketBar } from "@/components/mail"

export default function MobileMailScreen() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const tz = useTimezone()
  const [selectedAccountId, setSelectedAccountId] = useState<
    string | undefined
  >()
  const [selectedRole, setSelectedRole] =
    useState<MailboxRole>("MAILBOX_ROLE_INBOX")
  const [isUnreadFilter, setIsUnreadFilter] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  // Reset account selection and search filters on workspace switch
  useEffect(() => {
    setSelectedAccountId(undefined)
    setSearchQuery("")
    setDebouncedSearch("")
    setIsUnreadFilter(false)
  }, [activeSpaceId])

  const { data: accountsData } = useConnectedAccounts()
  const accounts = useMemo(() => {
    return (accountsData?.accounts || []).filter(
      (a) =>
        a.enabledCapabilities?.includes("mail") ||
        a.enabledCapabilities?.includes("MAIL")
    )
  }, [accountsData])

  // Clear stale account ID if it does not belong to current workspace accounts
  useEffect(() => {
    if (
      accountsData &&
      selectedAccountId &&
      !accounts.some((a) => a.id === selectedAccountId)
    ) {
      setSelectedAccountId(undefined)
    }
  }, [accountsData, accounts, selectedAccountId])

  // Account lookup map for row colors
  const accountColorMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of accounts) {
      if (a.id) map.set(a.id, a.color || theme.colors.primary)
    }
    return map
  }, [accounts])

  const accountEmailMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of accounts) {
      if (a.id && a.email) map.set(a.id, a.email)
    }
    return map
  }, [accounts])

  const { data: mailboxesData } = useMailboxes(selectedAccountId)
  const unreadCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const mbx of mailboxesData?.mailboxes || []) {
      counts[mbx.systemRole] =
        (counts[mbx.systemRole] || 0) + (mbx.unreadCount || 0)
    }
    return counts
  }, [mailboxesData])

  // Query filter
  const threadsFilter = useMemo(() => {
    return {
      connectedAccountId: selectedAccountId || "",
      systemBucket: isUnreadFilter ? undefined : selectedRole,
      isUnread: isUnreadFilter ? true : undefined,
      query: debouncedSearch.trim() || undefined,
      pageSize: 50,
    }
  }, [selectedAccountId, selectedRole, isUnreadFilter, debouncedSearch])

  const isDraftsBucket =
    !isUnreadFilter && selectedRole === "MAILBOX_ROLE_DRAFTS"

  const {
    data: draftsData,
    isLoading: isDraftsLoading,
    isRefetching: isDraftsRefetching,
    refetch: refetchDrafts,
    error: draftsError,
  } = useDrafts(selectedAccountId, {
    enabled: isDraftsBucket,
  })

  const drafts = useMemo(() => {
    const raw = draftsData?.drafts || []
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return raw
    return raw.filter((d) => {
      const subjectMatch = (d.subject || "").toLowerCase().includes(q)
      const recipientMatch = (d.to || []).some(
        (p) =>
          p.email.toLowerCase().includes(q) ||
          (p.name || "").toLowerCase().includes(q)
      )
      const bodyMatch = stripHtmlToPlainText(d.bodyHtml || d.bodyText || "")
        .toLowerCase()
        .includes(q)
      return subjectMatch || recipientMatch || bodyMatch
    })
  }, [draftsData?.drafts, debouncedSearch])

  const {
    data: threadsData,
    isLoading,
    isRefetching,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
    error,
  } = useInfiniteMailThreads(threadsFilter)

  const syncMutation = useSyncConnectedAccount()
  const modifyMutation = useModifyThread()
  const toast = useToast()

  const [isManualRefreshing, setIsManualRefreshing] = useState(false)

  const threads = useMemo(() => {
    const seen = new Set<string>()
    const list: Thread[] = []
    for (const page of threadsData?.pages || []) {
      for (const t of page.threads || []) {
        if (!seen.has(t.id)) {
          seen.add(t.id)
          list.push(t)
        }
      }
    }
    return list
  }, [threadsData])

  const handleRefresh = useCallback(async () => {
    setIsManualRefreshing(true)
    haptics.light()
    try {
      if (selectedAccountId) {
        await syncMutation.mutateAsync({ id: selectedAccountId })
      }
      if (isDraftsBucket) {
        await refetchDrafts()
      } else {
        await refetch()
      }
    } catch {
      // Ignored
    } finally {
      setIsManualRefreshing(false)
    }
  }, [selectedAccountId, syncMutation, isDraftsBucket, refetchDrafts, refetch])

  const handleThreadPress = (thread: Thread) => {
    haptics.selection()
    router.push(`/(app)/mail/${thread.id}`)
  }

  const handleDraftPress = (draft: Draft) => {
    haptics.selection()
    router.push({
      pathname: "/modal/compose-mail",
      params: {
        draftId: draft.id,
        defaultAccountId:
          draft.connectedAccountId ||
          selectedAccountId ||
          accounts[0]?.id ||
          "",
      },
    })
  }

  const handleArchive = (thread: Thread) => {
    modifyMutation.mutate({
      id: thread.id,
      req: {
        id: thread.id,
        inInbox: false,
      },
    })
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

  const handleTrash = (thread: Thread) => {
    modifyMutation.mutate({
      id: thread.id,
      req: {
        id: thread.id,
        inTrash: true,
      },
    })
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

  const handleToggleRead = (thread: Thread) => {
    modifyMutation.mutate({
      id: thread.id,
      req: {
        id: thread.id,
        isUnread: !thread.isUnread,
      },
    })
  }

  const handleToggleStar = (thread: Thread) => {
    modifyMutation.mutate({
      id: thread.id,
      req: {
        id: thread.id,
        isStarred: !thread.isStarred,
      },
    })
  }

  const handleOpenCompose = () => {
    haptics.selection()
    router.push({
      pathname: "/modal/compose-mail",
      params: {
        defaultAccountId: selectedAccountId || accounts[0]?.id || "",
      },
    })
  }

  return (
    <View style={styles.container}>
      {/* Account & System Bucket Selector Bar */}
      <AccountBucketBar
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onSelectAccount={setSelectedAccountId}
        selectedRole={selectedRole}
        onSelectRole={(role) => {
          setIsUnreadFilter(false)
          setSelectedRole(role)
        }}
        isUnreadFilter={isUnreadFilter}
        onToggleUnreadFilter={() => setIsUnreadFilter((prev) => !prev)}
        unreadCounts={unreadCounts}
      />

      {/* Search Input Bar */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchInner}>
          <Search size={15} color={theme.colors.textMuted} />
          <TextInput
            testID="mobile-mail-search-input"
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text)
              setDebouncedSearch(text)
            }}
            placeholder="Search in mail..."
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <Pressable
              hitSlop={8}
              onPress={() => {
                setSearchQuery("")
                setDebouncedSearch("")
              }}
            >
              <X size={15} color={theme.colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Thread / Drafts List */}
      {isDraftsBucket ? (
        isDraftsLoading && !isDraftsRefetching ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : draftsError ? (
          <View style={styles.centerContainer}>
            <AlertCircle size={36} color={theme.colors.destructive} />
            <Text style={styles.errorText}>Failed to load drafts</Text>
            <Pressable style={styles.retryBtn} onPress={() => refetchDrafts()}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : drafts.length === 0 ? (
          <View style={styles.centerContainer}>
            <FileEdit size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>No drafts</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? "No drafts matched your search query."
                : "Saved message drafts will appear here."}
            </Text>
          </View>
        ) : (
          <FlatList
            data={drafts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const recipientsLabel =
                (item.to || []).map((p) => p.name || p.email).join(", ") ||
                "(No recipients)"
              const previewText = stripHtmlToPlainText(
                item.bodyHtml || item.bodyText || ""
              )
              const accColor =
                accountColorMap.get(item.connectedAccountId) ||
                theme.colors.primary
              const timeLabel = item.updateTime
                ? tz.format(item.updateTime, { month: "short", day: "numeric" })
                : ""

              return (
                <Pressable
                  testID={`mobile-draft-row-${item.id}`}
                  onPress={() => handleDraftPress(item)}
                  style={styles.draftRow}
                >
                  <View
                    style={[
                      styles.draftAccountBar,
                      { backgroundColor: accColor },
                    ]}
                  />
                  <View style={styles.draftRowBody}>
                    <View style={styles.draftRowTop}>
                      <Text numberOfLines={1} style={styles.draftRecipients}>
                        <Text style={styles.draftTag}>Draft · </Text>
                        {recipientsLabel}
                      </Text>
                      {timeLabel ? (
                        <Text style={styles.draftTime}>{timeLabel}</Text>
                      ) : null}
                    </View>
                    <Text numberOfLines={1} style={styles.draftSubject}>
                      {item.subject || "(No Subject)"}
                    </Text>
                    {previewText ? (
                      <Text numberOfLines={1} style={styles.draftSnippet}>
                        {previewText}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              )
            }}
            bounces={true}
            overScrollMode="never"
            refreshControl={
              <RefreshControl
                refreshing={isManualRefreshing}
                onRefresh={handleRefresh}
                tintColor={theme.colors.primary}
                colors={[theme.colors.primary]}
                progressViewOffset={Platform.OS === "android" ? 30 : 0}
              />
            }
            contentContainerStyle={styles.listContent}
          />
        )
      ) : isLoading && !isRefetching ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <AlertCircle size={36} color={theme.colors.destructive} />
          <Text style={styles.errorText}>Failed to load messages</Text>
          <Pressable style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : threads.length === 0 ? (
        <View style={styles.centerContainer}>
          <Inbox size={48} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>No conversations</Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery
              ? "No emails matched your search query."
              : "Your inbox is all caught up."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SwipeableThreadRow
              thread={item}
              accountColor={
                accountColorMap.get(item.connectedAccountId) ||
                theme.colors.primary
              }
              accountEmail={accountEmailMap.get(item.connectedAccountId)}
              onPress={handleThreadPress}
              onArchive={handleArchive}
              onTrash={handleTrash}
              onToggleRead={handleToggleRead}
              onToggleStar={handleToggleStar}
            />
          )}
          bounces={true}
          overScrollMode="never"
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) {
              fetchNextPage()
            }
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
              </View>
            ) : hasNextPage ? (
              <Pressable
                style={styles.loadMoreBtn}
                onPress={() => fetchNextPage()}
              >
                <Text style={styles.loadMoreText}>Load more conversations</Text>
              </Pressable>
            ) : undefined
          }
          refreshControl={
            <RefreshControl
              refreshing={isManualRefreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
              progressViewOffset={Platform.OS === "android" ? 30 : 0}
            />
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Floating Compose Button */}
      <Pressable
        testID="mobile-compose-fab"
        onPress={handleOpenCompose}
        style={styles.fab}
      >
        <Edit size={22} color={theme.colors.primaryForeground} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  searchBarContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  searchInner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    height: 38,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.textPrimary,
    paddingVertical: 0,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 8,
  },
  errorText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.colors.surfaceHighlight,
    borderRadius: theme.radius.sm,
  },
  retryBtnText: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginTop: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 80,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreBtn: {
    marginHorizontal: 16,
    marginVertical: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  draftRow: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: 10,
  },
  draftAccountBar: {
    width: 3,
    borderRadius: 2,
  },
  draftRowBody: {
    flex: 1,
    gap: 3,
  },
  draftRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  draftRecipients: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  draftTag: {
    color: theme.colors.destructive,
    fontWeight: "700",
  },
  draftTime: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  draftSubject: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  draftSnippet: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
})
