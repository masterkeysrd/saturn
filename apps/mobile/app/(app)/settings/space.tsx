import React, { useState, useEffect } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  Layers,
  Users,
  UserPlus,
  Trash2,
  Check,
  Shield,
  Clock,
  Key,
} from "lucide-react-native"
import {
  useUpdateSpaceMutation,
  useListSpaceMembersQuery,
  useCreateSpaceMemberMutation,
  useDeleteSpaceMemberMutation,
  type SpaceMember_Role,
} from "@saturn/api/saturn/space/v1/space"
import { useSpace } from "@/lib/space-context"
import { useAuth } from "@/lib/auth-context"
import { theme } from "@/lib/theme"
import { Card } from "@/components/ui/card"
import { TextInput } from "@/components/ui/text-input"
import { Button } from "@/components/ui/button"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Caption, Title } from "@/components/ui/typography"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { haptics } from "@/lib/haptics"

export default function SpaceSettingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { user } = useAuth()
  const { activeSpace, activeSpaceId, isOwner, canManageMembers, refetchSpaces } = useSpace()

  // Form states
  const [name, setName] = useState(activeSpace?.name || "")
  const [description, setDescription] = useState(activeSpace?.description || "")
  const [hasChanges, setHasChanges] = useState(false)

  // Member invitation states
  const [inviteModalVisible, setInviteModalVisible] = useState(false)
  const [newUserId, setNewUserId] = useState("")
  const [newRole, setNewRole] = useState<SpaceMember_Role>("MEMBER")

  // Member removal states
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null)

  useEffect(() => {
    if (activeSpace) {
      setName(activeSpace.name)
      setDescription(activeSpace.description || "")
    }
  }, [activeSpace])

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
  const createMemberMutation = useCreateSpaceMemberMutation()
  const deleteMemberMutation = useDeleteSpaceMemberMutation()

  const handleSaveSpace = async () => {
    if (!name.trim()) {
      toast.show({
        type: "error",
        title: "Validation Error",
        message: "Workspace name cannot be empty",
      })
      return
    }

    try {
      await updateSpaceMutation.mutateAsync({
        space_id: activeSpaceId || "",
        req: {
          spaceId: activeSpaceId || "",
          space: {
            id: activeSpaceId || "",
            name: name.trim(),
            description: description.trim(),
          },
          updateMask: { paths: ["name", "description"] },
        },
      })
      refetchSpaces()
      setHasChanges(false)
      toast.show({
        type: "success",
        title: "Workspace Updated",
        message: "Workspace details saved successfully",
      })
    } catch (err: unknown) {
      toast.show({
        type: "error",
        title: "Update Failed",
        message: err instanceof Error ? err.message : "Failed to update workspace",
      })
    }
  }

  const handleAddMember = async () => {
    if (!newUserId.trim()) {
      toast.show({
        type: "error",
        title: "Validation Error",
        message: "Please enter a valid user ID or username",
      })
      return
    }

    try {
      await createMemberMutation.mutateAsync({
        space_id: activeSpaceId || "",
        req: {
          spaceId: activeSpaceId || "",
          member: {
            userId: newUserId.trim(),
            role: newRole,
          },
        },
      })
      refetchMembers()
      setInviteModalVisible(false)
      setNewUserId("")
      toast.show({
        type: "success",
        title: "Member Added",
        message: `User added to workspace`,
      })
    } catch (err: unknown) {
      toast.show({
        type: "error",
        title: "Failed to Add Member",
        message: err instanceof Error ? err.message : "Could not add member",
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
        title: "Member Removed",
        message: "Member removed from workspace",
      })
    } catch (err: unknown) {
      toast.show({
        type: "error",
        title: "Error",
        message: err instanceof Error ? err.message : "Failed to remove member",
      })
    } finally {
      setMemberToRemove(null)
    }
  }

  const members = membersData?.members || []

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
          <Caption style={styles.sectionHeader}>WORKSPACE DETAILS</Caption>
          <Card style={styles.card}>
            <TextInput
              label="Workspace Name"
              value={name}
              editable={canManageMembers}
              onChangeText={(val) => {
                setName(val)
                setHasChanges(true)
              }}
              leftIcon={<Layers size={18} color={theme.colors.primary} />}
            />

            <TextInput
              label="Description"
              value={description}
              editable={canManageMembers}
              onChangeText={(val) => {
                setDescription(val)
                setHasChanges(true)
              }}
              multiline
              numberOfLines={2}
            />

            <View style={styles.metadataRow}>
              <View style={styles.metadataItem}>
                <Key size={14} color={theme.colors.textMuted} />
                <Text style={styles.metadataText} numberOfLines={1}>
                  ID: {activeSpaceId || "None"}
                </Text>
              </View>
              <Badge
                variant={isOwner ? "primary" : "default"}
                size="sm"
                label={isOwner ? "Owner" : "Member"}
              />
            </View>

            {hasChanges && canManageMembers && (
              <Button
                variant="primary"
                size="md"
                loading={updateSpaceMutation.isPending}
                leftIcon={<Check size={16} color={theme.colors.primaryForeground} />}
                onPress={handleSaveSpace}
                style={{ marginTop: 8 }}
              >
                Save Changes
              </Button>
            )}
          </Card>
        </View>

        {/* Members Roster */}
        <View style={styles.section}>
          <View style={styles.membersHeaderRow}>
            <Caption style={styles.sectionHeader}>WORKSPACE MEMBERS ({members.length})</Caption>
            {canManageMembers && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<UserPlus size={14} color={theme.colors.textPrimary} />}
                onPress={() => {
                  haptics.light()
                  setInviteModalVisible(true)
                }}
              >
                Add Member
              </Button>
            )}
          </View>

          {isMembersLoading ? (
            <SkeletonCard />
          ) : (
            <Card style={styles.membersList}>
              {members.map((m) => {
                const isCurrent = m.userId === user?.id
                const roleLabel =
                  m.role === "OWNER"
                    ? "Owner"
                    : m.role === "ADMIN"
                      ? "Admin"
                      : m.role === "VIEWER"
                        ? "Viewer"
                        : "Member"

                return (
                  <View key={m.userId} style={styles.memberRow}>
                    <View style={styles.memberLeft}>
                      <Avatar
                        name={m.profile?.name || m.profile?.username || m.userId}
                        size={38}
                      />
                      <View style={styles.memberInfo}>
                        <View style={styles.nameBadgeRow}>
                          <Text style={styles.memberName}>
                            {m.profile?.name || m.profile?.username || m.userId}
                            {isCurrent ? " (You)" : ""}
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
                        <Trash2 size={16} color={theme.colors.destructive} />
                      </TouchableOpacity>
                    )}
                  </View>
                )
              })}

              {members.length === 0 && (
                <View style={styles.emptyMembers}>
                  <Users size={24} color={theme.colors.textMuted} />
                  <Text style={styles.emptyText}>No additional members</Text>
                </View>
              )}
            </Card>
          )}
        </View>

        {/* Member Invitation Modal */}
        {inviteModalVisible && (
          <View style={styles.inviteOverlay}>
            <Card style={styles.inviteCard}>
              <Title style={{ marginBottom: 4 }}>Add Space Member</Title>
              <Text style={styles.inviteSubtitle}>
                Add a user by their unique User ID to collaborate in this workspace.
              </Text>

              <TextInput
                label="User ID"
                placeholder="usr_..."
                value={newUserId}
                onChangeText={setNewUserId}
                autoCapitalize="none"
              />

              <View style={styles.rolePickerSection}>
                <Caption>ASSIGN ROLE</Caption>
                <View style={styles.roleButtons}>
                  {(["MEMBER", "ADMIN", "VIEWER"] as SpaceMember_Role[]).map((r) => (
                    <TouchableOpacity
                      key={r}
                      activeOpacity={0.7}
                      style={[
                        styles.roleBtn,
                        newRole === r && styles.roleBtnActive,
                      ]}
                      onPress={() => setNewRole(r)}
                    >
                      <Text
                        style={[
                          styles.roleBtnText,
                          newRole === r && styles.roleBtnTextActive,
                        ]}
                      >
                        {r}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inviteActions}>
                <Button
                  variant="secondary"
                  size="md"
                  style={{ flex: 1 }}
                  onPress={() => setInviteModalVisible(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  style={{ flex: 1 }}
                  loading={createMemberMutation.isPending}
                  onPress={handleAddMember}
                >
                  Add
                </Button>
              </View>
            </Card>
          </View>
        )}

        {/* Confirm Member Removal Dialog */}
        <ConfirmDialog
          visible={!!memberToRemove}
          title="Remove Member"
          message="Are you sure you want to remove this member from the workspace? They will lose access immediately."
          confirmText="Remove"
          cancelText="Cancel"
          isDestructive
          loading={deleteMemberMutation.isPending}
          onConfirm={handleConfirmRemoveMember}
          onCancel={() => setMemberToRemove(null)}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  metadataItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  metadataText: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  membersHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  membersList: {
    overflow: "hidden",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  memberLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  memberInfo: {
    flex: 1,
    gap: 2,
  },
  nameBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  memberName: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  memberSub: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  removeBtn: {
    padding: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.destructiveSubtle,
  },
  emptyMembers: {
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  inviteOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 100,
  },
  inviteCard: {
    width: "100%",
    maxWidth: 360,
    padding: 20,
    gap: 14,
  },
  inviteSubtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
  rolePickerSection: {
    gap: 8,
  },
  roleButtons: {
    flexDirection: "row",
    gap: 8,
  },
  roleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  roleBtnActive: {
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    borderColor: theme.colors.primary,
  },
  roleBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  roleBtnTextActive: {
    color: theme.colors.primary,
  },
  inviteActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
})
