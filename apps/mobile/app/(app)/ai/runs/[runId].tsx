import { ScrollView, StyleSheet, Text, View } from "react-native"
import { useLocalSearchParams } from "expo-router"
import { useGetRunQuery } from "@saturn/api/saturn/platform/ai/v1/ai"
import { useTimezone } from "@saturn/hooks"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { theme } from "@/lib/theme"

export default function MobileAIRunTraceScreen() {
  const { runId } = useLocalSearchParams<{ runId: string }>()
  const tz = useTimezone()
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: theme.typography.mono,
    color: theme.colors.textPrimary,
  },
  mono: {
    fontSize: 12,
    fontFamily: theme.typography.mono,
    color: theme.colors.textSecondary,
  },
  muted: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.destructive,
  },
})
