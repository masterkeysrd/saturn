import { forwardRef, useEffect, useState } from "react"
import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native"
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet"
import type { WorkflowVariable } from "@saturn/core"
import type {
  Catalog_Loader,
  Flow_SourceBinding,
} from "@saturn/api/saturn/platform/workflow/v1/workflow"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { VariableChipPicker } from "./variable-chip-picker"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Plus, Trash2 } from "lucide-react-native"

interface SourceBindingSheetProps {
  sources: Record<string, Flow_SourceBinding>
  loaders: Catalog_Loader[]
  variables: WorkflowVariable[]
  onSave: (next: Record<string, Flow_SourceBinding>) => void
  onClose: () => void
}

export const SourceBindingSheet = forwardRef<
  BottomSheet,
  SourceBindingSheetProps
>(({ sources, loaders, variables, onSave, onClose }, ref) => {
  const [draft, setDraft] =
    useState<Record<string, Flow_SourceBinding>>(sources)

  useEffect(() => {
    setDraft(sources)
  }, [sources])

  const handleAdd = () => {
    haptics.light()
    let alias = "data"
    let n = 1
    while (draft[alias]) alias = `data_${n++}`
    setDraft({
      ...draft,
      [alias]: {
        loader: loaders[0]?.name ?? "finance.accounts",
        params: {},
        required: false,
      },
    })
  }

  const handleSave = () => {
    haptics.success()
    onSave(draft)
    onClose()
  }

  return (
    <AppBottomSheet
      ref={ref}
      title="Data Sources"
      snapPoints={["70%", "92%"]}
      onClose={onClose}
    >
      <BottomSheetScrollView contentContainerStyle={styles.body}>
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
          <Plus size={16} color={theme.colors.primary} />
          <Text style={styles.addText}>Add Data Loader</Text>
        </TouchableOpacity>

        {Object.entries(draft).map(([alias, binding]) => {
          const desc = loaders.find((l) => l.name === binding.loader)
          const schemaProps =
            desc?.paramsSchema &&
            typeof desc.paramsSchema.properties === "object" &&
            desc.paramsSchema.properties
              ? Object.keys(
                  desc.paramsSchema.properties as Record<string, unknown>
                )
              : []

          return (
            <View key={alias} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.aliasLabel}>sources.{alias}</Text>
                <TouchableOpacity
                  onPress={() => {
                    haptics.light()
                    const next = { ...draft }
                    delete next[alias]
                    setDraft(next)
                  }}
                >
                  <Trash2 size={16} color={theme.colors.destructive} />
                </TouchableOpacity>
              </View>

              <Text style={styles.subLabel}>Loader</Text>
              <View style={styles.loaderGrid}>
                {loaders.map((l) => {
                  const active = l.name === binding.loader
                  return (
                    <TouchableOpacity
                      key={l.name}
                      style={[
                        styles.loaderPill,
                        active && styles.loaderPillActive,
                      ]}
                      onPress={() => {
                        haptics.selection()
                        setDraft({
                          ...draft,
                          [alias]: {
                            ...binding,
                            loader: l.name ?? binding.loader,
                          },
                        })
                      }}
                    >
                      <Text
                        style={[
                          styles.loaderPillText,
                          active && styles.loaderPillTextActive,
                        ]}
                      >
                        {l.name}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              <View style={styles.rowBetween}>
                <Text style={styles.subLabel}>Required</Text>
                <Switch
                  value={Boolean(binding.required)}
                  onValueChange={(val) => {
                    haptics.selection()
                    setDraft({
                      ...draft,
                      [alias]: { ...binding, required: val },
                    })
                  }}
                  trackColor={{
                    false: theme.colors.surfaceHighlight,
                    true: theme.colors.primary,
                  }}
                />
              </View>

              {schemaProps.map((paramKey) => {
                const rawVal = (binding.params ?? {})[paramKey]
                const strVal =
                  typeof rawVal === "string"
                    ? rawVal
                    : rawVal !== undefined
                      ? JSON.stringify(rawVal)
                      : ""

                return (
                  <View key={paramKey} style={styles.paramBlock}>
                    <Text style={styles.paramKey}>{paramKey}</Text>
                    <BottomSheetTextInput
                      style={styles.input}
                      value={strVal}
                      onChangeText={(txt) => {
                        const nextParams = { ...(binding.params ?? {}) }
                        if (!txt) delete nextParams[paramKey]
                        else nextParams[paramKey] = txt
                        setDraft({
                          ...draft,
                          [alias]: { ...binding, params: nextParams },
                        })
                      }}
                      placeholder={`{{ input.${paramKey} }}`}
                      placeholderTextColor={theme.colors.textMuted}
                      autoCapitalize="none"
                    />
                    <VariableChipPicker
                      variables={variables}
                      currentValue={strVal}
                      onInsert={(nextTxt) =>
                        setDraft({
                          ...draft,
                          [alias]: {
                            ...binding,
                            params: {
                              ...(binding.params ?? {}),
                              [paramKey]: nextTxt,
                            },
                          },
                        })
                      }
                    />
                  </View>
                )
              })}
            </View>
          )
        })}

        <Button onPress={handleSave}>Save Sources</Button>
      </BottomSheetScrollView>
    </AppBottomSheet>
  )
})

SourceBindingSheet.displayName = "SourceBindingSheet"

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 14,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: 1,
    borderColor: theme.colors.primaryDark,
  },
  addText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  card: {
    padding: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 10,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  aliasLabel: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: theme.typography.mono,
    color: theme.colors.textPrimary,
  },
  subLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  loaderGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  loaderPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  loaderPillActive: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primary,
  },
  loaderPillText: {
    fontSize: 11,
    fontFamily: theme.typography.mono,
    color: theme.colors.textSecondary,
  },
  loaderPillTextActive: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
  paramBlock: {
    gap: 6,
  },
  paramKey: {
    fontSize: 11,
    fontFamily: theme.typography.mono,
    color: theme.colors.textSecondary,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    fontFamily: theme.typography.mono,
    color: theme.colors.textPrimary,
  },
})
