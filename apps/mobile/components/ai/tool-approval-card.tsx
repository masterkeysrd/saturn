import { useEffect } from "react"
import { Text, TouchableOpacity, View } from "react-native"
import { describeToolCall } from "@saturn/core"
import type { PendingToolApproval } from "@saturn/api/saturn/platform/ai/v1/ai"
import { ShieldAlert, Check, X } from "lucide-react-native"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

interface ToolApprovalCardProps {
  approval: PendingToolApproval
  onApprove: (toolCallId: string) => void
  onReject: (toolCallId: string) => void
}

export function ToolApprovalCard({
  approval,
  onApprove,
  onReject,
}: ToolApprovalCardProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

  useEffect(() => {
    haptics.warning()
  }, [])

  const callId = approval.toolCallId ?? ""
  const desc = describeToolCall({
    toolName: approval.toolName ?? "tool",
    mcpServerName: approval.mcpServerName,
    arguments: approval.arguments,
  })

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <ShieldAlert size={16} color={colors.warning} />
        <Text style={styles.title}>
          Confirm {desc.label} ({desc.domainLabel})
        </Text>
      </View>

      <Text style={styles.toolLine}>
        <Text style={styles.toolName}>{approval.toolName}</Text>
        {approval.mcpServerName ? (
          <Text style={styles.serverName}> via {approval.mcpServerName}</Text>
        ) : null}
        {desc.summary ? (
          <Text style={styles.serverName}> · {desc.summary}</Text>
        ) : null}
      </Text>

      {approval.arguments && Object.keys(approval.arguments).length > 0 && (
        <View style={styles.argsBox}>
          <Text style={styles.argsText}>
            {JSON.stringify(approval.arguments, null, 2)}
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.rejectBtn]}
          onPress={() => {
            haptics.light()
            onReject(callId)
          }}
          accessibilityRole="button"
          accessibilityLabel={`Reject ${approval.toolName}`}
        >
          <X size={14} color={colors.textSecondary} />
          <Text style={styles.rejectText}>Reject</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.approveBtn]}
          onPress={() => {
            haptics.success()
            onApprove(callId)
          }}
          accessibilityRole="button"
          accessibilityLabel={`Approve ${approval.toolName}`}
        >
          <Check size={14} color={colors.primaryForeground} />
          <Text style={styles.approveText}>Approve</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  card: {
    backgroundColor: t.colors.warningSubtle,
    borderWidth: 1,
    borderColor: t.colors.warning,
    borderRadius: t.radius.lg,
    padding: 12,
    gap: 8,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  toolLine: {
    fontSize: 13,
    color: t.colors.textSecondary,
  },
  toolName: {
    fontFamily: t.typography.mono,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  serverName: {
    color: t.colors.textMuted,
  },
  argsBox: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.md,
    padding: 10,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  argsText: {
    fontFamily: t.typography.mono,
    fontSize: 11,
    color: t.colors.textSecondary,
  },
  actions: {
    flexDirection: "row" as const,
    justifyContent: "flex-end" as const,
    gap: 8,
  },
  btn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: t.radius.md,
  },
  rejectBtn: {
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  rejectText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
  },
  approveBtn: {
    backgroundColor: t.colors.primary,
  },
  approveText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: t.colors.primaryForeground,
  },
})
