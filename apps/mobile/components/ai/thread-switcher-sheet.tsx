import { forwardRef } from "react"
import { Text, TouchableOpacity, View } from "react-native"
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useListThreadsQuery } from "@saturn/api/saturn/platform/ai/v1/ai"
import { useI18n, useTimezone } from "@saturn/hooks"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
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
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const tz = useTimezone()
  const { t } = useI18n()
  const { data } = useListThreadsQuery({
    isArchived: false,
    pageSize: 40,
    pageToken: "",
  })
  const threads = data?.threads ?? []

  return (
    <AppBottomSheet
      ref={ref}
      title={t("ai.chatMobile.chatSheetTitle")}
      snapPoints={["55%", "85%"]}
      onClose={onClose}
    >
      <BottomSheetScrollView contentContainerStyle={styles.body}>
        <Button
          variant="primary"
          size="md"
          leftIcon={<Plus size={16} color={colors.primaryForeground} />}
          onPress={() => {
            haptics.light()
            onSelectThread(null)
            onClose()
          }}
        >
          {t("ai.chatMobile.newChatThread")}
        </Button>

        {threads.length === 0 ? (
          <Text style={styles.emptyText}>
            {t("ai.chatMobile.noSavedThreads")}
          </Text>
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
                  color={selected ? colors.primary : colors.textMuted}
                />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {th.title || t("ai.chat.newChat")}
                  </Text>
                  <Text style={styles.rowSub}>
                    {th.agentName || t("ai.conversation.saturnAssistant")}
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

const createStyles = (t: SaturnMobileTheme) => ({
  body: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 10,
  },
  emptyText: {
    textAlign: "center" as const,
    paddingVertical: 20,
    fontSize: 13,
    color: t.colors.textMuted,
  },
  row: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    padding: 12,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  rowActive: {
    borderColor: t.colors.primary,
    backgroundColor: t.colors.primarySubtle,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  rowSub: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
})
