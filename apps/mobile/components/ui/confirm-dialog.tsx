import React from "react"
import { Modal, View, Text, TouchableWithoutFeedback } from "react-native"
import { AlertTriangle } from "lucide-react-native"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { Button } from "./button"
import { haptics } from "@/lib/haptics"

export interface ConfirmDialogProps {
  visible: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  isDestructive?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

  if (!visible) return null

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.dialogCard}>
              {isDestructive && (
                <View style={styles.iconCircle}>
                  <AlertTriangle size={24} color={colors.destructive} />
                </View>
              )}

              <Text style={styles.title}>{title}</Text>
              <Text style={styles.message}>{message}</Text>

              <View style={styles.buttonRow}>
                <Button
                  variant="secondary"
                  size="md"
                  style={styles.actionBtn}
                  disabled={loading}
                  onPress={() => {
                    haptics.light()
                    onCancel()
                  }}
                >
                  {cancelText}
                </Button>
                <Button
                  variant={isDestructive ? "destructive" : "primary"}
                  size="md"
                  loading={loading}
                  style={styles.actionBtn}
                  onPress={() => {
                    if (isDestructive) haptics.heavy()
                    else haptics.medium()
                    onConfirm()
                  }}
                >
                  {confirmText}
                </Button>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  overlay: {
    flex: 1,
    backgroundColor: t.isDark ? "rgba(0, 0, 0, 0.7)" : "rgba(15, 23, 42, 0.45)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: 24,
  },
  dialogCard: {
    width: "100%" as const,
    maxWidth: 360,
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    padding: 24,
    alignItems: "center" as const,
    ...t.shadows.lg,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: t.colors.destructiveSubtle,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    textAlign: "center" as const,
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: t.colors.textMuted,
    textAlign: "center" as const,
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: "row" as const,
    gap: 12,
    width: "100%" as const,
  },
  actionBtn: {
    flex: 1,
  },
})
