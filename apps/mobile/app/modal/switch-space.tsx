import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Layers, Check, Plus } from "lucide-react-native"
import { useListSpacesQuery } from "@saturn/api/saturn/space/v1/space"
import { useAuth } from "@/lib/auth-context"
import { theme } from "@/lib/theme"

export default function SwitchSpaceModal() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { activeSpaceId, setActiveSpace } = useAuth()
  const { data: spacesData, isLoading } = useListSpacesQuery({
    pageSize: 20,
    pageToken: "",
  })

  const handleSelectSpace = async (spaceId: string) => {
    await setActiveSpace(spaceId)
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
        Select an active workspace to view its accounts, budgets, and
        transactions.
      </Text>

      {isLoading ? (
        <ActivityIndicator
          size="small"
          color={theme.colors.primary}
          style={{ marginTop: 20 }}
        />
      ) : (
        <View style={styles.list}>
          {spacesData?.spaces?.map((space) => {
            const isSelected = (activeSpaceId || "") === space.id
            return (
              <TouchableOpacity
                key={space.id || space.name}
                style={[styles.spaceItem, isSelected && styles.spaceItemActive]}
                onPress={() => handleSelectSpace(space.id || "")}
              >
                <View style={styles.spaceLeft}>
                  <View style={styles.iconCircle}>
                    <Layers size={18} color={theme.colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.spaceName}>{space.name}</Text>
                    <Text style={styles.spaceDescription} numberOfLines={1}>
                      {space.description || "Personal Workspace"}
                    </Text>
                  </View>
                </View>
                {isSelected && <Check size={18} color={theme.colors.primary} />}
              </TouchableOpacity>
            )
          })}

          {/* Default fallback workspace if backend has no spaces yet */}
          {(!spacesData?.spaces || spacesData.spaces.length === 0) && (
            <TouchableOpacity
              style={[styles.spaceItem, styles.spaceItemActive]}
              onPress={() => handleSelectSpace("personal")}
            >
              <View style={styles.spaceLeft}>
                <View style={styles.iconCircle}>
                  <Layers size={18} color={theme.colors.primary} />
                </View>
                <View>
                  <Text style={styles.spaceName}>Personal Workspace</Text>
                  <Text style={styles.spaceDescription}>
                    Default local space
                  </Text>
                </View>
              </View>
              <Check size={18} color={theme.colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <TouchableOpacity
        style={styles.createButton}
        onPress={() => {
          // Future space creation action
          router.back()
        }}
      >
        <Plus size={18} color="#090d16" style={{ marginRight: 6 }} />
        <Text style={styles.createText}>Create New Workspace</Text>
      </TouchableOpacity>
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
  list: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  spaceName: {
    fontSize: 15,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  spaceDescription: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: theme.radius.sm,
    marginTop: 8,
  },
  createText: {
    color: theme.colors.primaryForeground,
    fontSize: 14,
    fontWeight: "600",
  },
})
