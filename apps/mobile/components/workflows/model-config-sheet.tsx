import { forwardRef, useState } from "react"
import {
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useListModelsQuery } from "@saturn/api/saturn/platform/ai/v1/ai"
import type { ModelConfig } from "@saturn/api/saturn/platform/workflow/v1/workflow"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { ProviderLogo } from "@/components/ai/provider-logo"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

interface ModelConfigSheetProps {
  value?: ModelConfig
  defaultLabel?: string
  onSave: (next?: ModelConfig) => void
  onClose: () => void
}

type ModelStrategy = "default" | "role" | "model"

export const ModelConfigSheet = forwardRef<BottomSheet, ModelConfigSheetProps>(
  ({ value, defaultLabel = "Workspace Default", onSave, onClose }, ref) => {
    const { data: modelsData } = useListModelsQuery({ isEnabled: true })
    const models = modelsData?.models ?? []

    const initialStrategy: ModelStrategy = value?.modelId
      ? "model"
      : value?.role
        ? "role"
        : "default"

    const [strategy, setStrategy] = useState<ModelStrategy>(initialStrategy)
    const [role, setRole] = useState(value?.role ?? "default")
    const [modelId, setModelId] = useState(value?.modelId ?? "")
    const [tempStr, setTempStr] = useState(
      value?.generation?.temperature !== undefined
        ? String(value.generation.temperature)
        : ""
    )
    const [thinkingEnabled, setThinkingEnabled] = useState(
      Boolean(value?.generation?.thinking?.enabled)
    )

    const handleApply = () => {
      haptics.success()
      if (strategy === "default") {
        onSave(undefined)
        onClose()
        return
      }

      const parsedTemp = parseFloat(tempStr)
      const generation =
        !Number.isNaN(parsedTemp) || thinkingEnabled
          ? {
              ...(!Number.isNaN(parsedTemp) && { temperature: parsedTemp }),
              ...(thinkingEnabled && {
                thinking: { enabled: true },
              }),
            }
          : undefined

      if (strategy === "role") {
        onSave({ role, generation })
      } else {
        onSave({
          modelId: modelId || models[0]?.id,
          generation,
        })
      }
      onClose()
    }

    return (
      <AppBottomSheet
        ref={ref}
        title="Model Configuration"
        snapPoints={["65%", "88%"]}
        onClose={onClose}
      >
        <BottomSheetScrollView contentContainerStyle={styles.body}>
          <View style={styles.segmentRow}>
            {(["default", "role", "model"] as const).map((s) => (
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
                    : s === "role"
                      ? "Role Slot"
                      : "Specific Model"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {strategy === "role" && (
            <View style={styles.listSection}>
              <Text style={styles.fieldLabel}>Workspace Role</Text>
              {(
                [
                  { id: "default", label: "Default" },
                  { id: "fast", label: "Fast (Low-latency)" },
                  { id: "reasoning", label: "Reasoning" },
                ] as const
              ).map((r) => {
                const selected = role === r.id
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={[
                      styles.optionRow,
                      selected && styles.optionRowActive,
                    ]}
                    onPress={() => {
                      haptics.selection()
                      setRole(r.id)
                    }}
                  >
                    <Text style={styles.optionTitle}>{r.label}</Text>
                    <Text style={styles.optionSub}>{r.id}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}

          {strategy === "model" && (
            <View style={styles.listSection}>
              <Text style={styles.fieldLabel}>Registered Models</Text>
              {models.length === 0 ? (
                <Text style={styles.hintText}>No enabled models found.</Text>
              ) : (
                models.map((m) => {
                  const selected = m.id === modelId
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[
                        styles.optionRow,
                        selected && styles.optionRowActive,
                      ]}
                      onPress={() => {
                        haptics.selection()
                        setModelId(m.id ?? "")
                      }}
                    >
                      <View style={styles.modelLeft}>
                        <ProviderLogo driver={m.providerDriver} size={15} />
                        <Text style={styles.optionTitle}>{m.displayName}</Text>
                      </View>
                      <Text style={styles.optionSub}>{m.providerName}</Text>
                    </TouchableOpacity>
                  )
                })
              )}
            </View>
          )}

          {strategy !== "default" && (
            <View style={styles.listSection}>
              <Text style={styles.fieldLabel}>Temperature (0 - 2)</Text>
              <TextInput
                style={styles.input}
                value={tempStr}
                onChangeText={setTempStr}
                keyboardType="decimal-pad"
                placeholder="Model default"
                placeholderTextColor={theme.colors.textMuted}
              />

              <View style={styles.switchRow}>
                <Text style={styles.fieldLabel}>Enable Extended Thinking</Text>
                <Switch
                  value={thinkingEnabled}
                  onValueChange={(v) => {
                    haptics.selection()
                    setThinkingEnabled(v)
                  }}
                  trackColor={{
                    false: theme.colors.surfaceHighlight,
                    true: theme.colors.primary,
                  }}
                />
              </View>
            </View>
          )}

          <Button onPress={handleApply} style={styles.saveBtn}>
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
  modelLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
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
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  saveBtn: {
    marginTop: 8,
  },
})
