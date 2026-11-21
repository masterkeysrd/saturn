import { forwardRef, useEffect, useState } from "react"
import { Switch, Text, TouchableOpacity, View } from "react-native"
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet"
import { useI18n } from "@saturn/hooks"
import type { TranslationKey } from "@saturn/i18n"
import { useListModelsQuery } from "@saturn/api/saturn/platform/ai/v1/ai"
import type { ModelConfig } from "@saturn/api/saturn/platform/workflow/v1/workflow"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { ProviderLogo } from "@/components/ai/provider-logo"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

interface ModelConfigSheetProps {
  value?: ModelConfig
  defaultLabelKey?: TranslationKey
  onSave: (next?: ModelConfig) => void
  onClose: () => void
}

type ModelStrategy = "default" | "role" | "model"

const ROLE_OPTIONS: {
  id: "default" | "fast" | "reasoning"
  labelKey: TranslationKey
}[] = [
  { id: "default", labelKey: "workflows.model.roleDefault" },
  { id: "fast", labelKey: "workflows.model.roleFast" },
  { id: "reasoning", labelKey: "workflows.model.roleReasoning" },
]

export const ModelConfigSheet = forwardRef<BottomSheet, ModelConfigSheetProps>(
  (
    {
      value,
      defaultLabelKey = "workflows.model.workspaceDefault",
      onSave,
      onClose,
    },
    ref
  ) => {
    const { colors, isDark } = useTheme()
    const styles = useThemedStyles(createStyles)
    const { t } = useI18n()
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

    useEffect(() => {
      const nextStrategy: ModelStrategy = value?.modelId
        ? "model"
        : value?.role
          ? "role"
          : "default"
      setStrategy(nextStrategy)
      setRole(value?.role ?? "default")
      setModelId(value?.modelId ?? "")
      setTempStr(
        value?.generation?.temperature !== undefined
          ? String(value.generation.temperature)
          : ""
      )
      setThinkingEnabled(Boolean(value?.generation?.thinking?.enabled))
    }, [value])

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
        title={t("workflows.mobile.modelConfig")}
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
                    ? t(defaultLabelKey)
                    : s === "role"
                      ? t("workflows.model.roleSlot")
                      : t("workflows.model.specificModel")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {strategy === "role" && (
            <View style={styles.listSection}>
              <Text style={styles.fieldLabel}>
                {t("workflows.model.workspaceRole")}
              </Text>
              {ROLE_OPTIONS.map((r) => {
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
                    <Text style={styles.optionTitle}>{t(r.labelKey)}</Text>
                    <Text style={styles.optionSub}>{r.id}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}

          {strategy === "model" && (
            <View style={styles.listSection}>
              <Text style={styles.fieldLabel}>
                {t("workflows.model.groupModels")}
              </Text>
              {models.length === 0 ? (
                <Text style={styles.hintText}>
                  {t("workflows.model.noModels")}
                </Text>
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
              <Text style={styles.fieldLabel}>
                {t("workflows.model.temperature")}
              </Text>
              <BottomSheetTextInput
                style={styles.input}
                value={tempStr}
                onChangeText={setTempStr}
                keyboardType="decimal-pad"
                keyboardAppearance={isDark ? "dark" : "light"}
                placeholder={t("workflows.model.modelDefault")}
                placeholderTextColor={colors.textMuted}
              />

              <View style={styles.switchRow}>
                <Text style={styles.fieldLabel}>
                  {t("workflows.model.extendedThinking")}
                </Text>
                <Switch
                  value={thinkingEnabled}
                  onValueChange={(v) => {
                    haptics.selection()
                    setThinkingEnabled(v)
                  }}
                  trackColor={{
                    false: colors.surfaceHighlight,
                    true: colors.primary,
                  }}
                />
              </View>
            </View>
          )}

          <Button onPress={handleApply} style={styles.saveBtn}>
            {t("workflows.mobile.applyModelSettings")}
          </Button>
        </BottomSheetScrollView>
      </AppBottomSheet>
    )
  }
)

ModelConfigSheet.displayName = "ModelConfigSheet"

const createStyles = (t: SaturnMobileTheme) => ({
  body: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  segmentRow: {
    flexDirection: "row" as const,
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: "center" as const,
  },
  segmentBtnActive: {
    backgroundColor: t.colors.primarySubtle,
    borderColor: t.colors.primary,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
  },
  segmentTextActive: {
    color: t.colors.primary,
  },
  listSection: {
    gap: 10,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: t.colors.textSecondary,
  },
  hintText: {
    fontSize: 13,
    color: t.colors.textMuted,
  },
  optionRow: {
    padding: 12,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  optionRowActive: {
    borderColor: t.colors.primary,
    backgroundColor: t.colors.primarySubtle,
  },
  modelLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    flex: 1,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  optionSub: {
    fontSize: 12,
    fontFamily: t.typography.mono,
    color: t.colors.textMuted,
  },
  input: {
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: t.typography.mono,
    color: t.colors.textPrimary,
  },
  switchRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: 4,
  },
  saveBtn: {
    marginTop: 8,
  },
})
