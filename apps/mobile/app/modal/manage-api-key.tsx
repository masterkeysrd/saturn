import React, { useEffect, useState } from "react"
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import * as Clipboard from "expo-clipboard"
import { Check, Copy, Key, AlertTriangle, X } from "lucide-react-native"
import {
  useCreateAPIKeyMutation,
  useGetAPIKeyQuery,
  useUpdateAPIKeyMutation,
} from "@saturn/api/saturn/identity/v1/identity"
import { useI18n, useTimezone } from "@saturn/hooks"
import type { TranslationKey } from "@saturn/i18n"
import {
  API_KEY_EXPIRATION_PRESETS,
  API_KEY_SCOPES,
  API_KEY_SCOPE_GROUPS,
  CreateAPIKeySchema,
  UpdateAPIKeySchema,
  type APIKeyExpirationPreset,
  type APIKeyScope,
} from "@saturn/schemas"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { Card } from "@/components/ui/card"
import { BaseTextInput } from "@/components/ui/text-input"
import { Button } from "@/components/ui/button"
import { Caption } from "@/components/ui/typography"
import { useToast } from "@/components/ui/toast"
import { haptics } from "@/lib/haptics"

function computeExpirationISO(
  preset: APIKeyExpirationPreset,
  now: Date
): string | undefined {
  const match = API_KEY_EXPIRATION_PRESETS.find((p) => p.id === preset)
  if (!match?.days) return undefined
  return new Date(
    now.getTime() + match.days * 24 * 60 * 60 * 1000
  ).toISOString()
}

const EXPIRATION_PRESET_LABEL_KEYS: Record<
  APIKeyExpirationPreset,
  TranslationKey
> = {
  "30d": "settings.apiKeys.preset30d",
  "90d": "settings.apiKeys.preset90d",
  "1y": "settings.apiKeys.preset1y",
  custom: "settings.apiKeys.presetCustom",
  none: "settings.apiKeys.presetNone",
}

const SCOPE_GROUP_LABEL_KEYS: Record<string, TranslationKey> = {
  spaces: "settings.apiKeys.groupSpaces",
  finance: "settings.apiKeys.groupFinance",
  calendar: "settings.apiKeys.groupCalendar",
  mail: "settings.apiKeys.groupMail",
  ai: "settings.apiKeys.groupAi",
  workflows: "settings.apiKeys.groupWorkflows",
}

const SCOPE_LABEL_KEYS: Record<APIKeyScope, TranslationKey> = {
  "spaces:read": "settings.apiKeys.scopeSpacesRead",
  "finance:read": "settings.apiKeys.scopeFinanceRead",
  "finance:write": "settings.apiKeys.scopeFinanceWrite",
  "calendar:read": "settings.apiKeys.scopeCalendarRead",
  "calendar:write": "settings.apiKeys.scopeCalendarWrite",
  "mail:read": "settings.apiKeys.scopeMailRead",
  "mail:write": "settings.apiKeys.scopeMailWrite",
  "ai:read": "settings.apiKeys.scopeAiRead",
  "ai:execute": "settings.apiKeys.scopeAiExecute",
  "ai:write": "settings.apiKeys.scopeAiWrite",
  "workflows:read": "settings.apiKeys.scopeWorkflowsRead",
  "workflows:execute": "settings.apiKeys.scopeWorkflowsExecute",
  "workflows:write": "settings.apiKeys.scopeWorkflowsWrite",
}

export default function ManageAPIKeyModal() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const tz = useTimezone()
  const queryClient = useQueryClient()
  const { id } = useLocalSearchParams<{ id?: string }>()
  const isEditing = Boolean(id)
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { t } = useI18n()

  const { spaces } = useSpace()
  const { data: existingKey } = useGetAPIKeyQuery(
    { id: id || "" },
    { enabled: isEditing }
  )

  const createMutation = useCreateAPIKeyMutation()
  const updateMutation = useUpdateAPIKeyMutation()

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [expirationPreset, setExpirationPreset] =
    useState<APIKeyExpirationPreset>("90d")
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([])
  const [selectedScopes, setSelectedScopes] = useState<APIKeyScope[]>([
    "spaces:read",
  ])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (existingKey && isEditing) {
      setName(existingKey.name || "")
      setDescription(existingKey.description || "")
      setSelectedSpaceIds(existingKey.spaceIds || [])
      setSelectedScopes((existingKey.scopes || []) as APIKeyScope[])
    } else if (!isEditing && spaces.length === 1 && spaces[0]?.id) {
      setSelectedSpaceIds([spaces[0].id])
    }
  }, [existingKey, isEditing, spaces])

  const toggleSpace = (spaceId: string) => {
    haptics.selection()
    setSelectedSpaceIds((prev) =>
      prev.includes(spaceId)
        ? prev.filter((item) => item !== spaceId)
        : [...prev, spaceId]
    )
  }

  const toggleScope = (scope: APIKeyScope) => {
    haptics.selection()
    setSelectedScopes((prev) =>
      prev.includes(scope)
        ? prev.filter((item) => item !== scope)
        : [...prev, scope]
    )
  }

  const allScopesSelected = API_KEY_SCOPES.every((s) =>
    selectedScopes.includes(s)
  )

  const toggleAllScopes = () => {
    haptics.selection()
    setSelectedScopes(allScopesSelected ? [] : [...API_KEY_SCOPES])
  }

  const handleSave = async () => {
    setErrorMessage(null)

    if (isEditing && id) {
      const parsed = UpdateAPIKeySchema.safeParse({
        name,
        description,
        scopes: selectedScopes,
        spaceIds: selectedSpaceIds,
      })
      if (!parsed.success) {
        setErrorMessage(
          parsed.error.issues[0]?.message ||
            t("settings.apiKeys.checkFormInputs")
        )
        return
      }
      try {
        await updateMutation.mutateAsync({
          id,
          req: {
            id,
            apiKey: {
              name: parsed.data.name,
              description: parsed.data.description || "",
              scopes: parsed.data.scopes,
              spaceIds: parsed.data.spaceIds,
            },
            updateMask: {
              paths: ["name", "description", "scopes", "space_ids"],
            },
          },
        })
        await queryClient.invalidateQueries({
          queryKey: ["/api/v1/identity/api-keys"],
        })
        haptics.success()
        toast.show({
          type: "success",
          title: t("settings.apiKeys.editOk"),
          message: t("settings.apiKeys.editOkDesc", {
            name: parsed.data.name,
          }),
        })
        router.back()
      } catch (err: unknown) {
        haptics.error()
        setErrorMessage(
          err instanceof Error
            ? err.message
            : t("settings.apiKeys.editOkFailed")
        )
      }
      return
    }

    const expiresAt = computeExpirationISO(expirationPreset, tz.now())
    const parsed = CreateAPIKeySchema.safeParse({
      name,
      description,
      scopes: selectedScopes,
      spaceIds: selectedSpaceIds,
      expiresAt,
    })
    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message || t("settings.apiKeys.checkFormInputs")
      )
      return
    }

    try {
      const created = await createMutation.mutateAsync({
        apiKey: {
          name: parsed.data.name,
          description: parsed.data.description || "",
          scopes: parsed.data.scopes,
          spaceIds: parsed.data.spaceIds,
          ...(parsed.data.expiresAt
            ? { expiresAt: parsed.data.expiresAt }
            : {}),
        },
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/identity/api-keys"],
      })
      haptics.success()
      setCreatedSecret(created.rawKey || "")
    } catch (err: unknown) {
      haptics.error()
      setErrorMessage(
        err instanceof Error ? err.message : t("settings.apiKeys.createFailed")
      )
    }
  }

  const handleCopySecret = async () => {
    if (!createdSecret) return
    await Clipboard.setStringAsync(createdSecret)
    haptics.success()
    setCopied(true)
    toast.show({
      type: "success",
      title: t("settings.apiKeys.mobile.copiedToast"),
      message: t("settings.apiKeys.mobile.copiedDesc"),
    })
  }

  if (createdSecret) {
    return (
      <ScrollView
        style={styles.keyboardAvoid}
        contentContainerStyle={[
          styles.container,
          { paddingBottom: Math.max(insets.bottom, 20) + 20 },
        ]}
      >
        <Card style={styles.revealCard}>
          <View style={styles.warningBanner}>
            <AlertTriangle size={18} color={colors.warning} />
            <Text style={styles.warningText}>
              {t("settings.apiKeys.revealDesc")}
            </Text>
          </View>

          <View style={styles.secretBox}>
            <Text style={styles.secretText} selectable>
              {createdSecret}
            </Text>
          </View>

          <Button
            variant="primary"
            size="lg"
            leftIcon={
              copied ? (
                <Check size={18} color={colors.primaryForeground} />
              ) : (
                <Copy size={18} color={colors.primaryForeground} />
              )
            }
            onPress={handleCopySecret}
          >
            {copied
              ? t("settings.apiKeys.btnCopied")
              : t("settings.apiKeys.mobile.copyKey")}
          </Button>

          <Button
            variant="secondary"
            size="md"
            onPress={() => {
              haptics.light()
              router.back()
            }}
          >
            {t("common.done")}
          </Button>
        </Card>
      </ScrollView>
    )
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: Math.max(insets.bottom, 20) + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <Card style={styles.formCard}>
          <BaseTextInput
            label={t("settings.apiKeys.name")}
            placeholder={t("settings.apiKeys.namePlaceholder")}
            value={name}
            onChangeText={setName}
            leftIcon={<Key size={18} color={colors.primary} />}
          />

          <BaseTextInput
            label={t("settings.apiKeys.descriptionOptional")}
            placeholder={t("settings.apiKeys.descPlaceholder")}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={2}
          />
        </Card>

        {!isEditing && (
          <View style={styles.section}>
            <Caption style={styles.sectionLabel}>
              {t("settings.apiKeys.expiration").toUpperCase()}
            </Caption>
            <View style={styles.chipRow}>
              {API_KEY_EXPIRATION_PRESETS.filter((p) => p.id !== "custom").map(
                (preset) => {
                  const active = expirationPreset === preset.id
                  return (
                    <TouchableOpacity
                      key={preset.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => {
                        haptics.selection()
                        setExpirationPreset(preset.id)
                      }}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {t(EXPIRATION_PRESET_LABEL_KEYS[preset.id])}
                      </Text>
                    </TouchableOpacity>
                  )
                }
              )}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Caption style={styles.sectionLabel}>
            {t("settings.apiKeys.workspaceGrants", {
              count: selectedSpaceIds.length,
            }).toUpperCase()}
          </Caption>
          <View style={styles.chipRow}>
            {spaces.map((sp) => {
              const sid = sp.id || ""
              const active = selectedSpaceIds.includes(sid)
              return (
                <TouchableOpacity
                  key={sid}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleSpace(sid)}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                  >
                    {sp.name}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.scopeHeaderRow}>
            <Caption style={styles.sectionLabel}>
              {t("settings.apiKeys.permissionScopes", {
                count: selectedScopes.length,
              }).toUpperCase()}
            </Caption>
            <TouchableOpacity onPress={toggleAllScopes}>
              <Text style={styles.selectAllText}>
                {allScopesSelected
                  ? t("settings.apiKeys.deselectAll")
                  : t("settings.apiKeys.selectAll")}
              </Text>
            </TouchableOpacity>
          </View>

          <Card style={styles.scopesCard}>
            {API_KEY_SCOPE_GROUPS.map((group) => (
              <View key={group.id} style={styles.scopeGroup}>
                <Text style={styles.scopeGroupTitle}>
                  {t(SCOPE_GROUP_LABEL_KEYS[group.id] ?? "common.unknown")}
                </Text>
                {group.scopes.map((meta) => {
                  const active = selectedScopes.includes(meta.scope)
                  return (
                    <TouchableOpacity
                      key={meta.scope}
                      style={[styles.scopeRow, active && styles.scopeRowActive]}
                      onPress={() => toggleScope(meta.scope)}
                    >
                      <View style={styles.scopeInfo}>
                        <Text style={styles.scopeLabel}>
                          {t(SCOPE_LABEL_KEYS[meta.scope])}
                        </Text>
                        <Text style={styles.scopeCode}>{meta.scope}</Text>
                      </View>
                      <View
                        style={[
                          styles.checkBox,
                          active && styles.checkBoxActive,
                        ]}
                      >
                        {active && (
                          <Check size={14} color={colors.primaryForeground} />
                        )}
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>
            ))}
          </Card>
        </View>

        <View style={styles.actionsRow}>
          <Button
            variant="secondary"
            size="lg"
            style={styles.cancelBtn}
            leftIcon={<X size={18} color={colors.textMuted} />}
            onPress={() => {
              haptics.light()
              router.back()
            }}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            size="lg"
            style={styles.saveBtn}
            loading={isPending}
            leftIcon={<Check size={18} color={colors.primaryForeground} />}
            onPress={handleSave}
          >
            {isEditing
              ? t("settings.apiKeys.btnSaveChanges")
              : t("settings.apiKeys.mobile.createKey")}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  keyboardAvoid: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  container: {
    padding: 16,
    gap: 16,
  },
  errorBanner: {
    padding: 12,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.destructiveSubtle,
    borderWidth: 1,
    borderColor: t.colors.destructive,
  },
  errorText: {
    fontSize: 13,
    color: t.colors.destructive,
  },
  formCard: {
    padding: 16,
    gap: 14,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    letterSpacing: 0.8,
    paddingHorizontal: 4,
  },
  chipRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  chipActive: {
    borderColor: t.colors.primary,
    backgroundColor: t.colors.primarySubtle,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
  },
  chipTextActive: {
    color: t.colors.primary,
  },
  scopeHeaderRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingHorizontal: 4,
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  scopesCard: {
    padding: 12,
    gap: 14,
  },
  scopeGroup: {
    gap: 8,
  },
  scopeGroupTitle: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  scopeRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    padding: 10,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surfaceElevated,
  },
  scopeRowActive: {
    borderColor: t.colors.primary,
  },
  scopeInfo: {
    flex: 1,
    gap: 2,
  },
  scopeLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  scopeCode: {
    fontSize: 11,
    fontFamily: "monospace",
    color: t.colors.textMuted,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  checkBoxActive: {
    backgroundColor: t.colors.primary,
    borderColor: t.colors.primary,
  },
  actionsRow: {
    flexDirection: "row" as const,
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
  },
  saveBtn: {
    flex: 2,
  },
  revealCard: {
    padding: 20,
    gap: 16,
  },
  warningBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    padding: 12,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.warningSubtle,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: t.colors.warning,
    lineHeight: 18,
  },
  secretBox: {
    padding: 14,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    backgroundColor: t.colors.surfaceElevated,
  },
  secretText: {
    fontFamily: "monospace",
    fontSize: 13,
    color: t.colors.textPrimary,
  },
})
