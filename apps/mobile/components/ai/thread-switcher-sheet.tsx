import { forwardRef } from "react"
import { StyleSheet, Text, TouchableOpacity, View } from "react-native"
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useListThreadsQuery } from "@saturn/api/saturn/platform/ai/v1/ai"
import { useTimezone } from "@saturn/hooks"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { MessageSquare, Plus } from "lucide-react-native"

interface ThreadSwitcherSheetProps {
  activeThreadId?: string | null
  onSelectThread: (threadId: string | null) => void
  onClose: () => void
}

export const ThreadSwitcherSheet = forwardRef<
  BottomSheet,
  ThreadSwitcherSheetProps
>(({ activeThreadId, onSelectThread, onClose }, ref) => {
  const tz = useTimezone()
  const { data } = useListThreadsQuery({
    isArchived: false,
    pageSize: 40,
    pageToken: "",
  })
  const threads = data?.threads ?? []

  return (
    <AppBottomSheet
      ref={ref}
      title="Chat Threads"
      snapPoints={["55%", "85%"]}
      onClose={onClose}
    >
      <BottomSheetScrollView contentContainerStyle={styles.body}>
        <Button
          variant="primary"
          size="md"
          leftIcon={<Plus size={16} color={theme.colors.primaryForeground} />}
          onPress={() => {
            haptics.light()
            onSelectThread(null)
            onClose()
          }}
        >
          New Chat Thread
        </Button>

        {threads.length === 0 ? (
          <Text style={styles.emptyText}>No saved threads yet.</Text>
        ) : (
          threads.map((th) => {
            const selected = th.id === activeThreadId
            const ts = th.lastMessageAt || th.createTime
            return (
              <TouchableOpacity
                key={th.id}
                style={[styles.row, selected && styles.rowActive]}
                onPress={() => {
                  haptics.selection()
                  onSelectThread(th.id ?? null)
                  onClose()
                }}
              >
                <MessageSquare
                  size={16}
                  color={
                    selected ? theme.colors.primary : theme.colors.textMuted
                  }
                />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {th.title || "New Chat"}
                  </Text>
                  <Text style={styles.rowSub}>
                    {th.agentName || "Saturn Assistant"}
                    {ts ? ` · ${tz.format(ts, { dateStyle: "short" })}` : ""}
                  </Text>
                </View>
              </TouchableOpacity>
            )
          })
        )}
      </BottomSheetScrollView>
    </AppBottomSheet>
  )
})

ThreadSwitcherSheet.displayName = "ThreadSwitcherSheet"

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 10,
  },
  emptyText: {
    textAlign: "center",
    paddingVertical: 20,
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rowActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  rowSub: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
})
