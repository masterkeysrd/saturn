import { forwardRef } from "react"
import { StyleSheet, Text, TouchableOpacity, View } from "react-native"
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import {
  useListAgentsQuery,
  useListModelsQuery,
} from "@saturn/api/saturn/platform/ai/v1/ai"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { ProviderLogo } from "./provider-logo"
import { Bot, Check, Sparkles } from "lucide-react-native"

interface AgentModelSheetProps {
  selectedAgentId?: string
  selectedModelId?: string
  onSelectAgent: (id?: string) => void
  onSelectModel: (id?: string) => void
  onClose: () => void
}

export const AgentModelSheet = forwardRef<BottomSheet, AgentModelSheetProps>(
  (
    { selectedAgentId, selectedModelId, onSelectAgent, onSelectModel, onClose },
    ref
  ) => {
    const { data: agentsData } = useListAgentsQuery({})
    const { data: modelsData } = useListModelsQuery({ isEnabled: true })

    const agents = (agentsData?.agents ?? []).filter((a) => a.isEnabled)
    const models = modelsData?.models ?? []

    return (
      <AppBottomSheet
        ref={ref}
        title="Assistant & Model"
        snapPoints={["65%", "90%"]}
        onClose={onClose}
      >
        <BottomSheetScrollView contentContainerStyle={styles.body}>
          <Text style={styles.sectionLabel}>AGENT</Text>
          {agents.map((a) => {
            const active = a.id === selectedAgentId
            return (
              <TouchableOpacity
                key={a.id}
                style={[styles.row, active && styles.rowActive]}
                onPress={() => {
                  haptics.selection()
                  onSelectAgent(a.id)
                  onClose()
                }}
              >
                <Bot
                  size={16}
                  color={active ? theme.colors.primary : theme.colors.textMuted}
                />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{a.name}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {a.description || a.slug}
                  </Text>
                </View>
                {active && <Check size={16} color={theme.colors.primary} />}
              </TouchableOpacity>
            )
          })}

          <Text style={[styles.sectionLabel, styles.sectionSpaced]}>MODEL</Text>
          <TouchableOpacity
            style={[styles.row, !selectedModelId && styles.rowActive]}
            onPress={() => {
              haptics.selection()
              onSelectModel(undefined)
              onClose()
            }}
          >
            <Sparkles size={16} color={theme.colors.primary} />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Workspace Default</Text>
              <Text style={styles.rowSub}>Uses workspace default model</Text>
            </View>
            {!selectedModelId && (
              <Check size={16} color={theme.colors.primary} />
            )}
          </TouchableOpacity>

          {models.map((m) => {
            const active = m.id === selectedModelId
            return (
              <TouchableOpacity
                key={m.id}
                style={[styles.row, active && styles.rowActive]}
                onPress={() => {
                  haptics.selection()
                  onSelectModel(m.id)
                  onClose()
                }}
              >
                <ProviderLogo driver={m.providerDriver} size={16} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{m.displayName}</Text>
                  <Text style={styles.rowSub}>{m.providerName}</Text>
                </View>
                {active && <Check size={16} color={theme.colors.primary} />}
              </TouchableOpacity>
            )
          })}
        </BottomSheetScrollView>
      </AppBottomSheet>
    )
  }
)

AgentModelSheet.displayName = "AgentModelSheet"

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  sectionSpaced: {
    marginTop: 12,
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
