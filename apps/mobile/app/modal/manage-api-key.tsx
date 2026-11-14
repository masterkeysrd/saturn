import React, { useEffect, useState } from "react"
import {
  StyleSheet,
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
import { useTimezone } from "@saturn/hooks"
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
import { theme } from "@/lib/theme"
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

export default function ManageAPIKeyModal() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const tz = useTimezone()
  const queryClient = useQueryClient()
  const { id } = useLocalSearchParams<{ id?: string }>()
  const isEditing = Boolean(id)

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
          parsed.error.issues[0]?.message || "Please check your inputs."
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
          title: "API Key Updated",
          message: `"${parsed.data.name}" saved.`,
        })
        router.back()
      } catch (err: unknown) {
        haptics.error()
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to update API key."
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
        parsed.error.issues[0]?.message || "Please check your inputs."
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
        err instanceof Error ? err.message : "Failed to create API key."
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
      title: "Copied to Clipboard",
      message: "API key copied securely.",
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
            <AlertTriangle size={18} color={theme.colors.warning} />
            <Text style={styles.warningText}>
              Copy your API key now. For your security, it will never be shown
              again.
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
                <Check size={18} color={theme.colors.primaryForeground} />
              ) : (
                <Copy size={18} color={theme.colors.primaryForeground} />
              )
            }
            onPress={handleCopySecret}
          >
            {copied ? "Copied!" : "Copy API Key"}
          </Button>

          <Button
            variant="secondary"
            size="md"
            onPress={() => {
              haptics.light()
              router.back()
            }}
          >
            Done
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
            label="Key Name"
            placeholder="e.g. iOS Shortcut"
            value={name}
            onChangeText={setName}
            leftIcon={<Key size={18} color={theme.colors.primary} />}
          />

          <BaseTextInput
            label="Description (Optional)"
            placeholder="What will this key access?"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={2}
          />
        </Card>

        {!isEditing && (
          <View style={styles.section}>
            <Caption style={styles.sectionLabel}>EXPIRATION</Caption>
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
                        {preset.label}
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
            WORKSPACES ({selectedSpaceIds.length})
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
              PERMISSION SCOPES ({selectedScopes.length})
            </Caption>
            <TouchableOpacity onPress={toggleAllScopes}>
              <Text style={styles.selectAllText}>
                {allScopesSelected ? "Deselect All" : "Select All"}
              </Text>
            </TouchableOpacity>
          </View>

          <Card style={styles.scopesCard}>
            {API_KEY_SCOPE_GROUPS.map((group) => (
              <View key={group.id} style={styles.scopeGroup}>
                <Text style={styles.scopeGroupTitle}>{group.label}</Text>
                {group.scopes.map((meta) => {
                  const active = selectedScopes.includes(meta.scope)
                  return (
                    <TouchableOpacity
                      key={meta.scope}
                      style={[styles.scopeRow, active && styles.scopeRowActive]}
                      onPress={() => toggleScope(meta.scope)}
                    >
                      <View style={styles.scopeInfo}>
                        <Text style={styles.scopeLabel}>{meta.label}</Text>
                        <Text style={styles.scopeCode}>{meta.scope}</Text>
                      </View>
                      <View
                        style={[
                          styles.checkBox,
                          active && styles.checkBoxActive,
                        ]}
                      >
                        {active && (
                          <Check
                            size={14}
                            color={theme.colors.primaryForeground}
                          />
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
            leftIcon={<X size={18} color={theme.colors.textMuted} />}
            onPress={() => {
              haptics.light()
              router.back()
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            style={styles.saveBtn}
            loading={isPending}
            leftIcon={
              <Check size={18} color={theme.colors.primaryForeground} />
            }
            onPress={handleSave}
          >
            {isEditing ? "Save Changes" : "Create Key"}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    padding: 16,
    gap: 16,
  },
  errorBanner: {
    padding: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.destructiveSubtle,
    borderWidth: 1,
    borderColor: theme.colors.destructive,
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.destructive,
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
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  chipTextActive: {
    color: theme.colors.primary,
  },
  scopeHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.primary,
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
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  scopeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated,
  },
  scopeRowActive: {
    borderColor: theme.colors.primary,
  },
  scopeInfo: {
    flex: 1,
    gap: 2,
  },
  scopeLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  scopeCode: {
    fontSize: 11,
    fontFamily: "monospace",
    color: theme.colors.textMuted,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  actionsRow: {
    flexDirection: "row",
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
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.warningSubtle,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.warning,
    lineHeight: 18,
  },
  secretBox: {
    padding: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surfaceElevated,
  },
  secretText: {
    fontFamily: "monospace",
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
})
