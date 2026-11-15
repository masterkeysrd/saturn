import { useState } from "react"
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native"
import { useRouter } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import { useTimezone } from "@saturn/hooks"
import {
  useListFlowsQuery,
  useListFlowRunsQuery,
  useEnableFlowMutation,
  useDisableFlowMutation,
  type Flow,
} from "@saturn/api/saturn/platform/workflow/v1/workflow"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toast"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { setPendingWorkflowDraft } from "@/components/workflows/workflow-draft-store"
import {
  Sparkles,
  Plus,
  ChevronRight,
  Zap,
  History,
  ShieldCheck,
} from "lucide-react-native"

export default function WorkflowsIndexScreen() {
  const router = useRouter()
  const tz = useTimezone()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<"flows" | "runs">("flows")

  const { data: flowsData, isLoading: flowsLoading } = useListFlowsQuery({})
  const { data: runsData, isLoading: runsLoading } = useListFlowRunsQuery({
    pageSize: 30,
    pageToken: "",
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/v1/platform/workflows"] })

  const enableMutation = useEnableFlowMutation({ onSuccess: invalidate })
  const disableMutation = useDisableFlowMutation({ onSuccess: invalidate })

  const flows = flowsData?.flows ?? []
  const runs = runsData?.runs ?? []
  const systemFlows = flows.filter((f) => f.isSystem)
  const customFlows = flows.filter((f) => !f.isSystem)

  const handleToggle = async (flow: Flow, next: boolean) => {
    if (!flow.id) return
    haptics.selection()
    try {
      if (next) {
        await enableMutation.mutateAsync({ id: flow.id, req: { id: flow.id } })
      } else {
        await disableMutation.mutateAsync({ id: flow.id, req: { id: flow.id } })
      }
    } catch (err) {
      haptics.error()
      toast.show({
        title: err instanceof Error ? err.message : "Failed to toggle workflow",
        type: "error",
      })
    }
  }

  const renderFlowRow = (flow: Flow) => (
    <TouchableOpacity
      key={flow.id ?? flow.name}
      activeOpacity={0.75}
      style={styles.flowCard}
      onPress={() => {
        haptics.light()
        router.push(`/(app)/workflows/${flow.id}` as never)
      }}
    >
      <View style={styles.flowTopRow}>
        <View style={styles.flowTitleWrap}>
          <Text style={styles.flowName} numberOfLines={1}>
            {flow.name}
          </Text>
          {flow.isSystem && (
            <Badge variant="primary" size="sm" label="Built-in" />
          )}
        </View>
        <Switch
          value={flow.isEnabled}
          onValueChange={(val) => handleToggle(flow, val)}
          trackColor={{
            false: theme.colors.surfaceHighlight,
            true: theme.colors.primary,
          }}
        />
      </View>

      {Boolean(flow.description) && (
        <Text style={styles.flowDesc} numberOfLines={2}>
          {flow.description}
        </Text>
      )}

      <View style={styles.flowMetaRow}>
        <Text style={styles.metaText}>
          {flow.triggers?.length ?? 0} triggers • {flow.steps?.length ?? 0}{" "}
          steps • {flow.stats?.totalRuns7d ?? 0} runs (7d)
        </Text>
        <ChevronRight size={16} color={theme.colors.textMuted} />
      </View>
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Top Action Buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.aiButton}
            onPress={() => {
              haptics.light()
              router.push("/modal/generate-workflow" as never)
            }}
          >
            <Sparkles size={16} color={theme.colors.primaryForeground} />
            <Text style={styles.aiButtonText}>Generate with AI</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.createButton}
            onPress={() => {
              haptics.light()
              setPendingWorkflowDraft(null)
              router.push("/(app)/workflows/new" as never)
            }}
          >
            <Plus size={16} color={theme.colors.primary} />
            <Text style={styles.createButtonText}>Create Workflow</Text>
          </TouchableOpacity>
        </View>

        {/* Segmented Control */}
        <View style={styles.segmentRow}>
          <TouchableOpacity
            style={[styles.segmentBtn, tab === "flows" && styles.segmentActive]}
            onPress={() => {
              haptics.selection()
              setTab("flows")
            }}
          >
            <Zap
              size={14}
              color={
                tab === "flows" ? theme.colors.primary : theme.colors.textMuted
              }
            />
            <Text
              style={[
                styles.segmentLabel,
                tab === "flows" && styles.segmentLabelActive,
              ]}
            >
              Workflows ({flows.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, tab === "runs" && styles.segmentActive]}
            onPress={() => {
              haptics.selection()
              setTab("runs")
            }}
          >
            <History
              size={14}
              color={
                tab === "runs" ? theme.colors.primary : theme.colors.textMuted
              }
            />
            <Text
              style={[
                styles.segmentLabel,
                tab === "runs" && styles.segmentLabelActive,
              ]}
            >
              Run History ({runs.length})
            </Text>
          </TouchableOpacity>
        </View>

        {tab === "flows" ? (
          flowsLoading ? (
            <ActivityIndicator
              size="large"
              color={theme.colors.primary}
              style={styles.loader}
            />
          ) : (
            <View style={styles.listGap}>
              <View style={styles.sectionHeaderRow}>
                <ShieldCheck size={14} color={theme.colors.primary} />
                <Text style={styles.sectionTitle}>SYSTEM WORKFLOWS</Text>
              </View>
              {systemFlows.map(renderFlowRow)}

              <Text style={styles.sectionTitle}>CUSTOM WORKFLOWS</Text>
              {customFlows.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    No custom workflows yet. Tap Generate with AI or Create
                    Workflow above.
                  </Text>
                </Card>
              ) : (
                customFlows.map(renderFlowRow)
              )}
            </View>
          )
        ) : runsLoading ? (
          <ActivityIndicator
            size="large"
            color={theme.colors.primary}
            style={styles.loader}
          />
        ) : runs.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>No workflow runs recorded yet.</Text>
          </Card>
        ) : (
          <View style={styles.listGap}>
            {runs.map((run) => (
              <TouchableOpacity
                key={run.id}
                activeOpacity={0.75}
                style={styles.flowCard}
                onPress={() => {
                  haptics.light()
                  router.push(`/(app)/workflows/runs/${run.id}` as never)
                }}
              >
                <View style={styles.flowTopRow}>
                  <Text style={styles.flowName} numberOfLines={1}>
                    {run.flowName || run.flowId}
                  </Text>
                  <Badge
                    size="sm"
                    variant={
                      run.status === "completed"
                        ? "success"
                        : run.status === "failed"
                          ? "destructive"
                          : "default"
                    }
                    label={(run.status ?? "pending").toUpperCase()}
                  />
                </View>
                <View style={styles.flowMetaRow}>
                  <Text style={styles.metaMono}>{run.id}</Text>
                  <Text style={styles.metaText}>
                    {run.createTime
                      ? tz.format(run.createTime, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 80,
    gap: 16,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  aiButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary,
  },
  aiButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.primaryForeground,
  },
  createButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primaryDark,
  },
  createButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: theme.colors.surface,
    padding: 4,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: theme.radius.md,
  },
  segmentActive: {
    backgroundColor: theme.colors.surfaceHighlight,
  },
  segmentLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  segmentLabelActive: {
    color: theme.colors.textPrimary,
  },
  loader: {
    marginTop: 40,
  },
  listGap: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  flowCard: {
    padding: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 8,
  },
  flowTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  flowTitleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  flowName: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  flowDesc: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  flowMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  metaMono: {
    fontSize: 11,
    fontFamily: theme.typography.mono,
    color: theme.colors.textMuted,
  },
  emptyCard: {
    padding: 20,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
})
