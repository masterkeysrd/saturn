import { StyleSheet, View, Text, TouchableOpacity } from "react-native"
import { useRouter } from "expo-router"
import { Workflow, ChevronRight } from "lucide-react-native"
import { useListFlowRunsQuery } from "@saturn/api/saturn/platform/workflow/v1/workflow"
import { useI18n, useTimezone } from "@saturn/hooks"
import { useSpace } from "@/lib/space-context"
import { Card } from "@/components/ui/card"
import { Badge, type BadgeVariant } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton-loader"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import type { TranslationKey } from "@saturn/i18n"

const RUN_STATUS_BADGE_KEYS: Record<
  string,
  { variant: BadgeVariant; labelKey: TranslationKey }
> = {
  completed: { variant: "success", labelKey: "workflows.runStatus.completed" },
  failed: { variant: "destructive", labelKey: "workflows.runStatus.failed" },
  running: { variant: "primary", labelKey: "workflows.runStatus.running" },
  waiting: { variant: "warning", labelKey: "workflows.runStatus.waiting" },
  pending: { variant: "warning", labelKey: "workflows.runStatus.pending" },
  filtered: { variant: "default", labelKey: "workflows.runStatus.filtered" },
  stopped: { variant: "default", labelKey: "workflows.runStatus.stopped" },
  cancelled: { variant: "default", labelKey: "workflows.runStatus.cancelled" },
}

type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>
) => string

function getRunStatusBadge(
  t: Translate,
  status?: string
): { variant: BadgeVariant; label: string } {
  const badge = status ? RUN_STATUS_BADGE_KEYS[status] : undefined
  if (badge) return { variant: badge.variant, label: t(badge.labelKey) }
  return { variant: "default", label: status || t("common.unknown") }
}

export function WorkflowRunsWidget() {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const tz = useTimezone()
  const { t } = useI18n()

  const { data: runsData, isLoading } = useListFlowRunsQuery(
    { pageSize: 5, pageToken: "" },
    { enabled: Boolean(activeSpaceId), retry: false }
  )

  const runs = runsData?.runs ?? []
  const failedCount = runs.filter((r) => r.status === "failed").length

  const navigateToWorkflows = () => {
    haptics.light()
    router.push("/(app)/workflows" as never)
  }

  const navigateToRun = (runId?: string) => {
    haptics.light()
    if (runId) {
      router.push(`/(app)/workflows/runs/${runId}` as never)
    } else {
      router.push("/(app)/workflows" as never)
    }
  }

  if (isLoading) {
    return (
      <Card style={styles.card}>
        <View style={styles.header}>
          <Skeleton width={130} height={16} />
          <Skeleton width={60} height={20} />
        </View>
        <Skeleton width="100%" height={36} />
        <Skeleton width="100%" height={36} />
      </Card>
    )
  }

  return (
    <Card style={styles.card} testID="workflow-runs-widget">
      <TouchableOpacity
        style={styles.header}
        activeOpacity={0.7}
        onPress={navigateToWorkflows}
        testID="workflow-runs-header-btn"
      >
        <View style={styles.headerLeft}>
          <Workflow size={16} color={colors.brandSecondary} />
          <Text style={styles.headerTitle}>
            {t("dashboard.widget.workflow_runs.title")}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {failedCount > 0 && (
            <Badge
              variant="destructive"
              size="sm"
              label={`${failedCount} ${t("workflows.runsFailed")}`}
            />
          )}
          <ChevronRight size={16} color={colors.textMuted} />
        </View>
      </TouchableOpacity>

      {runs.length === 0 ? (
        <TouchableOpacity activeOpacity={0.7} onPress={navigateToWorkflows}>
          <Text style={styles.emptyText}>
            {t("dashboard.widget.workflow_runs.empty")}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.list}>
          {runs.map((run, idx) => {
            const statusInfo = getRunStatusBadge(t, run.status)
            const timestamp = run.startTime || run.createTime
            return (
              <TouchableOpacity
                key={run.id || idx}
                activeOpacity={0.7}
                onPress={() => navigateToRun(run.id)}
                style={[
                  styles.runRow,
                  idx < runs.length - 1 && styles.runRowDivider,
                ]}
                testID={`workflow-run-row-${run.id || idx}`}
              >
                <View style={styles.runInfo}>
                  <Text style={styles.runName} numberOfLines={1}>
                    {run.flowName || "Untitled Workflow"}
                  </Text>
                  {timestamp ? (
                    <Text style={styles.runTime}>
                      {tz.formatDate(timestamp, {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      · {tz.formatTime(timestamp)}
                    </Text>
                  ) : null}
                </View>
                <Badge
                  variant={statusInfo.variant}
                  size="sm"
                  label={statusInfo.label}
                />
              </TouchableOpacity>
            )
          })}
        </View>
      )}
    </Card>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  card: {
    padding: 16,
    gap: 10,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  headerLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  headerRight: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  emptyText: {
    fontSize: 13,
    color: t.colors.textSecondary,
    lineHeight: 19,
  },
  list: {
    gap: 0,
  },
  runRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 12,
    paddingVertical: 8,
  },
  runRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
  },
  runInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  runName: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  runTime: {
    fontSize: 12,
    color: t.colors.textMuted,
    fontFamily: t.typography.mono,
  },
})
