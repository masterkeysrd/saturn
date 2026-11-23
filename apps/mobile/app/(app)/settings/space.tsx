import React, { useState, useMemo } from "react"
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  TextInput as RNTextInput,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useQueryClient } from "@tanstack/react-query"
import {
  Layers,
  Users,
  UserPlus,
  Trash2,
  Check,
  Clock,
  Key,
  Globe,
  Search,
  X,
} from "lucide-react-native"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  SpaceDetailsSchema,
  AddMemberSchema,
  type SpaceDetailsFormValues,
  type AddMemberFormValues,
} from "@saturn/schemas"
import {
  useUpdateSpaceMutation,
  useListSpaceMembersQuery,
  useCreateSpaceMemberMutation,
  useDeleteSpaceMemberMutation,
  useUpdateSettingsMutation,
  useListSpaceAPIKeyGrantsQuery,
  useRevokeSpaceAPIKeyGrantMutation,
  type APIKeyGrant,
  type SpaceMember_Role,
} from "@saturn/api/saturn/space/v1/space"
import { useTimezone, useI18n } from "@saturn/hooks"
import { COMMON_TIMEZONES } from "@saturn/core"
import type { TranslationKey } from "@saturn/i18n"
import { useSpace } from "@/lib/space-context"
import { useAuth } from "@/lib/auth-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { Card } from "@/components/ui/card"
import { TextInput } from "@/components/ui/text-input"
import { FormPillGroup } from "@/components/ui/form-primitives"
import { Button } from "@/components/ui/button"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Caption, Title } from "@/components/ui/typography"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { haptics } from "@/lib/haptics"

const ROLE_OPTIONS: readonly {
  value: SpaceMember_Role
  labelKey: TranslationKey
}[] = [
  { value: "ADMIN", labelKey: "settings.spaces.roleAdmin" },
  { value: "MEMBER", labelKey: "settings.spaces.roleMember" },
  { value: "VIEWER", labelKey: "settings.spaces.roleViewer" },
]

const ROLE_BADGE_LABEL_KEYS: Record<string, TranslationKey> = {
  OWNER: "settings.spaces.roleOwner",
  ADMIN: "settings.spaces.roleAdmin",
  MEMBER: "settings.spaces.roleMember",
  VIEWER: "settings.spaces.roleViewer",
}

export default function SpaceSettingsScreen() {
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { t } = useI18n()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { colors, isDark } = useTheme()
  const styles = useThemedStyles(createStyles)
  const {
    activeSpace,
    activeSpaceId,
    activeSpaceRole,
    isOwner,
    canManageMembers,
    refetchSpaces,
    timezone,
  } = useSpace()

  const spaceDefaultValues: SpaceDetailsFormValues = useMemo(
    () => ({
      name: activeSpace?.name || "",
      description: activeSpace?.description || "",
    }),
    [activeSpace?.name, activeSpace?.description]
  )

  // Space Form
  const spaceForm = useForm<SpaceDetailsFormValues>({
    resolver: zodResolver(SpaceDetailsSchema),
    defaultValues: spaceDefaultValues,
    values: spaceDefaultValues,
    resetOptions: { keepDirtyValues: true },
  })

  // Timezone states
  const [timezoneModalVisible, setTimezoneModalVisible] = useState(false)
  const [timezoneSearch, setTimezoneSearch] = useState("")

  // Member invitation form
  const [inviteModalVisible, setInviteModalVisible] = useState(false)
  const memberForm = useForm<AddMemberFormValues>({
    resolver: zodResolver(AddMemberSchema),
    defaultValues: {
      userId: "",
      role: "MEMBER",
    },
  })

  // Member removal states
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null)
  const [grantToRevoke, setGrantToRevoke] = useState<APIKeyGrant | null>(null)
  const tz = useTimezone()

  // Queries & Mutations
  const {
    data: membersData,
    isLoading: isMembersLoading,
    refetch: refetchMembers,
  } = useListSpaceMembersQuery(
    {
      spaceId: activeSpaceId || "",
      pageSize: 50,
      pageToken: "",
    },
    {
      enabled: !!activeSpaceId,
    }
  )

  const updateSpaceMutation = useUpdateSpaceMutation()
  const updateSettingsMutation = useUpdateSettingsMutation()
  const createMemberMutation = useCreateSpaceMemberMutation()
  const deleteMemberMutation = useDeleteSpaceMemberMutation()
  const revokeGrantMutation = useRevokeSpaceAPIKeyGrantMutation()

  const { data: grantsData, isLoading: isGrantsLoading } =
    useListSpaceAPIKeyGrantsQuery(
      { spaceId: activeSpaceId || "" },
      { enabled: !!activeSpaceId && canManageMembers }
    )
  const apiKeyGrants = grantsData?.grants || []

  const handleSelectTimezone = async (tz: string) => {
    if (!activeSpaceId) return
    try {
      await updateSettingsMutation.mutateAsync({
        space_id: activeSpaceId,
        req: {
          spaceId: activeSpaceId,
          settings: {
            timezone: tz,
          },
          updateMask: { paths: ["timezone"] },
        },
      })
      await queryClient.invalidateQueries({
        queryKey: [`/api/v1/spaces/${activeSpaceId}/settings`],
      })
      setTimezoneModalVisible(false)
      setTimezoneSearch("")
      toast.show({
        type: "success",
        title: t("settings.spacePrefs.saveOk"),
        message: t("settings.spacePrefs.saveOkDesc", { timezone: tz }),
      })
    } catch (err: unknown) {
      toast.show({
        type: "error",
        title: t("settings.spaces.updateFailedToast"),
        message:
          err instanceof Error
            ? err.message
            : t("settings.spacePrefs.saveFailedDefault"),
      })
    }
  }

  const filteredTimezones = useMemo(() => {
    if (!timezoneSearch.trim()) return COMMON_TIMEZONES
    const q = timezoneSearch.toLowerCase()
    return COMMON_TIMEZONES.filter((tz) => tz.toLowerCase().includes(q))
  }, [timezoneSearch])

  const handleSaveSpace = async (values: SpaceDetailsFormValues) => {
    try {
      await updateSpaceMutation.mutateAsync({
        space_id: activeSpaceId || "",
        req: {
          spaceId: activeSpaceId || "",
          space: {
            id: activeSpaceId || "",
            name: values.name.trim(),
            description: values.description?.trim() || "",
          },
          updateMask: { paths: ["name", "description"] },
        },
      })
      refetchSpaces()
      spaceForm.reset(values)
      toast.show({
        type: "success",
        title: t("settings.spaces.updateOk"),
        message: t("settings.spaces.updateOkDesc"),
      })
    } catch (err: unknown) {
      toast.show({
        type: "error",
        title: t("settings.spaces.updateFailedToast"),
        message:
          err instanceof Error
            ? err.message
            : t("settings.spaces.updateDetailsFailed"),
      })
    }
  }

  const handleAddMember = async (values: AddMemberFormValues) => {
    try {
      await createMemberMutation.mutateAsync({
        space_id: activeSpaceId || "",
        req: {
          spaceId: activeSpaceId || "",
          member: {
            userId: values.userId.trim(),
            role: values.role as SpaceMember_Role,
          },
        },
      })
      refetchMembers()
      setInviteModalVisible(false)
      memberForm.reset({ userId: "", role: "MEMBER" })
      toast.show({
        type: "success",
        title: t("settings.spaces.addMemberOk"),
        message: t("settings.spaces.addMemberOkDesc"),
      })
    } catch (err: unknown) {
      toast.show({
        type: "error",
        title: t("settings.spaces.addMemberFailedToast"),
        message:
          err instanceof Error
            ? err.message
            : t("settings.spaces.addMemberFailed"),
      })
    }
  }

  const handleConfirmRemoveMember = async () => {
    if (!memberToRemove || !activeSpaceId) return
    try {
      await deleteMemberMutation.mutateAsync({
        space_id: activeSpaceId,
        user_id: memberToRemove,
        req: {
          spaceId: activeSpaceId,
          userId: memberToRemove,
        },
      })
      refetchMembers()
      toast.show({
        type: "info",
        title: t("settings.spaces.removeMemberOk"),
        message: t("settings.spaces.removeMemberOkDesc"),
      })
    } catch (err: unknown) {
      toast.show({
        type: "error",
        title: t("common.error"),
        message:
          err instanceof Error
            ? err.message
            : t("settings.spaces.removeMemberFailed"),
      })
    } finally {
      setMemberToRemove(null)
    }
  }

  const handleConfirmRevokeGrant = async () => {
    if (!grantToRevoke?.apiKeyId || !activeSpaceId) return
    try {
      await revokeGrantMutation.mutateAsync({
        space_id: activeSpaceId,
        api_key_id: grantToRevoke.apiKeyId,
        req: {
          spaceId: activeSpaceId,
          apiKeyId: grantToRevoke.apiKeyId,
        },
      })
      await queryClient.invalidateQueries({
        queryKey: [`/api/v1/spaces/${activeSpaceId}/api-keys`],
      })
      haptics.success()
      toast.show({
        type: "success",
        title: t("settings.spaceKeys.revokeOk"),
        message: t("settings.spaceKeys.revokeOkDesc", {
          name: grantToRevoke.keyName ?? "",
        }),
      })
    } catch (err: unknown) {
      haptics.error()
      toast.show({
        type: "error",
        title: t("common.error"),
        message:
          err instanceof Error
            ? err.message
            : t("settings.spaceKeys.revokeFailedDesc"),
      })
    } finally {
      setGrantToRevoke(null)
    }
  }

  const members = membersData?.members || []
  const isDirty = spaceForm.formState.isDirty

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 20) + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Workspace Profile & Editing */}
        <View style={styles.section}>
          <Caption style={styles.sectionHeader}>
            {t("settings.spaces.mobile.detailsSection").toUpperCase()}
          </Caption>
          <Card style={styles.card}>
            <TextInput
              control={spaceForm.control}
              name="name"
              label={t("settings.spaces.mobile.workspaceName")}
              editable={canManageMembers}
              leftIcon={<Layers size={18} color={colors.primary} />}
            />

            <TextInput
              control={spaceForm.control}
              name="description"
              label={t("settings.spaces.description")}
              editable={canManageMembers}
              multiline
              numberOfLines={2}
            />

            <View style={styles.metadataRow}>
              <View style={styles.metadataItem}>
                <Key size={14} color={colors.textMuted} />
                <Text style={styles.metadataText} numberOfLines={1}>
                  ID: {activeSpaceId || t("settings.spaces.mobile.none")}
                </Text>
              </View>
              <Badge
                variant={isOwner ? "primary" : "default"}
                size="sm"
                label={t(
                  ROLE_BADGE_LABEL_KEYS[activeSpaceRole] ??
                    "settings.spaces.roleMember"
                )}
              />
            </View>

            {isDirty && canManageMembers && (
              <Button
                variant="primary"
                size="md"
                loading={
                  updateSpaceMutation.isPending ||
                  spaceForm.formState.isSubmitting
                }
                leftIcon={<Check size={16} color={colors.primaryForeground} />}
                onPress={spaceForm.handleSubmit(handleSaveSpace)}
                style={{ marginTop: 8 }}
              >
                {t("settings.spaces.mobile.saveChanges")}
              </Button>
            )}
          </Card>
        </View>

        {/* Workspace Regional & Timezone Preferences */}
        <View style={styles.section}>
          <Caption style={styles.sectionHeader}>
            {t("settings.spaces.mobile.preferencesSection").toUpperCase()}
          </Caption>
          <Card style={styles.card}>
            <View style={styles.timezoneRow}>
              <View style={styles.timezoneIconCol}>
                <Clock size={20} color={colors.primary} />
              </View>
              <View style={styles.timezoneInfoCol}>
                <Text style={styles.timezoneLabel}>
                  {t("settings.spacePrefs.timezoneLabel")}
                </Text>
                <Text style={styles.timezoneValue}>{timezone}</Text>
                <Text style={styles.timezoneHelp}>
                  {t("settings.spacePrefs.timezoneDesc")}
                </Text>
              </View>
            </View>

            {canManageMembers && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Globe size={14} color={colors.textPrimary} />}
                onPress={() => {
                  haptics.light()
                  setTimezoneModalVisible(true)
                }}
                style={{ marginTop: 8 }}
              >
                {t("settings.spaces.mobile.changeTimezone")}
              </Button>
            )}
          </Card>
        </View>

        {/* Members Roster */}
        <View style={styles.section}>
          <View style={styles.membersHeaderRow}>
            <Caption style={styles.sectionHeader}>
              {t("settings.spaces.mobile.workspaceMembersCount", {
                count: members.length,
              }).toUpperCase()}
            </Caption>
            {canManageMembers && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<UserPlus size={14} color={colors.textPrimary} />}
                onPress={() => {
                  haptics.light()
                  memberForm.reset({ userId: "", role: "MEMBER" })
                  setInviteModalVisible(true)
                }}
              >
                {t("settings.spaces.mobile.addMember")}
              </Button>
            )}
          </View>

          {isMembersLoading ? (
            <SkeletonCard />
          ) : (
            <Card style={styles.membersList}>
              {members.map((m) => {
                const isCurrent = m.userId === user?.id
                const roleLabel = t(
                  ROLE_BADGE_LABEL_KEYS[m.role] ?? "settings.spaces.roleMember"
                )

                return (
                  <View key={m.userId} style={styles.memberRow}>
                    <View style={styles.memberLeft}>
                      <Avatar
                        name={
                          m.profile?.name || m.profile?.username || m.userId
                        }
                        size={38}
                      />
                      <View style={styles.memberInfo}>
                        <View style={styles.nameBadgeRow}>
                          <Text style={styles.memberName}>
                            {m.profile?.name || m.profile?.username || m.userId}
                            {isCurrent
                              ? ` ${t("settings.spaces.mobile.you")}`
                              : ""}
                          </Text>
                          <Badge
                            variant={m.role === "OWNER" ? "primary" : "default"}
                            size="sm"
                            label={roleLabel}
                          />
                        </View>
                        <Text style={styles.memberSub} numberOfLines={1}>
                          {m.userId}
                        </Text>
                      </View>
                    </View>

                    {canManageMembers && !isCurrent && m.role !== "OWNER" && (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                          haptics.medium()
                          setMemberToRemove(m.userId)
                        }}
                        style={styles.removeBtn}
                      >
                        <Trash2 size={16} color={colors.destructive} />
                      </TouchableOpacity>
                    )}
                  </View>
                )
              })}

              {members.length === 0 && (
                <View style={styles.emptyMembers}>
                  <Users size={24} color={colors.textMuted} />
                  <Text style={styles.emptyText}>
                    {t("settings.spaces.noMembers")}
                  </Text>
                </View>
              )}
            </Card>
          )}
        </View>

        {/* Active API Key Grants (Admins & Owners Only) */}
        {canManageMembers && (
          <View style={styles.section}>
            <Caption style={styles.sectionHeader}>
              {t("settings.spaces.mobile.activeApiKeyGrants", {
                count: apiKeyGrants.length,
              }).toUpperCase()}
            </Caption>
            {isGrantsLoading ? (
              <SkeletonCard />
            ) : (
              <Card style={styles.membersList}>
                {apiKeyGrants.map((grant) => (
                  <View key={grant.apiKeyId} style={styles.memberRow}>
                    <View style={styles.memberLeft}>
                      <Avatar
                        name={
                          grant.userName ||
                          grant.userEmail ||
                          grant.userId ||
                          "User"
                        }
                        size={38}
                      />
                      <View style={styles.memberInfo}>
                        <View style={styles.nameBadgeRow}>
                          <Text style={styles.memberName} numberOfLines={1}>
                            {grant.keyName}
                          </Text>
                          <Badge
                            variant="default"
                            size="sm"
                            label={grant.keyPrefix}
                          />
                        </View>
                        <Text style={styles.memberSub} numberOfLines={1}>
                          {grant.userName || grant.userId}
                          {grant.userEmail ? ` · ${grant.userEmail}` : ""}
                        </Text>
                        <Text style={styles.memberSub} numberOfLines={1}>
                          {(grant.scopes || []).join(", ")} ·{" "}
                          {grant.lastUsedAt
                            ? t("settings.spaces.mobile.usedLabel", {
                                date: tz.formatDate(grant.lastUsedAt),
                              })
                            : t("settings.apiKeys.neverUsed")}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
                        haptics.medium()
                        setGrantToRevoke(grant)
                      }}
                      style={styles.removeBtn}
                      accessibilityLabel={t(
                        "settings.spaces.mobile.revokeAccessFor",
                        {
                          name: grant.keyName ?? "",
                        }
                      )}
                    >
                      <Trash2 size={16} color={colors.destructive} />
                    </TouchableOpacity>
                  </View>
                ))}

                {apiKeyGrants.length === 0 && (
                  <View style={styles.emptyMembers}>
                    <Key size={24} color={colors.textMuted} />
                    <Text style={styles.emptyText}>
                      {t("settings.spaceKeys.emptyTitle")}
                    </Text>
                  </View>
                )}
              </Card>
            )}
          </View>
        )}

        {/* Member Invitation Modal */}
        <Modal
          visible={inviteModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setInviteModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.inviteOverlay}
          >
            <Card style={styles.inviteCard}>
              <Title style={{ marginBottom: 4 }}>
                {t("settings.spaces.mobile.addMemberTitle")}
              </Title>
              <Text style={styles.inviteSubtitle}>
                {t("settings.spaces.mobile.addMemberSubtitle")}
              </Text>

              <TextInput
                control={memberForm.control}
                name="userId"
                label={t("settings.spaces.mobile.userIdLabel")}
                placeholder="usr_..."
                autoCapitalize="none"
              />

              <View style={styles.rolePickerSection}>
                <Caption>
                  {t("settings.spaces.mobile.assignRole").toUpperCase()}
                </Caption>
                <FormPillGroup
                  control={memberForm.control}
                  name="role"
                  options={ROLE_OPTIONS.map((opt) => ({
                    value: opt.value,
                    label: t(opt.labelKey),
                  }))}
                  pillStyle={{ flex: 1 }}
                />
              </View>

              <View style={styles.inviteActions}>
                <Button
                  variant="secondary"
                  size="md"
                  style={{ flex: 1 }}
                  onPress={() => setInviteModalVisible(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  style={{ flex: 1 }}
                  loading={
                    createMemberMutation.isPending ||
                    memberForm.formState.isSubmitting
                  }
                  onPress={memberForm.handleSubmit(handleAddMember)}
                >
                  {t("settings.spaces.mobile.add")}
                </Button>
              </View>
            </Card>
          </KeyboardAvoidingView>
        </Modal>

        {/* Timezone Selection Modal */}
        <Modal
          visible={timezoneModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setTimezoneModalVisible(false)}
        >
          <View
            style={[
              styles.tzModalContainer,
              Platform.OS === "android" && {
                paddingTop: Math.max(insets.top, 20),
              },
            ]}
          >
            <View style={styles.tzModalHeader}>
              <View style={{ flex: 1 }}>
                <Title>{t("settings.spacePrefs.timezoneLabel")}</Title>
                <Text style={styles.tzModalSubtitle}>
                  {t("settings.spaces.mobile.tzModalSubtitle")}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setTimezoneModalVisible(false)}
                style={styles.closeBtn}
              >
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.tzSearchWrapper}>
              <Search size={18} color={colors.textMuted} />
              <RNTextInput
                placeholder={t("settings.spacePrefs.searchTzPlaceholder")}
                placeholderTextColor={colors.textMuted}
                keyboardAppearance={isDark ? "dark" : "light"}
                value={timezoneSearch}
                onChangeText={setTimezoneSearch}
                style={styles.tzSearchInput}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>

            <FlatList
              data={filteredTimezones}
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                const isSelected = item === timezone
                return (
                  <TouchableOpacity
                    style={[styles.tzItem, isSelected && styles.tzItemActive]}
                    onPress={() => handleSelectTimezone(item)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.tzItemText,
                        isSelected && styles.tzItemTextActive,
                      ]}
                    >
                      {item}
                    </Text>
                    {isSelected && <Check size={18} color={colors.primary} />}
                  </TouchableOpacity>
                )
              }}
              ListEmptyComponent={
                <View style={styles.emptyMembers}>
                  <Text style={styles.emptyText}>
                    {t("settings.spacePrefs.noTzMatch")}
                  </Text>
                </View>
              }
              contentContainerStyle={{ paddingBottom: 40 }}
            />
          </View>
        </Modal>

        {/* Confirm Member Removal Dialog */}
        <ConfirmDialog
          visible={!!memberToRemove}
          title={t("settings.spaces.mobile.removeMemberTitle")}
          message={t("settings.spaces.mobile.removeMemberDesc")}
          confirmText={t("settings.spaces.mobile.remove")}
          cancelText={t("common.cancel")}
          isDestructive
          loading={deleteMemberMutation.isPending}
          onConfirm={handleConfirmRemoveMember}
          onCancel={() => setMemberToRemove(null)}
        />

        {/* Confirm API Key Grant Revocation Dialog */}
        <ConfirmDialog
          visible={!!grantToRevoke}
          title={t("settings.spaceKeys.revokeTitle")}
          message={`${t("settings.spaceKeys.revokeDescQ1")} "${
            grantToRevoke?.keyName || ""
          }" ${t("settings.spaceKeys.revokeDescQ2")}`}
          confirmText={t("settings.spaceKeys.btnRevokeAccess")}
          cancelText={t("common.cancel")}
          isDestructive
          loading={revokeGrantMutation.isPending}
          onConfirm={handleConfirmRevokeGrant}
          onCancel={() => setGrantToRevoke(null)}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  content: {
    padding: 16,
    gap: 20,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    letterSpacing: 0.8,
    paddingHorizontal: 4,
  },
  card: {
    padding: 16,
    gap: 14,
  },
  metadataRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  metadataItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  metadataText: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  membersHeaderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  membersList: {
    overflow: "hidden" as const,
  },
  memberRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  memberLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  memberInfo: {
    flex: 1,
    gap: 2,
  },
  nameBadgeRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  memberName: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  memberSub: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  removeBtn: {
    padding: 8,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.destructiveSubtle,
  },
  emptyMembers: {
    padding: 24,
    alignItems: "center" as const,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: t.colors.textMuted,
  },
  inviteOverlay: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: 20,
    zIndex: 100,
  },
  inviteCard: {
    width: "100%" as const,
    maxWidth: 360,
    padding: 20,
    gap: 14,
  },
  inviteSubtitle: {
    fontSize: 13,
    color: t.colors.textMuted,
    lineHeight: 18,
  },
  rolePickerSection: {
    gap: 8,
  },
  roleButtons: {
    flexDirection: "row" as const,
    gap: 8,
  },
  roleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center" as const,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  roleBtnActive: {
    backgroundColor: t.colors.primarySubtle,
    borderColor: t.colors.primary,
  },
  roleBtnText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  roleBtnTextActive: {
    color: t.colors.primary,
  },
  inviteActions: {
    flexDirection: "row" as const,
    gap: 10,
    marginTop: 8,
  },
  timezoneRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 12,
  },
  timezoneIconCol: {
    paddingTop: 2,
  },
  timezoneInfoCol: {
    flex: 1,
    gap: 2,
  },
  timezoneLabel: {
    fontSize: 13,
    color: t.colors.textMuted,
    fontWeight: "500" as const,
  },
  timezoneValue: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  timezoneHelp: {
    fontSize: 12,
    color: t.colors.textMuted,
    lineHeight: 16,
    marginTop: 2,
  },
  tzModalContainer: {
    flex: 1,
    backgroundColor: t.colors.background,
    padding: 20,
  },
  tzModalHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-start" as const,
    marginBottom: 16,
  },
  tzModalSubtitle: {
    fontSize: 13,
    color: t.colors.textMuted,
    marginTop: 4,
  },
  closeBtn: {
    padding: 8,
  },
  tzSearchWrapper: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: t.colors.surfaceElevated,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  tzSearchInput: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: t.colors.textPrimary,
    fontSize: 14,
    paddingVertical: 10,
  },
  tzItem: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  tzItemActive: {
    backgroundColor: t.colors.primarySubtle,
  },
  tzItemText: {
    fontSize: 15,
    color: t.colors.textPrimary,
  },
  tzItemTextActive: {
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
})
