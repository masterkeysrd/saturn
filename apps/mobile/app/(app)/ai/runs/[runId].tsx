import { ScrollView, Text, View } from "react-native"
import { useLocalSearchParams } from "expo-router"
import { useGetRunQuery } from "@saturn/api/saturn/platform/ai/v1/ai"
import { useTimezone } from "@saturn/hooks"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"

export default function MobileAIRunTraceScreen() {
  const { runId } = useLocalSearchParams<{ runId: string }>()
  const tz = useTimezone()
  const styles = useThemedStyles(createStyles)
  const { data: run, isLoading } = useGetRunQuery(
    { id: runId ?? "" },
    { enabled: Boolean(runId) }
  )

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isLoading || !run ? (
        <Text style={styles.muted}>Loading run trace...</Text>
      ) : (
        <>
          <Card style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.title}>{run.agentName || run.kind}</Text>
              <Badge
                variant={run.status === "failed" ? "destructive" : "default"}
                size="sm"
                label={run.status ?? "unknown"}
              />
            </View>
            <Text style={styles.mono}>
              {run.metrics?.tokens?.total ?? 0} tok ·{" "}
              {run.metrics?.latencyMs ?? 0}ms · $
              {(run.metrics?.estimatedCostUsd ?? 0).toFixed(5)}
            </Text>
            {run.startTime ? (
              <Text style={styles.muted}>
                Started:{" "}
                {tz.format(run.startTime, {
                  dateStyle: "short",
                  timeStyle: "medium",
                })}
              </Text>
            ) : null}
          </Card>

          {(run.steps ?? []).map((step) => (
            <Card key={step.id ?? step.seq} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.stepTitle}>
                  {step.seq}. {step.name}
                </Text>
                <Badge variant="outline" size="sm" label={step.kind ?? ""} />
              </View>
              <Text style={styles.mono}>
                {step.status} · {step.metrics?.durationMs ?? 0}ms
              </Text>
              {step.error?.message ? (
                <Text style={styles.errorText}>{step.error.message}</Text>
              ) : null}
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  card: {
    padding: 14,
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
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: "600" as const,
    fontFamily: t.typography.mono,
    color: t.colors.textPrimary,
  },
  mono: {
    fontSize: 12,
    fontFamily: t.typography.mono,
    color: t.colors.textSecondary,
  },
  muted: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  errorText: {
    fontSize: 12,
    color: t.colors.destructive,
  },
})
