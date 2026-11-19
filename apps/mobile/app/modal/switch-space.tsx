import { Text, View, ScrollView, TouchableOpacity } from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Check, ChevronRight, Plus, Settings, Users } from "lucide-react-native"
import { useSpace } from "@/lib/space-context"
import { useAuth } from "@/lib/auth-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { useToast } from "@/components/ui/toast"

export default function SwitchSpaceModal() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { user } = useAuth()
  const { spaces, activeSpaceId, switchSpace, isLoading } = useSpace()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

  const displayName =
    user?.name && user.name !== "User"
      ? user.name
      : user?.username || user?.email || "Saturn User"

  const handleOpenSettings = () => {
    haptics.light()
    router.back()
    setTimeout(() => {
      router.push("/(app)/settings")
    }, 50)
  }

  const handleManageWorkspaces = () => {
    haptics.light()
    router.back()
    setTimeout(() => {
      router.push("/(app)/settings/space")
    }, 50)
  }

  const handleSelectSpace = async (spaceId: string, spaceName: string) => {
    if (!spaceId) return
    if (spaceId === (activeSpaceId || "")) {
      haptics.selection()
      router.back()
      return
    }
    await switchSpace(spaceId)
    toast.show({
      type: "info",
      title: "Workspace Changed",
      message: `Active workspace: ${spaceName}`,
    })
    router.back()
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: Math.max(insets.bottom, 20) + 16 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Top Signed-In User & Settings Card */}
      <Card style={styles.accountCard}>
        <TouchableOpacity
          style={styles.accountRow}
          activeOpacity={0.7}
          onPress={handleOpenSettings}
          accessibilityRole="button"
          accessibilityLabel="Open account settings"
          testID="switch-space-account-settings"
        >
          <Avatar name={displayName} imageUri={user?.avatarUrl} size={40} />
          <View style={styles.accountInfo}>
            <Text style={styles.accountName} numberOfLines={1}>
              {displayName}
            </Text>
            {user?.email ? (
              <Text style={styles.accountEmail} numberOfLines={1}>
                {user.email}
              </Text>
            ) : null}
          </View>
          <View style={styles.accountSettingsAction}>
            <Settings size={14} color={colors.textSecondary} />
            <Text style={styles.accountSettingsText}>Settings</Text>
            <ChevronRight size={15} color={colors.textMuted} />
          </View>
        </TouchableOpacity>
      </Card>

      {/* Workspaces Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Switch Workspace</Text>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : (
          <Card style={styles.list}>
            {spaces.map((space, index) => {
              const isSelected = (activeSpaceId || "") === space.id
              const isOwner = space.ownerId === user?.id
              const hasBorder = index < spaces.length - 1
              return (
                <TouchableOpacity
                  key={space.id || space.name}
                  style={[
                    styles.spaceItem,
                    hasBorder && styles.spaceItemBorder,
                    isSelected && styles.spaceItemActive,
                  ]}
                  activeOpacity={0.7}
                  onPress={() =>
                    void handleSelectSpace(
                      space.id || "",
                      space.name || "Workspace"
                    )
                  }
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`Switch to ${space.name || "Workspace"}`}
                >
                  <View style={styles.spaceLeft}>
                    <Avatar name={space.name || "Workspace"} size={38} />
                    <View style={styles.spaceInfo}>
                      <View style={styles.nameRow}>
                        <Text style={styles.spaceName} numberOfLines={1}>
                          {space.name}
                        </Text>
                        <Badge
                          variant={isOwner ? "primary" : "default"}
                          size="sm"
                          label={isOwner ? "Owner" : "Member"}
                        />
                      </View>
                      <Text style={styles.spaceDescription} numberOfLines={1}>
                        {space.description || "Workspace"}
                      </Text>
                    </View>
                  </View>
                  {isSelected && <Check size={20} color={colors.primary} />}
                </TouchableOpacity>
              )
            })}

            {spaces.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.spaceName}>No workspaces yet</Text>
                <Text style={styles.spaceDescription}>
                  Create a workspace below to get started.
                </Text>
              </View>
            )}
          </Card>
        )}

        {spaces.length > 1 && (
          <Text style={styles.tipText}>
            Tip: Swipe up or down on the workspace avatar in the top bar, or
            long-press the Menu tab, to quick-switch.
          </Text>
        )}
      </View>

      {/* Bottom Actions */}
      <View style={styles.actions}>
        <Button
          variant="primary"
          size="lg"
          leftIcon={<Plus size={18} color={colors.primaryForeground} />}
          onPress={() => router.replace("/modal/create-space")}
        >
          Create New Workspace
        </Button>

        {Boolean(activeSpaceId) && (
          <Button
            variant="ghost"
            size="md"
            leftIcon={<Users size={16} color={colors.textSecondary} />}
            onPress={handleManageWorkspaces}
            testID="switch-space-manage-btn"
          >
            Manage Workspaces & Members
          </Button>
        )}
      </View>
    </ScrollView>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  content: {
    padding: 20,
    gap: 18,
  },
  accountCard: {
    overflow: "hidden" as const,
  },
  accountRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  accountInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  accountName: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  accountEmail: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  accountSettingsAction: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  accountSettingsText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
    paddingHorizontal: 2,
  },
  loadingContainer: {
    gap: 12,
  },
  list: {
    overflow: "hidden" as const,
  },
  spaceItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  spaceItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  spaceItemActive: {
    backgroundColor: t.colors.surfaceHighlight,
  },
  spaceLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  spaceInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  spaceName: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    flexShrink: 1,
  },
  spaceDescription: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  emptyState: {
    padding: 20,
    alignItems: "center" as const,
    gap: 4,
  },
  tipText: {
    fontSize: 12,
    color: t.colors.textMuted,
    lineHeight: 17,
    paddingHorizontal: 2,
  },
  actions: {
    gap: 8,
  },
})
