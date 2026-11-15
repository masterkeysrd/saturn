import { forwardRef, useRef, useState } from "react"
import {
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet"
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
import { AppBottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { theme } from "@/lib/theme"
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
    const [draft, setDraft] = useState<Flow_StepNode>(step)
    const sourceSheetRef = useRef<BottomSheet>(null)
    const modelSheetRef = useRef<BottomSheet>(null)

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
            <View style={styles.fieldRow}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Step ID</Text>
                <TextInput
                  style={styles.monoInput}
                  value={draft.id}
                  onChangeText={(id) => setDraft({ ...draft, id })}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Label</Text>
                <TextInput
                  style={styles.input}
                  value={draft.name ?? ""}
                  onChangeText={(name) => setDraft({ ...draft, name })}
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
                <Database size={14} color={theme.colors.primary} />
                <Text style={styles.pillBtnText}>Sources ({sourceCount})</Text>
              </TouchableOpacity>
              {draft.type === "llm.generate" && (
                <TouchableOpacity
                  style={styles.pillBtn}
                  onPress={() => {
                    haptics.light()
                    modelSheetRef.current?.expand()
                  }}
                >
                  <Sparkles size={14} color={theme.colors.accent} />
                  <Text style={styles.pillBtnText}>Model Override</Text>
                </TouchableOpacity>
              )}
            </View>

            {draft.type === "llm.generate" && (
              <View style={styles.section}>
                <View style={styles.rowBetween}>
                  <Text style={styles.label}>Continue on Error</Text>
                  <Switch
                    value={draft.onError === "continue"}
                    onValueChange={(v) => {
                      haptics.selection()
                      setDraft({ ...draft, onError: v ? "continue" : "fail" })
                    }}
                    trackColor={{
                      false: theme.colors.surfaceHighlight,
                      true: theme.colors.primary,
                    }}
                  />
                </View>

                <Text style={styles.label}>System Instruction</Text>
                <TextInput
                  style={[styles.monoInput, styles.multiline]}
                  multiline
                  value={String(inputs.system ?? "")}
                  onChangeText={(v) => updateInput("system", v)}
                />

                <Text style={styles.label}>Prompt</Text>
                <TextInput
                  style={[styles.monoInput, styles.multiline]}
                  multiline
                  value={String(inputs.prompt ?? "")}
                  onChangeText={(v) => updateInput("prompt", v)}
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
                <Text style={styles.label}>CEL Condition</Text>
                <TextInput
                  style={styles.monoInput}
                  value={String(inputs.condition ?? "")}
                  onChangeText={(v) => updateInput("condition", v)}
                  autoCapitalize="none"
                />
                <VariableChipPicker
                  variables={variables}
                  currentValue={String(inputs.condition ?? "")}
                  rawMode
                  onInsert={(v) => updateInput("condition", v)}
                />
                <Text style={styles.label}>Skip Reason</Text>
                <TextInput
                  style={styles.input}
                  value={String(inputs.reason ?? "")}
                  onChangeText={(v) => updateInput("reason", v)}
                />
              </View>
            )}

            {draft.type === "switch" && (
              <View style={styles.section}>
                <View style={styles.rowBetween}>
                  <Text style={styles.label}>Switch Cases</Text>
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
                    <Plus size={14} color={theme.colors.primary} />
                    <Text style={styles.smallAddText}>Add Case</Text>
                  </TouchableOpacity>
                </View>

                {(draft.cases ?? []).map((sc, idx) => (
                  <View key={`${sc.name}-${idx}`} style={styles.nestedBox}>
                    <TextInput
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
                    />
                    <TextInput
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
                      autoCapitalize="none"
                    />
                    <Text style={styles.nestedCount}>
                      {sc.steps?.length ?? 0} branch step(s)
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
                      <Plus size={14} color={theme.colors.primary} />
                      <Text style={styles.smallAddText}>Add Output Step</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {draft.type === "for_each" && (
              <View style={styles.section}>
                <Text style={styles.label}>Items Expression</Text>
                <TextInput
                  style={styles.monoInput}
                  value={String(inputs.items ?? "")}
                  onChangeText={(v) => updateInput("items", v)}
                  autoCapitalize="none"
                />
                <VariableChipPicker
                  variables={variables}
                  currentValue={String(inputs.items ?? "")}
                  onInsert={(v) => updateInput("items", v)}
                />
                <Text style={styles.label}>Item Alias</Text>
                <TextInput
                  style={styles.monoInput}
                  value={String(inputs.item_alias ?? "item")}
                  onChangeText={(v) => updateInput("item_alias", v)}
                  autoCapitalize="none"
                />
                <Text style={styles.nestedCount}>
                  {(draft.steps ?? []).length} loop step(s)
                </Text>
              </View>
            )}

            {draft.type === "output" && (
              <View style={styles.section}>
                <Text style={styles.label}>Output Expression / JSON</Text>
                <TextInput
                  style={[styles.monoInput, styles.multiline]}
                  multiline
                  value={
                    typeof inputs.value === "string"
                      ? inputs.value
                      : JSON.stringify(inputs.value ?? {}, null, 2)
                  }
                  onChangeText={(v) => updateInput("value", v)}
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
                      <TextInput
                        style={styles.monoInput}
                        value={strVal}
                        onChangeText={(v) => updateInput(k, v)}
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
                <Trash2 size={16} color={theme.colors.destructive} />
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
              <Button
                style={styles.saveBtn}
                onPress={() => {
                  haptics.success()
                  onSave(draft)
                  onClose()
                }}
              >
                Save Step
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
          defaultLabel="Inherit Flow Default"
          onSave={(model) => setDraft({ ...draft, model })}
          onClose={() => modelSheetRef.current?.close()}
        />
      </>
    )
  }
)

StepEditorSheet.displayName = "StepEditorSheet"

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 14,
  },
  fieldRow: {
    flexDirection: "row",
    gap: 10,
  },
  halfField: {
    flex: 1,
    gap: 6,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  pillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pillBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  section: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  input: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  monoInput: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    fontFamily: theme.typography.mono,
    color: theme.colors.textPrimary,
  },
  multiline: {
    minHeight: 84,
    textAlignVertical: "top",
  },
  nestedBox: {
    padding: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 8,
  },
  nestedCount: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  smallAdd: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  smallAddText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.destructiveSubtle,
  },
  deleteText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.destructive,
  },
  saveBtn: {
    flex: 1,
  },
})
