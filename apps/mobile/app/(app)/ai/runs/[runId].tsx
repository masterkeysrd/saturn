import { useState } from "react"
import { ScrollView, Text, TouchableOpacity, View } from "react-native"
import { useLocalSearchParams } from "expo-router"
import {
  useGetRunQuery,
  type RunStep,
} from "@saturn/api/saturn/platform/ai/v1/ai"
import { useI18n, useTimezone } from "@saturn/hooks"
import { ChevronDown, ChevronRight } from "lucide-react-native"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { JsonCodeBlock } from "@/components/ui/json-code-block"
import { haptics } from "@/lib/haptics"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"

function hasEntries(record?: Record<string, unknown>): boolean {
  return Boolean(record) && Object.keys(record ?? {}).length > 0
}

function StepTraceCard({ step }: { step: RunStep }) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)

  const hasInput = hasEntries(step.input)
  const hasOutput = hasEntries(step.output)
  const hasPayload = hasInput || hasOutput

  return (
    <Card style={styles.card}>
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

      {hasPayload ? (
        <View style={styles.payloadWrap}>
          <TouchableOpacity
            style={styles.payloadToggle}
            onPress={() => {
              haptics.selection()
              setExpanded((prev) => !prev)
            }}
            activeOpacity={0.75}
            accessibilityRole="button"
          >
            <Text style={styles.payloadToggleText}>
              {[
                hasInput ? t("ai.code.inputLabel") : undefined,
                hasOutput ? t("ai.code.outputLabel") : undefined,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            {expanded ? (
              <ChevronDown size={14} color={colors.textMuted} />
            ) : (
              <ChevronRight size={14} color={colors.textMuted} />
            )}
          </TouchableOpacity>

          {expanded ? (
            <View style={styles.payloadSections}>
              {hasInput ? (
                <View style={styles.payloadBlock}>
                  <Text style={styles.sectionLabel}>
                    {t("ai.code.inputLabel")}
                  </Text>
                  <JsonCodeBlock value={step.input} maxHeight={220} />
                </View>
              ) : null}
              {hasOutput ? (
                <View style={styles.payloadBlock}>
                  <Text style={styles.sectionLabel}>
                    {t("ai.code.outputLabel")}
                  </Text>
                  <JsonCodeBlock value={step.output} maxHeight={240} />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  )
}

export default function MobileAIRunTraceScreen() {
  const { runId } = useLocalSearchParams<{ runId: string }>()
  const tz = useTimezone()
  const { t } = useI18n()
  const styles = useThemedStyles(createStyles)
  const { data: run, isLoading } = useGetRunQuery(
    { id: runId ?? "" },
    { enabled: Boolean(runId) }
  )

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isLoading || !run ? (
        <Text style={styles.muted}>{t("ai.trace.loading")}</Text>
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
                {t("ai.trace.started")}{" "}
                {tz.format(run.startTime, {
                  dateStyle: "short",
                  timeStyle: "medium",
                })}
              </Text>
            ) : null}
          </Card>

          {(run.steps ?? []).map((step) => (
            <StepTraceCard key={step.id ?? step.seq} step={step} />
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
    flexShrink: 1,
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
  payloadWrap: {
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    paddingTop: 8,
    marginTop: 2,
    gap: 8,
  },
  payloadToggle: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  payloadToggleText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
  },
  payloadSections: {
    gap: 10,
  },
  payloadBlock: {
    gap: 4,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700" as const,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
    color: t.colors.textMuted,
  },
})
