import { forwardRef, useEffect, useMemo, useRef, useState } from "react"
import { Switch, Text, TouchableOpacity, View } from "react-native"
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet"
import {
  collectWorkflowStepIds,
  createDefaultWorkflowStep,
  discoverVariablesAtStep,
  type WorkflowStepRef,
} from "@saturn/core"
import type {
  Catalog_Loader,
  Catalog_Step,
  Catalog_TriggerTopic,
  Flow_StepNode,
} from "@saturn/api/saturn/platform/workflow/v1/workflow"
import { useI18n } from "@saturn/hooks"
import { useListAgentsQuery } from "@saturn/api/saturn/platform/ai/v1/ai"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { VariableChipPicker } from "./variable-chip-picker"
import { SourceBindingSheet } from "./source-binding-sheet"
import { ModelConfigSheet } from "./model-config-sheet"
import { Database, Sparkles, Trash2, Plus } from "lucide-react-native"

interface StepEditorSheetProps {
  step: Flow_StepNode
  rootSteps: Flow_StepNode[]
  inputSchema?: Record<string, unknown>
  triggerTopic?: Catalog_TriggerTopic
  stepDescriptors: Catalog_Step[]
  loaderDescriptors: Catalog_Loader[]
  onSave: (next: Flow_StepNode) => void
  onDelete: () => void
  onClose: () => void
}

export const StepEditorSheet = forwardRef<BottomSheet, StepEditorSheetProps>(
  (
    {
      step,
      rootSteps,
      inputSchema,
      triggerTopic,
      stepDescriptors,
      loaderDescriptors,
      onSave,
      onDelete,
      onClose,
    },
    ref
  ) => {
    const { colors, isDark } = useTheme()
    const styles = useThemedStyles(createStyles)
    const { t } = useI18n()
    const [draft, setDraft] = useState<Flow_StepNode>(step)
    const sourceSheetRef = useRef<BottomSheet>(null)
    const modelSheetRef = useRef<BottomSheet>(null)
    const { data: agentsData } = useListAgentsQuery({})
    const agents = agentsData?.agents ?? []

    useEffect(() => {
      setDraft(step)
    }, [step])

    const availableStepTypes = useMemo(() => {
      const baseTypes = [
        "llm.generate",
        "ai.agent_run",
        "filter",
        "switch",
        "for_each",
        "output",
      ]
      const seen = new Set(baseTypes)
      for (const d of stepDescriptors) {
        if (d.type && !seen.has(d.type)) {
          seen.add(d.type)
          baseTypes.push(d.type)
        }
      }
      if (draft.type && !seen.has(draft.type)) {
        baseTypes.push(draft.type)
      }
      return baseTypes
    }, [stepDescriptors, draft.type])

    const handleStepTypeChange = (nextType: string) => {
      if (nextType === draft.type) return
      haptics.selection()
      const template = createDefaultWorkflowStep(
        nextType,
        collectWorkflowStepIds(rootSteps)
      )
      setDraft({
        ...template,
        id: draft.id,
        name: draft.name,
        sources: draft.sources,
      })
    }

    const stepDescMap = Object.fromEntries(
      stepDescriptors.map((d) => [
        d.type ?? "",
        { outputSchema: d.outputSchema },
      ])
    )
    const loaderDescMap = Object.fromEntries(
      loaderDescriptors.map((l) => [
        l.name ?? "",
        { outputSchema: l.outputSchema },
      ])
    )

    const variables = discoverVariablesAtStep({
      steps: rootSteps as unknown as WorkflowStepRef[],
      targetStepId: draft.id,
      inputSchema,
      triggerPayloadSchema: triggerTopic?.payloadSchema,
      stepDescriptors: stepDescMap,
      loaderDescriptors: loaderDescMap,
    })

    const inputs = draft.inputs ?? {}
    const updateInput = (key: string, val: unknown) => {
      const next = { ...inputs }
      if (val === undefined || val === "") delete next[key]
      else next[key] = val
      setDraft({ ...draft, inputs: next })
    }

    const sourceCount = Object.keys(draft.sources ?? {}).length
    const descriptor = stepDescriptors.find((d) => d.type === draft.type)
    const descriptorProps =
      descriptor?.inputsSchema &&
      typeof descriptor.inputsSchema.properties === "object" &&
      descriptor.inputsSchema.properties
        ? Object.keys(
            descriptor.inputsSchema.properties as Record<string, unknown>
          )
        : []

    return (
      <>
        <AppBottomSheet
          ref={ref}
          title={`${draft.name || draft.id} (${draft.type})`}
          snapPoints={["75%", "94%"]}
          onClose={onClose}
        >
          <BottomSheetScrollView contentContainerStyle={styles.body}>
            <View style={styles.section}>
              <Text style={styles.label}>{t("workflows.mobile.stepType")}</Text>
              <View style={styles.typeGrid}>
                {availableStepTypes.map((stepType) => {
                  const active = draft.type === stepType
                  return (
                    <TouchableOpacity
                      key={stepType}
                      style={[
                        styles.pillBtn,
                        active && {
                          borderColor: colors.primary,
                          backgroundColor: colors.primarySubtle,
                        },
                      ]}
                      onPress={() => handleStepTypeChange(stepType)}
                    >
                      <Text
                        style={[
                          styles.pillBtnText,
                          active && { color: colors.primary },
                        ]}
                      >
                        {stepType}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            <View style={styles.fieldRow}>
              <View style={styles.halfField}>
                <Text style={styles.label}>{t("workflows.mobile.stepId")}</Text>
                <BottomSheetTextInput
                  style={styles.monoInput}
                  value={draft.id}
                  onChangeText={(id) => setDraft({ ...draft, id })}
                  placeholderTextColor={colors.textMuted}
                  keyboardAppearance={isDark ? "dark" : "light"}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>
                  {t("workflows.mobile.stepLabel")}
                </Text>
                <BottomSheetTextInput
                  style={styles.input}
                  value={draft.name ?? ""}
                  onChangeText={(name) => setDraft({ ...draft, name })}
                  placeholderTextColor={colors.textMuted}
                  keyboardAppearance={isDark ? "dark" : "light"}
                />
              </View>
            </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.pillBtn}
                onPress={() => {
                  haptics.light()
                  sourceSheetRef.current?.expand()
                }}
              >
                <Database size={14} color={colors.primary} />
                <Text style={styles.pillBtnText}>
                  {t("workflows.inspector.tabSources", { count: sourceCount })}
                </Text>
              </TouchableOpacity>
              {(draft.type === "llm.generate" ||
                draft.type === "ai.agent_run") && (
                <TouchableOpacity
                  style={styles.pillBtn}
                  onPress={() => {
                    haptics.light()
                    modelSheetRef.current?.expand()
                  }}
                >
                  <Sparkles size={14} color={colors.accent} />
                  <Text style={styles.pillBtnText}>
                    {t("workflows.mobile.modelOverride")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {(draft.type === "llm.generate" ||
              draft.type === "ai.agent_run") && (
              <View style={styles.section}>
                <View style={styles.rowBetween}>
                  <Text style={styles.label}>
                    {t("workflows.mobile.continueOnError")}
                  </Text>
                  <Switch
                    value={draft.onError === "continue"}
                    onValueChange={(v) => {
                      haptics.selection()
                      setDraft({ ...draft, onError: v ? "continue" : "fail" })
                    }}
                    trackColor={{
                      false: colors.surfaceHighlight,
                      true: colors.primary,
                    }}
                  />
                </View>

                {draft.type === "ai.agent_run" && (
                  <>
                    <Text style={styles.label}>
                      {t("workflows.inspector.targetAgent")}
                    </Text>
                    <View style={styles.nestedBox}>
                      {agents.map((ag) => {
                        const selected = inputs.agent_id === ag.id
                        return (
                          <TouchableOpacity
                            key={ag.id}
                            style={[
                              styles.pillBtn,
                              selected && { borderColor: colors.primary },
                            ]}
                            onPress={() => {
                              haptics.selection()
                              updateInput("agent_id", ag.id)
                            }}
                          >
                            <Text style={styles.pillBtnText}>{ag.name}</Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  </>
                )}

                {draft.type === "llm.generate" && (
                  <>
                    <Text style={styles.label}>
                      {t("workflows.inspector.systemInstruction")}
                    </Text>
                    <BottomSheetTextInput
                      style={[styles.monoInput, styles.multiline]}
                      multiline
                      value={String(inputs.system ?? "")}
                      onChangeText={(v) => updateInput("system", v)}
                      placeholderTextColor={colors.textMuted}
                      keyboardAppearance={isDark ? "dark" : "light"}
                    />
                  </>
                )}

                <Text style={styles.label}>{t("workflows.mobile.prompt")}</Text>
                <BottomSheetTextInput
                  style={[styles.monoInput, styles.multiline]}
                  multiline
                  value={String(inputs.prompt ?? "")}
                  onChangeText={(v) => updateInput("prompt", v)}
                  placeholderTextColor={colors.textMuted}
                  keyboardAppearance={isDark ? "dark" : "light"}
                />
                <VariableChipPicker
                  variables={variables}
                  currentValue={String(inputs.prompt ?? "")}
                  onInsert={(v) => updateInput("prompt", v)}
                />
              </View>
            )}

            {draft.type === "filter" && (
              <View style={styles.section}>
                <Text style={styles.label}>
                  {t("workflows.inspector.celCondition")}
                </Text>
                <BottomSheetTextInput
                  style={styles.monoInput}
                  value={String(inputs.condition ?? "")}
                  onChangeText={(v) => updateInput("condition", v)}
                  placeholderTextColor={colors.textMuted}
                  keyboardAppearance={isDark ? "dark" : "light"}
                  autoCapitalize="none"
                />
                <VariableChipPicker
                  variables={variables}
                  currentValue={String(inputs.condition ?? "")}
                  rawMode
                  onInsert={(v) => updateInput("condition", v)}
                />
                <Text style={styles.label}>
                  {t("workflows.inspector.skipReason")}
                </Text>
                <BottomSheetTextInput
                  style={styles.input}
                  value={String(inputs.reason ?? "")}
                  onChangeText={(v) => updateInput("reason", v)}
                  placeholderTextColor={colors.textMuted}
                  keyboardAppearance={isDark ? "dark" : "light"}
                />
              </View>
            )}

            {draft.type === "switch" && (
              <View style={styles.section}>
                <View style={styles.rowBetween}>
                  <Text style={styles.label}>
                    {t("workflows.inspector.branchCases")}
                  </Text>
                  <TouchableOpacity
                    style={styles.smallAdd}
                    onPress={() => {
                      haptics.light()
                      setDraft({
                        ...draft,
                        cases: [
                          ...(draft.cases ?? []),
                          {
                            name: `case_${(draft.cases?.length ?? 0) + 1}`,
                            condition: "true",
                            steps: [],
                          },
                        ],
                      })
                    }}
                  >
                    <Plus size={14} color={colors.primary} />
                    <Text style={styles.smallAddText}>
                      {t("workflows.inspector.addCase")}
                    </Text>
                  </TouchableOpacity>
                </View>

                {(draft.cases ?? []).map((sc, idx) => (
                  <View key={`${sc.name}-${idx}`} style={styles.nestedBox}>
                    <BottomSheetTextInput
                      style={styles.monoInput}
                      value={sc.name}
                      onChangeText={(name) =>
                        setDraft({
                          ...draft,
                          cases: (draft.cases ?? []).map((c, i) =>
                            i === idx ? { ...c, name } : c
                          ),
                        })
                      }
                      placeholder="case_name"
                      placeholderTextColor={colors.textMuted}
                      keyboardAppearance={isDark ? "dark" : "light"}
                    />
                    <BottomSheetTextInput
                      style={styles.monoInput}
                      value={sc.condition}
                      onChangeText={(condition) =>
                        setDraft({
                          ...draft,
                          cases: (draft.cases ?? []).map((c, i) =>
                            i === idx ? { ...c, condition } : c
                          ),
                        })
                      }
                      placeholder="CEL condition"
                      placeholderTextColor={colors.textMuted}
                      keyboardAppearance={isDark ? "dark" : "light"}
                      autoCapitalize="none"
                    />
                    <Text style={styles.nestedCount}>
                      {t(
                        (sc.steps?.length ?? 0) === 1
                          ? "workflows.mobile.branchStepsOne"
                          : "workflows.mobile.branchStepsOther",
                        { count: sc.steps?.length ?? 0 }
                      )}
                    </Text>
                    <TouchableOpacity
                      style={styles.smallAdd}
                      onPress={() => {
                        haptics.light()
                        const added = createDefaultWorkflowStep(
                          "output",
                          collectWorkflowStepIds(rootSteps)
                        )
                        setDraft({
                          ...draft,
                          cases: (draft.cases ?? []).map((c, i) =>
                            i === idx
                              ? { ...c, steps: [...(c.steps ?? []), added] }
                              : c
                          ),
                        })
                      }}
                    >
                      <Plus size={14} color={colors.primary} />
                      <Text style={styles.smallAddText}>
                        {t("workflows.mobile.addOutputStep")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {draft.type === "for_each" && (
              <View style={styles.section}>
                <Text style={styles.label}>
                  {t("workflows.inspector.itemsExpression")}
                </Text>
                <BottomSheetTextInput
                  style={styles.monoInput}
                  value={String(inputs.items ?? "")}
                  onChangeText={(v) => updateInput("items", v)}
                  placeholderTextColor={colors.textMuted}
                  keyboardAppearance={isDark ? "dark" : "light"}
                  autoCapitalize="none"
                />
                <VariableChipPicker
                  variables={variables}
                  currentValue={String(inputs.items ?? "")}
                  onInsert={(v) => updateInput("items", v)}
                />
                <Text style={styles.label}>
                  {t("workflows.inspector.itemAlias")}
                </Text>
                <BottomSheetTextInput
                  style={styles.monoInput}
                  value={String(inputs.item_alias ?? "item")}
                  onChangeText={(v) => updateInput("item_alias", v)}
                  placeholderTextColor={colors.textMuted}
                  keyboardAppearance={isDark ? "dark" : "light"}
                  autoCapitalize="none"
                />
                <Text style={styles.nestedCount}>
                  {t(
                    (draft.steps ?? []).length === 1
                      ? "workflows.mobile.loopStepsOne"
                      : "workflows.mobile.loopStepsOther",
                    { count: (draft.steps ?? []).length }
                  )}
                </Text>
              </View>
            )}

            {draft.type === "output" && (
              <View style={styles.section}>
                <Text style={styles.label}>
                  {t("workflows.inspector.outputExpression")}
                </Text>
                <BottomSheetTextInput
                  style={[styles.monoInput, styles.multiline]}
                  multiline
                  value={
                    typeof inputs.value === "string"
                      ? inputs.value
                      : JSON.stringify(inputs.value ?? {}, null, 2)
                  }
                  onChangeText={(v) => updateInput("value", v)}
                  placeholderTextColor={colors.textMuted}
                  keyboardAppearance={isDark ? "dark" : "light"}
                />
                <VariableChipPicker
                  variables={variables}
                  currentValue={
                    typeof inputs.value === "string" ? inputs.value : ""
                  }
                  onInsert={(v) => updateInput("value", v)}
                />
              </View>
            )}

            {![
              "llm.generate",
              "ai.agent_run",
              "filter",
              "switch",
              "for_each",
              "output",
            ].includes(draft.type) && (
              <View style={styles.section}>
                {(descriptorProps.length > 0
                  ? descriptorProps
                  : Object.keys(inputs)
                ).map((k) => {
                  const raw = inputs[k]
                  const strVal =
                    typeof raw === "string"
                      ? raw
                      : raw !== undefined
                        ? JSON.stringify(raw)
                        : ""
                  return (
                    <View key={k} style={styles.section}>
                      <Text style={styles.label}>{k}</Text>
                      <BottomSheetTextInput
                        style={styles.monoInput}
                        value={strVal}
                        onChangeText={(v) => updateInput(k, v)}
                        placeholderTextColor={colors.textMuted}
                        keyboardAppearance={isDark ? "dark" : "light"}
                        autoCapitalize="none"
                      />
                      <VariableChipPicker
                        variables={variables}
                        currentValue={strVal}
                        onInsert={(v) => updateInput(k, v)}
                      />
                    </View>
                  )
                })}
              </View>
            )}

            <View style={styles.footerRow}>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => {
                  haptics.light()
                  onDelete()
                  onClose()
                }}
              >
                <Trash2 size={16} color={colors.destructive} />
                <Text style={styles.deleteText}>{t("common.delete")}</Text>
              </TouchableOpacity>
              <Button
                style={styles.saveBtn}
                onPress={() => {
                  haptics.success()
                  onSave(draft)
                  onClose()
                }}
              >
                {t("workflows.mobile.saveStep")}
              </Button>
            </View>
          </BottomSheetScrollView>
        </AppBottomSheet>

        <SourceBindingSheet
          ref={sourceSheetRef}
          sources={draft.sources ?? {}}
          loaders={loaderDescriptors}
          variables={variables}
          onSave={(sources) => setDraft({ ...draft, sources })}
          onClose={() => sourceSheetRef.current?.close()}
        />

        <ModelConfigSheet
          ref={modelSheetRef}
          value={draft.model}
          defaultLabelKey="workflows.model.inheritDefault"
          onSave={(model) => setDraft({ ...draft, model })}
          onClose={() => modelSheetRef.current?.close()}
        />
      </>
    )
  }
)

StepEditorSheet.displayName = "StepEditorSheet"

const createStyles = (t: SaturnMobileTheme) => ({
  body: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 14,
  },
  fieldRow: {
    flexDirection: "row" as const,
    gap: 10,
  },
  halfField: {
    flex: 1,
    gap: 6,
  },
  rowBetween: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  actionsRow: {
    flexDirection: "row" as const,
    gap: 10,
  },
  pillBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  pillBtnText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  section: {
    gap: 8,
  },
  typeGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: t.colors.textSecondary,
  },
  input: {
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: t.colors.textPrimary,
  },
  monoInput: {
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    fontFamily: t.typography.mono,
    color: t.colors.textPrimary,
  },
  multiline: {
    minHeight: 84,
    textAlignVertical: "top" as const,
  },
  nestedBox: {
    padding: 12,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    gap: 8,
  },
  nestedCount: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  smallAdd: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  smallAddText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: t.colors.primary,
  },
  footerRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    marginTop: 8,
  },
  deleteBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.destructiveSubtle,
  },
  deleteText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: t.colors.destructive,
  },
  saveBtn: {
    flex: 1,
  },
})
