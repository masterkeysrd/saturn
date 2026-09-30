import { useState, useEffect } from "react"
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
} from "react-native"
import { KeyRound, ShieldAlert, X } from "lucide-react-native"
import { theme } from "@/lib/theme"
import { Button } from "./button"
import { TextInput } from "./text-input"
import { OTPInput } from "./otp-input"
import { haptics } from "@/lib/haptics"
import { useChangePasswordMutation } from "@saturn/api/saturn/identity/v1/identity"
import { useAuth } from "@/lib/auth-context"
import { useToast } from "./toast"

export interface ChangePasswordModalProps {
  visible: boolean
  onClose: () => void
  hasActiveMfa: boolean
}

export function ChangePasswordModal({
  visible,
  onClose,
  hasActiveMfa,
}: ChangePasswordModalProps) {
  const toast = useToast()
  const { updateSessionTokens } = useAuth()
  const changePasswordMutation = useChangePasswordMutation()

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [totpCode, setTotpCode] = useState("")
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (visible) {
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setTotpCode("")
      setRevokeOtherSessions(true)
      setError(null)
    }
  }, [visible])

  const handleClose = () => {
    if (changePasswordMutation.isPending) return
    haptics.light()
    onClose()
  }

  const handleSubmit = async () => {
    setError(null)

    if (!currentPassword) {
      setError("Please enter your current password.")
      haptics.error()
      return
    }
    if (!newPassword) {
      setError("Please enter your new password.")
      haptics.error()
      return
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.")
      haptics.error()
      return
    }
    if (newPassword === currentPassword) {
      setError("New password cannot be the same as your current password.")
      haptics.error()
      return
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.")
      haptics.error()
      return
    }
    if (hasActiveMfa && totpCode.trim().length !== 6) {
      setError("Please enter the 6-digit authenticator code.")
      haptics.error()
      return
    }

    try {
      haptics.medium()
      const res = await changePasswordMutation.mutateAsync({
        currentPassword,
        newPassword,
        totpCode: hasActiveMfa ? totpCode.trim() : "",
        revokeOtherSessions,
      })

      if (res?.accessToken) {
        await updateSessionTokens({
          accessToken: res.accessToken,
          refreshToken: res.refreshToken,
        })
      }

      haptics.success()
      toast.show({
        type: "success",
        title: "Password Changed",
        message: revokeOtherSessions
          ? "Your password was updated and other devices logged out."
          : "Your password was updated successfully.",
      })
      onClose()
    } catch (err: unknown) {
      haptics.error()
      const msg =
        err instanceof Error ? err.message : "Failed to change password"
      setError(msg)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleClose}
        />

        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <KeyRound size={22} color={theme.colors.primary} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Change Password</Text>
              <Text style={styles.subtitle}>
                Enter your current and new password.
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeButton}
              disabled={changePasswordMutation.isPending}
            >
              <X size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {error && (
              <View style={styles.errorBox}>
                <ShieldAlert size={16} color={theme.colors.destructive} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TextInput
              label="Current Password"
              placeholder="Enter current password"
              isPassword
              value={currentPassword}
              onChangeText={setCurrentPassword}
              containerStyle={styles.inputSpacing}
            />

            <TextInput
              label="New Password"
              placeholder="Enter new password (min. 8 chars)"
              isPassword
              value={newPassword}
              onChangeText={setNewPassword}
              containerStyle={styles.inputSpacing}
            />

            <TextInput
              label="Confirm New Password"
              placeholder="Confirm new password"
              isPassword
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              containerStyle={styles.inputSpacing}
            />

            {hasActiveMfa && (
              <View style={styles.mfaContainer}>
                <Text style={styles.mfaLabel}>
                  Two-Factor Verification Code
                </Text>
                <Text style={styles.mfaHelper}>
                  Enter the 6-digit code from your authenticator app.
                </Text>
                <OTPInput
                  value={totpCode}
                  onChangeText={setTotpCode}
                  length={6}
                  containerStyle={styles.otpSpacing}
                />
              </View>
            )}

            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.switchTitle}>Sign out other devices</Text>
                <Text style={styles.switchSubtitle}>
                  Revokes all active sessions on other phones and computers.
                </Text>
              </View>
              <Switch
                value={revokeOtherSessions}
                onValueChange={setRevokeOtherSessions}
                trackColor={{
                  false: theme.colors.border,
                  true: theme.colors.primary,
                }}
                thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              />
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <Button
              variant="outline"
              size="md"
              onPress={handleClose}
              disabled={changePasswordMutation.isPending}
              style={styles.actionBtn}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onPress={handleSubmit}
              loading={changePasswordMutation.isPending}
              style={styles.actionBtn}
            >
              Update Password
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  content: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    maxHeight: "90%",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.primarySubtle,
    justifyContent: "center",
    alignItems: "center",
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  closeButton: {
    padding: 6,
    borderRadius: 8,
  },
  scroll: {
    maxHeight: 460,
  },
  scrollContent: {
    padding: 16,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.25)",
    marginBottom: 14,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.destructive,
  },
  inputSpacing: {
    marginBottom: 14,
  },
  mfaContainer: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 14,
  },
  mfaLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  mfaHelper: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
    marginBottom: 10,
  },
  otpSpacing: {
    alignSelf: "center",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    gap: 12,
  },
  switchInfo: {
    flex: 1,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  switchSubtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: 10,
  },
  actionBtn: {
    flex: 1,
  },
})
