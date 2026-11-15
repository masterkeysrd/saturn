import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { useLocalSearchParams } from "expo-router"
import { useTimezone } from "@saturn/hooks"
import { useGetFlowRunQuery } from "@saturn/api/saturn/platform/workflow/v1/workflow"
import { Badge } from "@/components/ui/badge"
import { theme } from "@/lib/theme"

export default function WorkflowRunDetailScreen() {
  const { runId } = useLocalSearchParams<{ runId: string }>()
  const tz = useTimezone()

  const { data: run, isLoading } = useGetFlowRunQuery(
    { id: runId ?? "" },
    { enabled: Boolean(runId) }
  )

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  if (!run) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.emptyText}>Flow run not found.</Text>
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
          {run.id} • v{run.flowVersion} • Attempt {run.attempts}
        </Text>
        <Text style={styles.metaText}>
          Started:{" "}
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
            <Text style={styles.metaText}>{String(tokensUsed)} tokens</Text>
          )}
        </View>
      </View>

      {run.error?.message && (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>
            {run.error.stepId ? `Step ${run.error.stepId} Failed` : "Run Error"}
          </Text>
          <Text style={styles.errorBody}>{run.error.message}</Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>
        STEP TRACE ({run.stepRuns?.length ?? 0})
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
                ? ` • ${String(srTokens)} tokens`
                : ""}
            </Text>

            {srSources && Object.keys(srSources).length > 0 && (
              <View style={styles.sourcesWrap}>
                {Object.entries(srSources).map(([alias, info]) => (
                  <View key={alias} style={styles.sourcePill}>
                    <Text style={styles.sourceText}>
                      {alias}: {String(info.loader ?? "")} (
                      {info.count !== undefined
                        ? `${info.count} rows`
                        : info.hit
                          ? "hit"
                          : "miss"}
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
          <Text style={styles.sectionLabel}>TERMINAL OUTPUT</Text>
          <Text style={styles.codeBlock}>
            {JSON.stringify(run.output, null, 2)}
          </Text>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 80,
    gap: 12,
  },
  headerCard: {
    padding: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    flex: 1,
  },
  monoMeta: {
    fontSize: 11,
    fontFamily: theme.typography.mono,
    color: theme.colors.textMuted,
  },
  metaText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  stepCard: {
    padding: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 8,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: theme.typography.mono,
    color: theme.colors.textPrimary,
  },
  sourcesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  sourcePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceElevated,
  },
  sourceText: {
    fontSize: 10,
    fontFamily: theme.typography.mono,
    color: theme.colors.textSecondary,
  },
  codeBlock: {
    fontSize: 11,
    fontFamily: theme.typography.mono,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surfaceElevated,
    padding: 10,
    borderRadius: theme.radius.md,
  },
  errorCard: {
    padding: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.destructiveSubtle,
    borderWidth: 1,
    borderColor: theme.colors.destructive,
    gap: 4,
  },
  errorTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.destructive,
  },
  errorBody: {
    fontSize: 12,
    fontFamily: theme.typography.mono,
    color: theme.colors.destructive,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
})
