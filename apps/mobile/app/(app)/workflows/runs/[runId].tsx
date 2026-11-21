import { ActivityIndicator, ScrollView, Text, View } from "react-native"
import { useLocalSearchParams } from "expo-router"
import { useI18n, useTimezone } from "@saturn/hooks"
import { useGetFlowRunQuery } from "@saturn/api/saturn/platform/workflow/v1/workflow"
import { Badge } from "@/components/ui/badge"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"

export default function WorkflowRunDetailScreen() {
  const { runId } = useLocalSearchParams<{ runId: string }>()
  const tz = useTimezone()
  const { t } = useI18n()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

  const { data: run, isLoading } = useGetFlowRunQuery(
    { id: runId ?? "" },
    { enabled: Boolean(runId) }
  )

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!run) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.emptyText}>{t("workflows.runs.notFound")}</Text>
      </View>
    )
  }

  const durationMs = run.metadata?.duration_ms
  const tokensUsed = run.metadata?.tokens_used

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerCard}>
        <View style={styles.rowBetween}>
          <Text style={styles.title}>{run.flowName || run.flowId}</Text>
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
        <Text style={styles.monoMeta}>
          {run.id} • v{run.flowVersion} • {t("workflows.runs.attempt")}{" "}
          {run.attempts}
        </Text>
        <Text style={styles.metaText}>
          {t("workflows.runs.started")}{" "}
          {run.startTime
            ? tz.format(run.startTime, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
            : "—"}
        </Text>
        <View style={styles.statsRow}>
          {durationMs !== undefined && (
            <Text style={styles.metaText}>{String(durationMs)} ms</Text>
          )}
          {tokensUsed !== undefined && Number(tokensUsed) > 0 && (
            <Text style={styles.metaText}>
              {String(tokensUsed)} {t("workflows.runs.tokens")}
            </Text>
          )}
        </View>
      </View>

      {run.error?.message && (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>
            {run.error.stepId
              ? t("workflows.mobile.stepFailedHeader", {
                  step: run.error.stepId,
                })
              : t("workflows.mobile.runError")}
          </Text>
          <Text style={styles.errorBody}>{run.error.message}</Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>
        {t("workflows.mobile.stepTrace", {
          count: run.stepRuns?.length ?? 0,
        }).toUpperCase()}
      </Text>

      {(run.stepRuns ?? []).map((sr) => {
        const srSources = sr.metadata?.sources as
          Record<string, Record<string, unknown>> | undefined
        const srDuration = sr.metadata?.duration_ms
        const srTokens = sr.metadata?.tokens_used

        return (
          <View key={sr.id || sr.executionKey} style={styles.stepCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.stepTitle}>{sr.executionKey}</Text>
              <Badge
                size="sm"
                variant={
                  sr.status === "completed"
                    ? "success"
                    : sr.status === "failed"
                      ? "destructive"
                      : "default"
                }
                label={(sr.status ?? "pending").toUpperCase()}
              />
            </View>
            <Text style={styles.monoMeta}>
              {sr.stepType}
              {srDuration !== undefined ? ` • ${String(srDuration)} ms` : ""}
              {srTokens !== undefined && Number(srTokens) > 0
                ? ` • ${String(srTokens)} ${t("workflows.runs.tokens")}`
                : ""}
            </Text>

            {srSources && Object.keys(srSources).length > 0 && (
              <View style={styles.sourcesWrap}>
                {Object.entries(srSources).map(([alias, info]) => (
                  <View key={alias} style={styles.sourcePill}>
                    <Text style={styles.sourceText}>
                      {alias}: {String(info.loader ?? "")} (
                      {info.count !== undefined
                        ? t(
                            Number(info.count) === 1
                              ? "workflows.runs.rowsOne"
                              : "workflows.runs.rowsOther",
                            { count: Number(info.count) }
                          )
                        : info.hit
                          ? t("workflows.runs.cacheHit")
                          : t("workflows.runs.cacheMiss")}
                      )
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {sr.error?.message && (
              <Text style={styles.errorBody}>{sr.error.message}</Text>
            )}

            {sr.output && (
              <Text style={styles.codeBlock}>
                {JSON.stringify(sr.output, null, 2)}
              </Text>
            )}
          </View>
        )
      })}

      {run.output && (
        <View style={styles.stepCard}>
          <Text style={styles.sectionLabel}>
            {t("workflows.runs.terminalOutput").toUpperCase()}
          </Text>
          <Text style={styles.codeBlock}>
            {JSON.stringify(run.output, null, 2)}
          </Text>
        </View>
      )}
    </ScrollView>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: t.colors.background,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  content: {
    padding: 16,
    paddingBottom: 80,
    gap: 12,
  },
  headerCard: {
    padding: 14,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    gap: 6,
  },
  rowBetween: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    flex: 1,
  },
  monoMeta: {
    fontSize: 11,
    fontFamily: t.typography.mono,
    color: t.colors.textMuted,
  },
  metaText: {
    fontSize: 12,
    color: t.colors.textSecondary,
  },
  statsRow: {
    flexDirection: "row" as const,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
    color: t.colors.textMuted,
    marginTop: 4,
  },
  stepCard: {
    padding: 14,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    gap: 8,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: "700" as const,
    fontFamily: t.typography.mono,
    color: t.colors.textPrimary,
  },
  sourcesWrap: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
  },
  sourcePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.surfaceElevated,
  },
  sourceText: {
    fontSize: 10,
    fontFamily: t.typography.mono,
    color: t.colors.textSecondary,
  },
  codeBlock: {
    fontSize: 11,
    fontFamily: t.typography.mono,
    color: t.colors.textPrimary,
    backgroundColor: t.colors.surfaceElevated,
    padding: 10,
    borderRadius: t.radius.md,
  },
  errorCard: {
    padding: 12,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.destructiveSubtle,
    borderWidth: 1,
    borderColor: t.colors.destructive,
    gap: 4,
  },
  errorTitle: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: t.colors.destructive,
  },
  errorBody: {
    fontSize: 12,
    fontFamily: t.typography.mono,
    color: t.colors.destructive,
  },
  emptyText: {
    fontSize: 14,
    color: t.colors.textMuted,
  },
})
