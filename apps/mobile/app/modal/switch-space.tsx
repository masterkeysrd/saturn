import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
} from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Check, Plus } from "lucide-react-native"
import { useSpace } from "@/lib/space-context"
import { useAuth } from "@/lib/auth-context"
import { theme } from "@/lib/theme"
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

  const handleSelectSpace = async (spaceId: string, spaceName: string) => {
    await switchSpace(spaceId)
    toast.show({
      type: "info",
      title: "Workspace Changed",
      message: `Active space: ${spaceName}`,
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
    >
      <Text style={styles.subtitle}>
        Select an active workspace to view and isolate its accounts, budgets,
        and transactions.
      </Text>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <SkeletonCard />
          <SkeletonCard style={{ marginTop: 12 }} />
        </View>
      ) : (
        <Card style={styles.list}>
          {spaces.map((space) => {
            const isSelected = (activeSpaceId || "") === space.id
            const isOwner = space.ownerId === user?.id
            return (
              <TouchableOpacity
                key={space.id || space.name}
                style={[styles.spaceItem, isSelected && styles.spaceItemActive]}
                activeOpacity={0.7}
                onPress={() =>
                  handleSelectSpace(space.id || "", space.name || "Space")
                }
              >
                <View style={styles.spaceLeft}>
                  <Avatar name={space.name || "Workspace"} size={40} />
                  <View style={styles.spaceInfo}>
                    <View style={styles.nameRow}>
                      <Text style={styles.spaceName}>{space.name}</Text>
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
                {isSelected && <Check size={20} color={theme.colors.primary} />}
              </TouchableOpacity>
            )
          })}

          {/* Default fallback workspace if backend has no spaces yet */}
          {spaces.length === 0 && (
            <TouchableOpacity
              style={[styles.spaceItem, styles.spaceItemActive]}
              activeOpacity={0.7}
              onPress={() =>
                handleSelectSpace("personal", "Personal Workspace")
              }
            >
              <View style={styles.spaceLeft}>
                <Avatar name="Personal Workspace" size={40} />
                <View style={styles.spaceInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.spaceName}>Personal Workspace</Text>
                    <Badge variant="primary" size="sm" label="Default" />
                  </View>
                  <Text style={styles.spaceDescription}>
                    Default local space
                  </Text>
                </View>
              </View>
              <Check size={20} color={theme.colors.primary} />
            </TouchableOpacity>
          )}
        </Card>
      )}

      <Button
        variant="primary"
        size="lg"
        leftIcon={<Plus size={18} color={theme.colors.primaryForeground} />}
        onPress={() => router.push("/modal/create-space")}
      >
        Create New Workspace
      </Button>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  loadingContainer: {
    gap: 12,
  },
  list: {
    overflow: "hidden",
  },
  spaceItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  spaceItemActive: {
    backgroundColor: theme.colors.surfaceHighlight,
  },
  spaceLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  spaceInfo: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  spaceName: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  spaceDescription: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
})
