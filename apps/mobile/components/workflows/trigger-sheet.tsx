import { forwardRef, useEffect, useState } from "react"
import { Switch, Text, TouchableOpacity, View } from "react-native"
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet"
import * as Clipboard from "expo-clipboard"
import {
  CRON_PRESETS,
  isValidCronExpression,
  discoverVariablesAtStep,
} from "@saturn/core"
import { useI18n, useTimezone } from "@saturn/hooks"
import { useCreateAPIKeyMutation } from "@saturn/api/saturn/identity/v1/identity"
import type {
  Catalog_TriggerTopic,
  Flow_Trigger,
} from "@saturn/api/saturn/platform/workflow/v1/workflow"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { useAuth } from "@/lib/auth-context"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { VariableChipPicker } from "./variable-chip-picker"
import { CRON_PRESET_LABEL_KEYS, getLocalizedCronSummary } from "./cron-label"
import { Copy, Key, Trash2 } from "lucide-react-native"

interface TriggerSheetProps {
  trigger: Flow_Trigger
  topics: Catalog_TriggerTopic[]
  onSave: (next: Flow_Trigger) => void
  onDelete: () => void
  onClose: () => void
}

export const TriggerSheet = forwardRef<BottomSheet, TriggerSheetProps>(
  ({ trigger, topics, onSave, onDelete, onClose }, ref) => {
    const { colors, isDark } = useTheme()
    const styles = useThemedStyles(createStyles)
    const { t } = useI18n()
    const tz = useTimezone()
    const toast = useToast()
    const { serverUrl } = useAuth()
    const { activeSpaceId } = useSpace()
    const createAPIKeyMutation = useCreateAPIKeyMutation()

    const [draft, setDraft] = useState<Flow_Trigger>(trigger)
    const [mintedKey, setMintedKey] = useState<string | null>(null)

    useEffect(() => {
      setDraft(trigger)
      setMintedKey(null)
    }, [trigger])

    const cfg = draft.config ?? {}
    const selectedTopic = topics.find((tp) => tp.topic === cfg.topic)
    const triggerVars = discoverVariablesAtStep({
      steps: [],
      triggerPayloadSchema: selectedTopic?.payloadSchema,
    }).filter((v) => v.group === "trigger" || v.group === "space")

    const base = (serverUrl || "").replace(/\/$/, "")
    const webhookUrl = draft.id
      ? `${base}/api/v1/platform/workflows/triggers/${draft.id}:webhook`
      : t("workflows.mobile.webhookUnsaved")

    const handleCopy = async (text: string, title: string) => {
      await Clipboard.setStringAsync(text)
      haptics.success()
      toast.show({ title, type: "success" })
    }

    const handleMintKey = async () => {
      if (!activeSpaceId) return
      try {
        haptics.light()
        const key = await createAPIKeyMutation.mutateAsync({
          apiKey: {
            name: `${draft.name || "Webhook"} Mobile Key`,
            description: t("workflows.trigger.keyDescription"),
            scopes: ["workflows:execute"],
            spaceIds: [activeSpaceId],
          },
        })
        setMintedKey(key.rawKey ?? null)
        haptics.success()
      } catch (err) {
        haptics.error()
        toast.show({
          title:
            err instanceof Error
              ? err.message
              : t("workflows.trigger.keyCreateFailed"),
          type: "error",
        })
      }
    }

    const cronVal = cfg.cron ?? ""
    const cronOk = !cronVal || isValidCronExpression(cronVal)

    return (
      <AppBottomSheet
        ref={ref}
        title={t("workflows.mobile.configureTrigger")}
        snapPoints={["75%", "92%"]}
        onClose={onClose}
      >
        <BottomSheetScrollView contentContainerStyle={styles.body}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionLabel}>
              {t("workflows.mobile.enabled")}
            </Text>
            <Switch
              value={draft.isEnabled}
              onValueChange={(val) => {
                haptics.selection()
                setDraft({ ...draft, isEnabled: val })
              }}
              trackColor={{
                false: colors.surfaceHighlight,
                true: colors.primary,
              }}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.sectionLabel}>
              {t("workflows.trigger.name")}
            </Text>
            <BottomSheetTextInput
              style={styles.input}
              value={draft.name}
              onChangeText={(name) => setDraft({ ...draft, name })}
              placeholder={t("workflows.mobile.triggerNamePlaceholder")}
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={isDark ? "dark" : "light"}
            />
          </View>

          <View style={styles.typeRow}>
            {(["event", "webhook", "schedule", "manual"] as const).map(
              (kind) => (
                <TouchableOpacity
                  key={kind}
                  style={[
                    styles.typeChip,
                    draft.type === kind && styles.typeChipActive,
                  ]}
                  onPress={() => {
                    haptics.selection()
                    setDraft({ ...draft, type: kind })
                  }}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      draft.type === kind && styles.typeChipTextActive,
                    ]}
                  >
                    {kind.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>

          {draft.type === "event" && (
            <View style={styles.fieldGroup}>
              <Text style={styles.sectionLabel}>
                {t("workflows.trigger.topic")}
              </Text>
              <View style={styles.topicWrap}>
                {topics.map((tp) => {
                  const active = tp.topic === cfg.topic
                  return (
                    <TouchableOpacity
                      key={tp.topic}
                      style={[
                        styles.topicPill,
                        active && styles.topicPillActive,
                      ]}
                      onPress={() => {
                        haptics.selection()
                        setDraft({
                          ...draft,
                          config: { ...cfg, topic: tp.topic ?? "" },
                        })
                      }}
                    >
                      <Text
                        style={[
                          styles.topicText,
                          active && styles.topicTextActive,
                        ]}
                      >
                        {tp.topic}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              <Text style={styles.sectionLabel}>
                {t("workflows.mobile.optionalCelFilter")}
              </Text>
              <BottomSheetTextInput
                style={styles.monoInput}
                value={cfg.filter ?? ""}
                onChangeText={(filter) =>
                  setDraft({
                    ...draft,
                    config: { ...cfg, filter: filter || undefined },
                  })
                }
                placeholder="trigger.data.amount > 0"
                placeholderTextColor={colors.textMuted}
                keyboardAppearance={isDark ? "dark" : "light"}
                autoCapitalize="none"
              />
              <VariableChipPicker
                variables={triggerVars}
                currentValue={cfg.filter ?? ""}
                rawMode
                onInsert={(filter) =>
                  setDraft({ ...draft, config: { ...cfg, filter } })
                }
              />
            </View>
          )}

          {draft.type === "webhook" && (
            <View style={styles.webhookBox}>
              <Text style={styles.sectionLabel}>
                {t("workflows.trigger.labelWebhookUrl")}
              </Text>
              <Text style={styles.webhookUrl} selectable>
                {webhookUrl}
              </Text>
              <View style={styles.webhookActions}>
                {draft.id && (
                  <TouchableOpacity
                    style={styles.actionPill}
                    onPress={() =>
                      handleCopy(
                        webhookUrl,
                        t("workflows.mobile.copyWebhookUrlToast")
                      )
                    }
                  >
                    <Copy size={14} color={colors.primary} />
                    <Text style={styles.actionPillText}>
                      {t("workflows.trigger.copyUrl")}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.actionPill}
                  onPress={handleMintKey}
                >
                  <Key size={14} color={colors.accent} />
                  <Text style={styles.actionPillText}>
                    {createAPIKeyMutation.isPending
                      ? t("workflows.mobile.creatingKey")
                      : t("workflows.trigger.createApiKey")}
                  </Text>
                </TouchableOpacity>
              </View>
              {mintedKey && (
                <TouchableOpacity
                  style={styles.mintedBox}
                  onPress={() =>
                    handleCopy(mintedKey, t("workflows.mobile.copyApiKeyToast"))
                  }
                >
                  <Text style={styles.mintedHint}>
                    {t("workflows.mobile.mintKeyHint")}
                  </Text>
                  <Text style={styles.mintedKey}>{mintedKey}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {draft.type === "schedule" && (
            <View style={styles.fieldGroup}>
              <Text style={styles.sectionLabel}>
                {t("workflows.trigger.cronExpression", {
                  timezone: tz.timezone,
                })}
              </Text>
              <View style={styles.topicWrap}>
                {CRON_PRESETS.map((p) => {
                  const active = cfg.cron === p.cron
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.topicPill,
                        active && styles.topicPillActive,
                      ]}
                      onPress={() => {
                        haptics.selection()
                        setDraft({
                          ...draft,
                          config: { ...cfg, cron: p.cron },
                        })
                      }}
                    >
                      <Text
                        style={[
                          styles.topicText,
                          active && styles.topicTextActive,
                        ]}
                      >
                        {t(CRON_PRESET_LABEL_KEYS[p.id])}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
              <BottomSheetTextInput
                style={styles.monoInput}
                value={cronVal}
                onChangeText={(cron) =>
                  setDraft({ ...draft, config: { ...cfg, cron } })
                }
                placeholder="0 9 * * 1-5"
                placeholderTextColor={colors.textMuted}
                keyboardAppearance={isDark ? "dark" : "light"}
                autoCapitalize="none"
              />
              <Text
                style={[
                  styles.hintText,
                  !cronOk && { color: colors.destructive },
                ]}
              >
                {cronVal
                  ? cronOk
                    ? getLocalizedCronSummary(cronVal, tz.timezone, t)
                    : t("workflows.trigger.cronInvalid")
                  : t("workflows.trigger.cronTimezoneNote", {
                      timezone: tz.timezone,
                    })}
              </Text>
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
              <Text style={styles.deleteText}>
                {t("workflows.mobile.remove")}
              </Text>
            </TouchableOpacity>
            <Button
              onPress={() => {
                haptics.success()
                onSave(draft)
                onClose()
              }}
              style={styles.saveBtn}
            >
              {t("workflows.mobile.saveTrigger")}
            </Button>
          </View>
        </BottomSheetScrollView>
      </AppBottomSheet>
    )
  }
)

TriggerSheet.displayName = "TriggerSheet"

const createStyles = (t: SaturnMobileTheme) => ({
  body: {
    paddingHorizontal: 16,
    paddingBottom: 36,
    gap: 16,
  },
  rowBetween: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  fieldGroup: {
    gap: 8,
  },
  sectionLabel: {
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
    fontSize: 13,
    fontFamily: t.typography.mono,
    color: t.colors.textPrimary,
  },
  typeRow: {
    flexDirection: "row" as const,
    gap: 8,
  },
  typeChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: "center" as const,
  },
  typeChipActive: {
    backgroundColor: t.colors.primarySubtle,
    borderColor: t.colors.primary,
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: t.colors.textSecondary,
  },
  typeChipTextActive: {
    color: t.colors.primary,
  },
  topicWrap: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
  },
  topicPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  topicPillActive: {
    backgroundColor: t.colors.primarySubtle,
    borderColor: t.colors.primary,
  },
  topicText: {
    fontSize: 11,
    fontFamily: t.typography.mono,
    color: t.colors.textSecondary,
  },
  topicTextActive: {
    color: t.colors.primary,
    fontWeight: "700" as const,
  },
  webhookBox: {
    padding: 12,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    gap: 10,
  },
  webhookUrl: {
    fontSize: 12,
    fontFamily: t.typography.mono,
    color: t.colors.textPrimary,
  },
  webhookActions: {
    flexDirection: "row" as const,
    gap: 10,
  },
  actionPill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  actionPillText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  mintedBox: {
    padding: 10,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.warningSubtle,
    borderWidth: 1,
    borderColor: t.colors.warning,
    gap: 4,
  },
  mintedHint: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.warning,
  },
  mintedKey: {
    fontSize: 12,
    fontFamily: t.typography.mono,
    color: t.colors.textPrimary,
  },
  hintText: {
    fontSize: 12,
    color: t.colors.textMuted,
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
