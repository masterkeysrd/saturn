import { useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import BottomSheet from "@gorhom/bottom-sheet"
import {
  collectWorkflowStepIds,
  createDefaultWorkflowStep,
  createEmptyWorkflowDraft,
} from "@saturn/core"
import { useI18n } from "@saturn/hooks"
import { FlowSchema } from "@saturn/schemas"
import {
  useGetFlowQuery,
  useGetCatalogQuery,
  useCreateFlowMutation,
  useUpdateFlowMutation,
  useResetFlowMutation,
  useDeleteFlowMutation,
  useTestFlowMutation,
  type Flow,
  type Flow_StepNode,
  type Flow_Trigger,
} from "@saturn/api/saturn/platform/workflow/v1/workflow"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { ModelConfigSheet } from "@/components/workflows/model-config-sheet"
import { TriggerSheet } from "@/components/workflows/trigger-sheet"
import { StepEditorSheet } from "@/components/workflows/step-editor-sheet"
import { consumePendingWorkflowDraft } from "@/components/workflows/workflow-draft-store"
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  FlaskConical,
  RotateCcw,
  Settings2,
  Trash2,
} from "lucide-react-native"

export default function WorkflowDetailEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const isNew = !id || id === "new"
  const router = useRouter()
  const toast = useToast()
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const { colors, isDark } = useTheme()
  const styles = useThemedStyles(createStyles)

  const { data: fetchedFlow, isLoading } = useGetFlowQuery(
    { id: id ?? "" },
    { enabled: !isNew }
  )
  const { data: catalog } = useGetCatalogQuery({})

  const [initialFallback] = useState<Flow>(
    () => consumePendingWorkflowDraft() ?? createEmptyWorkflowDraft()
  )
  const [draftOverride, setDraftOverride] = useState<Flow | null>(null)
  const draft =
    draftOverride ?? (!isNew && fetchedFlow ? fetchedFlow : initialFallback)

  const [editingTriggerIdx, setEditingTriggerIdx] = useState<number | null>(
    null
  )
  const [editingStepIdx, setEditingStepIdx] = useState<number | null>(null)
  const [resetDialogVisible, setResetDialogVisible] = useState(false)
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false)

  const modelSheetRef = useRef<BottomSheet>(null)
  const triggerSheetRef = useRef<BottomSheet>(null)
  const stepSheetRef = useRef<BottomSheet>(null)

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["/api/v1/platform/workflows"],
    })
    if (id && !isNew) {
      await queryClient.invalidateQueries({
        queryKey: [`/api/v1/platform/workflows/${id}`],
      })
    }
  }

  const createMutation = useCreateFlowMutation({ onSuccess: invalidate })
  const updateMutation = useUpdateFlowMutation({ onSuccess: invalidate })
  const resetMutation = useResetFlowMutation({
    onSuccess: async (reset) => {
      setDraftOverride(reset)
      await invalidate()
    },
  })
  const deleteMutation = useDeleteFlowMutation({ onSuccess: invalidate })
  const testMutation = useTestFlowMutation()

  const topics = useMemo(
    () => catalog?.triggerTopics ?? [],
    [catalog?.triggerTopics]
  )
  const stepDescriptors = catalog?.steps ?? []
  const loaderDescriptors = catalog?.loaders ?? []

  const firstEventTopic = useMemo(() => {
    const event = (draft.triggers ?? []).find((x) => x.type === "event")
    if (!event?.config?.topic) return undefined
    return topics.find((item) => item.topic === event.config?.topic)
  }, [draft.triggers, topics])

  const handleSave = async () => {
    const parsed = FlowSchema.safeParse({
      name: draft.name,
      description: draft.description ?? "",
      isEnabled: draft.isEnabled,
      config: draft.config,
      inputSchema: draft.inputSchema,
      triggers: draft.triggers ?? [],
      steps: draft.steps ?? [],
    })
    if (!parsed.success) {
      haptics.error()
      toast.show({
        title:
          parsed.error.issues[0]?.message ||
          t("workflows.editor.invalidWorkflow"),
        type: "error",
      })
      return
    }

    try {
      haptics.light()
      if (isNew) {
        const created = await createMutation.mutateAsync({
          flow: draft,
        })
        haptics.success()
        toast.show({
          title: t("workflows.editor.createdTitle"),
          type: "success",
        })
        if (created.id) {
          router.replace(`/(app)/workflows/${created.id}` as never)
        }
      } else if (draft.id) {
        const updated = await updateMutation.mutateAsync({
          id: draft.id,
          req: {
            id: draft.id,
            flow: draft,
            updateMask: {
              paths: [
                "name",
                "description",
                "config",
                "input_schema",
                "triggers",
                "steps",
                "is_enabled",
              ],
            },
          },
        })
        setDraftOverride(updated)
        haptics.success()
        toast.show({ title: t("workflows.editor.savedTitle"), type: "success" })
      }
    } catch (err) {
      haptics.error()
      toast.show({
        title:
          err instanceof Error ? err.message : t("workflows.editor.saveFailed"),
        type: "error",
      })
    }
  }

  const handleDryTest = async () => {
    try {
      haptics.light()
      const run = await testMutation.mutateAsync({
        flow: draft,
        input: {},
        triggerData: {},
        artifacts: [],
      })
      haptics.success()
      toast.show({
        title: t("workflows.mobile.dryTestStatus", {
          status: run.status ?? "completed",
        }),
        type: "success",
      })
    } catch (err) {
      haptics.error()
      toast.show({
        title:
          err instanceof Error
            ? err.message
            : t("workflows.mobile.dryTestFailed"),
        type: "error",
      })
    }
  }

  const moveStep = (idx: number, dir: -1 | 1) => {
    const steps = [...(draft.steps ?? [])]
    const target = idx + dir
    if (target < 0 || target >= steps.length) return
    haptics.selection()
    const [removed] = steps.splice(idx, 1)
    steps.splice(target, 0, removed)
    setDraftOverride({ ...draft, steps })
  }

  if (!isNew && isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionLabel}>
              {t("workflows.mobile.workflowDetails").toUpperCase()}
            </Text>
            <Switch
              value={draft.isEnabled}
              onValueChange={(isEnabled) => {
                haptics.selection()
                setDraftOverride({ ...draft, isEnabled })
              }}
              trackColor={{
                false: colors.surfaceHighlight,
                true: colors.primary,
              }}
            />
          </View>

          <TextInput
            style={styles.input}
            value={draft.name}
            onChangeText={(name) => setDraftOverride({ ...draft, name })}
            placeholder={t("workflows.mobile.namePlaceholder")}
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={isDark ? "dark" : "light"}
          />

          <TextInput
            style={[styles.input, styles.multiline]}
            multiline
            value={draft.description ?? ""}
            onChangeText={(description) =>
              setDraftOverride({ ...draft, description })
            }
            placeholder={t("workflows.mobile.describeWorkflow")}
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={isDark ? "dark" : "light"}
          />

          <TouchableOpacity
            style={styles.configRow}
            onPress={() => {
              haptics.light()
              modelSheetRef.current?.expand()
            }}
          >
            <View style={styles.rowLeft}>
              <Settings2 size={16} color={colors.primary} />
              <Text style={styles.configText}>
                {t("workflows.mobile.defaultModelConfig")}
              </Text>
            </View>
            <ChevronRight size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Triggers */}
        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionLabel}>
              {t("workflows.mobile.triggersWithCount", {
                count: draft.triggers?.length ?? 0,
              }).toUpperCase()}
            </Text>
            <TouchableOpacity
              onPress={() => {
                haptics.light()
                const nextTrig: Flow_Trigger = {
                  name: "Webhook",
                  type: "webhook",
                  config: {},
                  isEnabled: true,
                }
                const next = [...(draft.triggers ?? []), nextTrig]
                setDraftOverride({ ...draft, triggers: next })
                setEditingTriggerIdx(next.length - 1)
                requestAnimationFrame(() => triggerSheetRef.current?.expand())
              }}
            >
              <Text style={styles.addLink}>
                + {t("workflows.mobile.addTrigger")}
              </Text>
            </TouchableOpacity>
          </View>

          {(draft.triggers ?? []).map((trig, idx) => (
            <TouchableOpacity
              key={trig.id ?? `trig-${idx}`}
              style={styles.itemRow}
              onPress={() => {
                haptics.light()
                setEditingTriggerIdx(idx)
                requestAnimationFrame(() => triggerSheetRef.current?.expand())
              }}
            >
              <View style={styles.itemLeft}>
                <Text style={styles.itemTitle}>{trig.name}</Text>
                <Badge size="sm" label={trig.type.toUpperCase()} />
              </View>
              <ChevronRight size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Steps */}
        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionLabel}>
              {t("workflows.mobile.stepsWithCount", {
                count: draft.steps?.length ?? 0,
              }).toUpperCase()}
            </Text>
            <TouchableOpacity
              onPress={() => {
                haptics.light()
                const added = createDefaultWorkflowStep(
                  "llm.generate",
                  collectWorkflowStepIds(draft.steps ?? [])
                )
                const nextSteps = [...(draft.steps ?? []), added]
                setDraftOverride({ ...draft, steps: nextSteps })
                setEditingStepIdx(nextSteps.length - 1)
                requestAnimationFrame(() => stepSheetRef.current?.expand())
              }}
            >
              <Text style={styles.addLink}>
                + {t("workflows.mobile.addStep")}
              </Text>
            </TouchableOpacity>
          </View>

          {(draft.steps ?? []).map((s, idx) => (
            <View key={`${s.id}-${idx}`} style={styles.stepCard}>
              <TouchableOpacity
                style={styles.stepMain}
                onPress={() => {
                  haptics.light()
                  setEditingStepIdx(idx)
                  requestAnimationFrame(() => stepSheetRef.current?.expand())
                }}
              >
                <View style={styles.stepInfo}>
                  <Text style={styles.itemTitle}>{s.name || s.id}</Text>
                  <Text style={styles.stepSub}>
                    {s.id} • {s.type}
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.textMuted} />
              </TouchableOpacity>

              <View style={styles.reorderRow}>
                <TouchableOpacity
                  disabled={idx === 0}
                  onPress={() => moveStep(idx, -1)}
                  style={styles.reorderBtn}
                >
                  <ArrowUp
                    size={14}
                    color={idx === 0 ? colors.textMuted : colors.textPrimary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={idx === (draft.steps?.length ?? 0) - 1}
                  onPress={() => moveStep(idx, 1)}
                  style={styles.reorderBtn}
                >
                  <ArrowDown
                    size={14}
                    color={
                      idx === (draft.steps?.length ?? 0) - 1
                        ? colors.textMuted
                        : colors.textPrimary
                    }
                  />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        {/* Quick Actions */}
        <View style={styles.actionStack}>
          <Button
            onPress={handleSave}
            loading={createMutation.isPending || updateMutation.isPending}
          >
            {isNew
              ? t("workflows.mobile.createWorkflow")
              : t("workflows.mobile.saveChanges")}
          </Button>

          <Button
            variant="secondary"
            onPress={handleDryTest}
            loading={testMutation.isPending}
            leftIcon={<FlaskConical size={16} color={colors.textPrimary} />}
          >
            {t("workflows.mobile.runDryTest")}
          </Button>

          {draft.isSystem && draft.id && (
            <Button
              variant="secondary"
              onPress={() => {
                haptics.light()
                setResetDialogVisible(true)
              }}
              leftIcon={<RotateCcw size={16} color={colors.warning} />}
            >
              {t("workflows.resetButtonTitle")}
            </Button>
          )}

          {!isNew && !draft.isSystem && draft.id && (
            <Button
              variant="destructive"
              onPress={() => {
                haptics.light()
                setDeleteDialogVisible(true)
              }}
              leftIcon={<Trash2 size={16} color="#ffffff" />}
            >
              {t("workflows.deleteButtonTitle")}
            </Button>
          )}
        </View>
      </ScrollView>

      <ModelConfigSheet
        ref={modelSheetRef}
        value={draft.config?.defaultModel}
        onSave={(defaultModel) =>
          setDraftOverride({
            ...draft,
            config: { ...(draft.config ?? {}), defaultModel },
          })
        }
        onClose={() => modelSheetRef.current?.close()}
      />

      {editingTriggerIdx !== null &&
        (draft.triggers ?? [])[editingTriggerIdx] && (
          <TriggerSheet
            ref={triggerSheetRef}
            trigger={(draft.triggers ?? [])[editingTriggerIdx]}
            topics={topics}
            onSave={(nextTrig) =>
              setDraftOverride({
                ...draft,
                triggers: (draft.triggers ?? []).map((trig, i) =>
                  i === editingTriggerIdx ? nextTrig : trig
                ),
              })
            }
            onDelete={() =>
              setDraftOverride({
                ...draft,
                triggers: (draft.triggers ?? []).filter(
                  (_, i) => i !== editingTriggerIdx
                ),
              })
            }
            onClose={() => {
              triggerSheetRef.current?.close()
              setEditingTriggerIdx(null)
            }}
          />
        )}

      {editingStepIdx !== null && (draft.steps ?? [])[editingStepIdx] && (
        <StepEditorSheet
          ref={stepSheetRef}
          step={(draft.steps ?? [])[editingStepIdx]}
          rootSteps={draft.steps ?? []}
          inputSchema={draft.inputSchema}
          triggerTopic={firstEventTopic}
          stepDescriptors={stepDescriptors}
          loaderDescriptors={loaderDescriptors}
          onSave={(nextStep: Flow_StepNode) =>
            setDraftOverride({
              ...draft,
              steps: (draft.steps ?? []).map((s, i) =>
                i === editingStepIdx ? nextStep : s
              ),
            })
          }
          onDelete={() =>
            setDraftOverride({
              ...draft,
              steps: (draft.steps ?? []).filter((_, i) => i !== editingStepIdx),
            })
          }
          onClose={() => {
            stepSheetRef.current?.close()
            setEditingStepIdx(null)
          }}
        />
      )}

      <ConfirmDialog
        visible={resetDialogVisible}
        title={t("workflows.resetDialog.title")}
        message={`${t("workflows.resetDialog.descriptionStart")} ${
          draft.name || t("workflows.editor.untitled")
        } ${t("workflows.resetDialog.descriptionEnd")}`}
        confirmText={t("workflows.resetDialog.confirm")}
        loading={resetMutation.isPending}
        onCancel={() => setResetDialogVisible(false)}
        onConfirm={async () => {
          if (!draft.id) return
          await resetMutation.mutateAsync({
            id: draft.id,
            req: { id: draft.id },
          })
          haptics.success()
          setResetDialogVisible(false)
        }}
      />

      <ConfirmDialog
        visible={deleteDialogVisible}
        title={t("workflows.deleteDialog.title")}
        message={`${t("workflows.deleteDialog.descriptionStart")} ${
          draft.name || t("workflows.editor.untitled")
        } ${t("workflows.deleteDialog.descriptionEnd")}`}
        confirmText={t("workflows.deleteDialog.confirm")}
        isDestructive
        loading={deleteMutation.isPending}
        onCancel={() => setDeleteDialogVisible(false)}
        onConfirm={async () => {
          if (!draft.id) return
          await deleteMutation.mutateAsync({
            id: draft.id,
            req: { id: draft.id },
          })
          haptics.success()
          setDeleteDialogVisible(false)
          router.back()
        }}
      />
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: t.colors.background,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  content: {
    padding: 16,
    paddingBottom: 90,
    gap: 18,
  },
  card: {
    padding: 14,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    gap: 10,
  },
  section: {
    gap: 10,
  },
  rowBetween: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  rowLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
    color: t.colors.textMuted,
  },
  addLink: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: t.colors.primary,
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
  multiline: {
    minHeight: 68,
    textAlignVertical: "top" as const,
  },
  configRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingTop: 6,
  },
  configText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  itemRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    padding: 14,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  itemLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  stepCard: {
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    overflow: "hidden" as const,
  },
  stepMain: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    padding: 14,
  },
  stepInfo: {
    gap: 2,
  },
  stepSub: {
    fontSize: 12,
    fontFamily: t.typography.mono,
    color: t.colors.textMuted,
  },
  reorderRow: {
    flexDirection: "row" as const,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  reorderBtn: {
    flex: 1,
    alignItems: "center" as const,
    paddingVertical: 8,
  },
  actionStack: {
    gap: 10,
    marginTop: 6,
  },
})
