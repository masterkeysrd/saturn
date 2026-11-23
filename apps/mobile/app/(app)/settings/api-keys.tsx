import React, { useMemo, useState } from "react"
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native"
import { useRouter } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  Key,
  Plus,
  Trash2,
  Pencil,
  AlertTriangle,
  Clock,
} from "lucide-react-native"
import {
  useListAPIKeysQuery,
  useDeleteAPIKeyMutation,
  type APIKey,
} from "@saturn/api/saturn/identity/v1/identity"
import { useTimezone, useI18n } from "@saturn/hooks"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { useToast } from "@/components/ui/toast"
import { haptics } from "@/lib/haptics"

export default function APIKeysScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { t } = useI18n()
  const tz = useTimezone()
  const queryClient = useQueryClient()
  const { spaces } = useSpace()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

  const [refreshing, setRefreshing] = useState(false)
  const [keyToDelete, setKeyToDelete] = useState<APIKey | null>(null)

  const { data, isLoading, refetch } = useListAPIKeysQuery({})
  const deleteMutation = useDeleteAPIKeyMutation()

  const spaceNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const sp of spaces) {
      if (sp.id) {
        map.set(sp.id, sp.name || sp.id)
      }
    }
    return map
  }, [spaces])

  const apiKeys = data?.apiKeys || []

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const handleOpenCreate = () => {
    haptics.light()
    router.push("/modal/manage-api-key")
  }

  const handleOpenEdit = (apiKey: APIKey) => {
    haptics.light()
    router.push({
      pathname: "/modal/manage-api-key",
      params: { id: apiKey.id },
    })
  }

  const handleConfirmDelete = async () => {
    if (!keyToDelete?.id) return
    try {
      await deleteMutation.mutateAsync({
        id: keyToDelete.id,
        req: { id: keyToDelete.id },
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/identity/api-keys"],
      })
      haptics.success()
      toast.show({
        type: "success",
        title: t("settings.apiKeys.revokeOk"),
        message: t("settings.apiKeys.revokeOkDesc"),
      })
    } catch (err: unknown) {
      haptics.error()
      toast.show({
        type: "error",
        title: t("settings.apiKeys.revokeFailed"),
        message:
          err instanceof Error
            ? err.message
            : t("settings.apiKeys.revokeFailedDesc"),
      })
    } finally {
      setKeyToDelete(null)
    }
  }

  return (
    <View style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 20) + 24 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <Card style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.iconCircle}>
              <Key size={20} color={colors.primary} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>
                {t("settings.apiKeys.title")}
              </Text>
              <Text style={styles.headerSubtitle}>
                {t("settings.apiKeys.mobile.headerDesc")}
              </Text>
            </View>
          </View>
          <Button
            variant="primary"
            size="md"
            leftIcon={<Plus size={16} color={colors.primaryForeground} />}
            onPress={handleOpenCreate}
          >
            {t("settings.apiKeys.btnCreate")}
          </Button>
        </Card>

        {isLoading && apiKeys.length === 0 ? (
          <SkeletonCard />
        ) : apiKeys.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Key size={28} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>
              {t("settings.apiKeys.emptyTitle")}
            </Text>
            <Text style={styles.emptySubtitle}>
              {t("settings.apiKeys.mobile.emptyDesc")}
            </Text>
          </Card>
        ) : (
          <View style={styles.list}>
            {apiKeys.map((apiKey) => {
              const grantedIds = apiKey.spaceIds || []
              return (
                <Card key={apiKey.id} style={styles.keyCard}>
                  <View style={styles.keyTopRow}>
                    <View style={styles.keyTitleBlock}>
                      <Text style={styles.keyName}>{apiKey.name}</Text>
                      <Text style={styles.keyPrefix}>
                        {apiKey.keyPrefix}...
                      </Text>
                    </View>
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => handleOpenEdit(apiKey)}
                        accessibilityLabel={t("settings.apiKeys.ariaEditKey", {
                          name: apiKey.name ?? "",
                        })}
                      >
                        <Pencil size={16} color={colors.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => {
                          haptics.warning()
                          setKeyToDelete(apiKey)
                        }}
                        accessibilityLabel={t(
                          "settings.apiKeys.ariaRevokeKey",
                          { name: apiKey.name ?? "" }
                        )}
                      >
                        <Trash2 size={16} color={colors.destructive} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {apiKey.description ? (
                    <Text style={styles.keyDescription}>
                      {apiKey.description}
                    </Text>
                  ) : null}

                  <View style={styles.badgesWrap}>
                    {grantedIds.length === 0 ? (
                      <Badge
                        variant="warning"
                        size="sm"
                        label={t("settings.apiKeys.noActiveSpaces")}
                        icon={
                          <AlertTriangle size={11} color={colors.warning} />
                        }
                      />
                    ) : (
                      grantedIds.map((sid) => (
                        <Badge
                          key={sid}
                          variant="default"
                          size="sm"
                          label={spaceNameMap.get(sid) || sid}
                        />
                      ))
                    )}
                    {(apiKey.scopes || []).map((scope) => (
                      <Badge
                        key={scope}
                        variant="primary"
                        size="sm"
                        label={scope}
                      />
                    ))}
                  </View>

                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Clock size={12} color={colors.textMuted} />
                      <Text style={styles.metaText}>
                        {t("settings.apiKeys.lastUsed")}{" "}
                        {apiKey.lastUsedAt
                          ? tz.formatDateTime(apiKey.lastUsedAt)
                          : t("settings.apiKeys.neverUsed")}
                      </Text>
                    </View>
                    <Text style={styles.metaText}>
                      {t("settings.apiKeys.expiresLabel")}{" "}
                      {apiKey.expiresAt
                        ? tz.formatDate(apiKey.expiresAt)
                        : t("settings.apiKeys.expiresNever")}
                    </Text>
                  </View>
                </Card>
              )
            })}
          </View>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={!!keyToDelete}
        title={t("settings.apiKeys.revokeDialogTitle")}
        message={`${t("settings.apiKeys.revokeDialogQ1")} "${
          keyToDelete?.name || ""
        }"${t("settings.apiKeys.revokeDialogQ2")}`}
        confirmText={t("settings.apiKeys.btnRevokeKey")}
        cancelText={t("common.cancel")}
        isDestructive
        loading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setKeyToDelete(null)}
      />
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  headerCard: {
    padding: 16,
    gap: 14,
  },
  headerRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: t.colors.primarySubtle,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: t.colors.textMuted,
    lineHeight: 18,
  },
  emptyCard: {
    padding: 28,
    alignItems: "center" as const,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: t.colors.textMuted,
    textAlign: "center" as const,
  },
  list: {
    gap: 12,
  },
  keyCard: {
    padding: 16,
    gap: 10,
  },
  keyTopRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  keyTitleBlock: {
    flex: 1,
    gap: 2,
  },
  keyName: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  keyPrefix: {
    fontSize: 12,
    fontFamily: "monospace",
    color: t.colors.textMuted,
  },
  actionRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  iconBtn: {
    padding: 8,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.surfaceElevated,
  },
  deleteBtn: {
    padding: 8,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.destructiveSubtle,
  },
  keyDescription: {
    fontSize: 13,
    color: t.colors.textSecondary,
  },
  badgesWrap: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
  },
  metaRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    justifyContent: "space-between" as const,
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  metaItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
  },
  metaText: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
})
