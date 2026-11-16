import { useEffect } from "react"
import { StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { describeToolCall } from "@saturn/core"
import type { PendingToolApproval } from "@saturn/api/saturn/platform/ai/v1/ai"
import { ShieldAlert, Check, X } from "lucide-react-native"
import { theme } from "@/lib/theme"
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
        <ShieldAlert size={16} color={theme.colors.warning} />
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
          <X size={14} color={theme.colors.textSecondary} />
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
          <Check size={14} color={theme.colors.primaryForeground} />
          <Text style={styles.approveText}>Approve</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.warningSubtle,
    borderWidth: 1,
    borderColor: theme.colors.warning,
    borderRadius: theme.radius.lg,
    padding: 12,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  toolLine: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  toolName: {
    fontFamily: theme.typography.mono,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  serverName: {
    color: theme.colors.textMuted,
  },
  argsBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  argsText: {
    fontFamily: theme.typography.mono,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: theme.radius.md,
  },
  rejectBtn: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rejectText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  approveBtn: {
    backgroundColor: theme.colors.primary,
  },
  approveText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.primaryForeground,
  },
})
