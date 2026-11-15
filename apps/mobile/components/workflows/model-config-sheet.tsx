import { forwardRef, useState } from "react"
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import {
  useListAgentsQuery,
  useListProvidersQuery,
} from "@saturn/api/saturn/platform/agent/v1/agent"
import type { ModelConfig } from "@saturn/api/saturn/platform/workflow/v1/workflow"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

interface ModelConfigSheetProps {
  value?: ModelConfig
  defaultLabel?: string
  onSave: (next?: ModelConfig) => void
  onClose: () => void
}

type ModelStrategy = "default" | "agent" | "custom"

export const ModelConfigSheet = forwardRef<BottomSheet, ModelConfigSheetProps>(
  ({ value, defaultLabel = "Workspace Default", onSave, onClose }, ref) => {
    const { data: agentsData } = useListAgentsQuery({})
    const { data: providersData } = useListProvidersQuery({})
    const agents = agentsData?.agents ?? []
    const providers = providersData?.providers ?? []

    const initialStrategy: ModelStrategy = value?.agentId
      ? "agent"
      : value?.providerId || value?.modelName
        ? "custom"
        : "default"

    const [strategy, setStrategy] = useState<ModelStrategy>(initialStrategy)
    const [agentId, setAgentId] = useState(value?.agentId ?? "")
    const [providerId, setProviderId] = useState(value?.providerId ?? "")
    const [modelName, setModelName] = useState(value?.modelName ?? "")
    const [tempStr, setTempStr] = useState(String(value?.temperature ?? 0))

    const handleApply = () => {
      if (strategy === "custom" && !modelName.trim()) {
        haptics.error()
        return
      }
      haptics.success()
      if (strategy === "default") {
        onSave(undefined)
      } else if (strategy === "agent") {
        onSave({ agentId: agentId || agents[0]?.id })
      } else {
        const parsedTemp = parseFloat(tempStr)
        onSave({
          providerId: providerId || undefined,
          modelName: modelName.trim(),
          temperature: Number.isNaN(parsedTemp) ? 0 : parsedTemp,
        })
      }
      onClose()
    }

    return (
      <AppBottomSheet
        ref={ref}
        title="Model Configuration"
        snapPoints={["65%", "85%"]}
        onClose={onClose}
      >
        <BottomSheetScrollView contentContainerStyle={styles.body}>
          <View style={styles.segmentRow}>
            {(["default", "agent", "custom"] as const).map((s) => (
              <TouchableOpacity
                key={s}
                style={[
                  styles.segmentBtn,
                  strategy === s && styles.segmentBtnActive,
                ]}
                onPress={() => {
                  haptics.selection()
                  setStrategy(s)
                }}
              >
                <Text
                  style={[
                    styles.segmentText,
                    strategy === s && styles.segmentTextActive,
                  ]}
                >
                  {s === "default"
                    ? defaultLabel
                    : s === "agent"
                      ? "Named Agent"
                      : "Custom"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {strategy === "agent" && (
            <View style={styles.listSection}>
              <Text style={styles.fieldLabel}>Select Agent</Text>
              {agents.length === 0 ? (
                <Text style={styles.hintText}>No agents configured.</Text>
              ) : (
                agents.map((a) => {
                  const selected = a.id === agentId
                  return (
                    <TouchableOpacity
                      key={a.id}
                      style={[
                        styles.optionRow,
                        selected && styles.optionRowActive,
                      ]}
                      onPress={() => {
                        haptics.selection()
                        setAgentId(a.id ?? "")
                      }}
                    >
                      <Text style={styles.optionTitle}>{a.name}</Text>
                      <Text style={styles.optionSub}>{a.modelName}</Text>
                    </TouchableOpacity>
                  )
                })
              )}
            </View>
          )}

          {strategy === "custom" && (
            <View style={styles.listSection}>
              <Text style={styles.fieldLabel}>Provider Connection</Text>
              {providers.map((p) => {
                const selected = p.id === providerId
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.optionRow,
                      selected && styles.optionRowActive,
                    ]}
                    onPress={() => {
                      haptics.selection()
                      setProviderId(selected ? "" : (p.id ?? ""))
                    }}
                  >
                    <Text style={styles.optionTitle}>{p.name}</Text>
                    <Text style={styles.optionSub}>{p.compatibilityMode}</Text>
                  </TouchableOpacity>
                )
              })}

              <Text style={styles.fieldLabel}>Model Name *</Text>
              <TextInput
                style={styles.input}
                value={modelName}
                onChangeText={setModelName}
                placeholder="e.g. gpt-4o, claude-sonnet-4, llama3"
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="none"
              />

              <Text style={styles.fieldLabel}>Temperature (0 - 2)</Text>
              <TextInput
                style={styles.input}
                value={tempStr}
                onChangeText={setTempStr}
                keyboardType="decimal-pad"
                placeholder="0.0"
                placeholderTextColor={theme.colors.textMuted}
              />
            </View>
          )}

          <Button
            onPress={handleApply}
            disabled={strategy === "custom" && !modelName.trim()}
            style={styles.saveBtn}
          >
            Apply Model Settings
          </Button>
        </BottomSheetScrollView>
      </AppBottomSheet>
    )
  }
)

ModelConfigSheet.displayName = "ModelConfigSheet"

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
  },
  segmentBtnActive: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primary,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  segmentTextActive: {
    color: theme.colors.primary,
  },
  listSection: {
    gap: 10,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  hintText: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  optionRow: {
    padding: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  optionRowActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  optionSub: {
    fontSize: 12,
    fontFamily: theme.typography.mono,
    color: theme.colors.textMuted,
  },
  input: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: theme.typography.mono,
    color: theme.colors.textPrimary,
  },
  saveBtn: {
    marginTop: 8,
  },
})
