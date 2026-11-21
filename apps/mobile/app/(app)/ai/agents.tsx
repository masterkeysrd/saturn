import { ScrollView, Text, TouchableOpacity, View } from "react-native"
import { useRouter } from "expo-router"
import {
  useListAgentsQuery,
  useListRunsQuery,
} from "@saturn/api/saturn/platform/ai/v1/ai"
import { useI18n, useTimezone } from "@saturn/hooks"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Bot, ChevronRight, History } from "lucide-react-native"

export default function MobileAIAgentsScreen() {
  const router = useRouter()
  const tz = useTimezone()
  const { t } = useI18n()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { data: agentsData } = useListAgentsQuery({})
  const { data: runsData } = useListRunsQuery({ pageSize: 20, pageToken: "" })

  const agents = agentsData?.agents ?? []
  const runs = runsData?.runs ?? []

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>
        {t("ai.agentsMobile.workspaceAgents").toUpperCase()}
      </Text>
      {agents.map((ag) => (
        <Card key={ag.id} style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.rowLeft}>
              <Bot size={18} color={colors.primary} />
              <Text style={styles.cardTitle}>{ag.name}</Text>
            </View>
            {ag.isSystem && (
              <Badge
                variant="default"
                size="sm"
                label={t("ai.agents.system")}
              />
            )}
          </View>
          {ag.description ? (
            <Text style={styles.cardSub}>{ag.description}</Text>
          ) : null}
          <Text style={styles.metaMono}>
            {ag.modelDisplayName || t("ai.agents.workspaceDefaultModel")} ·{" "}
            {ag.config?.execution?.approvalPolicy || "confirm_writes"}
          </Text>
        </Card>
      ))}

      <Text style={[styles.sectionTitle, styles.sectionSpaced]}>
        {t("ai.agentsMobile.recentRuns").toUpperCase()}
      </Text>
      {runs.map((r) => (
        <TouchableOpacity
          key={r.id}
          onPress={() => {
            haptics.light()
            router.push(`/(app)/ai/runs/${r.id}` as never)
          }}
        >
          <Card style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={styles.rowLeft}>
                <History size={16} color={colors.textSecondary} />
                <Text style={styles.cardTitle}>{r.agentName || r.kind}</Text>
              </View>
              <View style={styles.rowRight}>
                <Badge
                  variant={r.status === "failed" ? "destructive" : "default"}
                  size="sm"
                  label={r.status ?? t("common.unknown")}
                />
                <ChevronRight size={14} color={colors.textMuted} />
              </View>
            </View>
            <Text style={styles.cardSub} numberOfLines={1}>
              {r.input?.prompt || r.id}
            </Text>
            <Text style={styles.metaMono}>
              {r.metrics?.tokens?.total ?? 0} tok ·{" "}
              {r.createTime
                ? tz.format(r.createTime, {
                    dateStyle: "short",
                    timeStyle: "short",
                  })
                : ""}
            </Text>
          </Card>
        </TouchableOpacity>
      ))}
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
    gap: 10,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 0.7,
    color: t.colors.textMuted,
    marginBottom: 4,
  },
  sectionSpaced: {
    marginTop: 14,
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
  rowLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    flex: 1,
  },
  rowRight: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  cardSub: {
    fontSize: 13,
    color: t.colors.textSecondary,
  },
  metaMono: {
    fontSize: 11,
    fontFamily: t.typography.mono,
    color: t.colors.textMuted,
  },
})
