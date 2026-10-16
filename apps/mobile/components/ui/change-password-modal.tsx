import { useState } from "react"
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native"
import { KeyRound, ShieldAlert, X } from "lucide-react-native"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  ChangePasswordSchema,
  type ChangePasswordFormValues,
} from "@saturn/schemas"
import { theme } from "@/lib/theme"
import { Button } from "./button"
import { TextInput } from "./text-input"
import { OTPInput } from "./otp-input"
import { FormSwitchRow } from "./form-primitives"
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
  const [error, setError] = useState<string | null>(null)

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(ChangePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      totpCode: "",
      revokeOtherSessions: true,
    },
  })

  const handleClose = () => {
    if (changePasswordMutation.isPending || isSubmitting) return
    haptics.light()
    reset({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      totpCode: "",
      revokeOtherSessions: true,
    })
    setError(null)
    onClose()
  }

  const onValid = async (values: ChangePasswordFormValues) => {
    setError(null)

    if (
      hasActiveMfa &&
      (!values.totpCode || values.totpCode.trim().length !== 6)
    ) {
      setError("Please enter the 6-digit authenticator code.")
      haptics.error()
      return
    }

    try {
      haptics.medium()
      const res = await changePasswordMutation.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        totpCode: hasActiveMfa ? values.totpCode?.trim() || "" : "",
        revokeOtherSessions: values.revokeOtherSessions,
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
        message: values.revokeOtherSessions
          ? "Your password was updated and other devices logged out."
          : "Your password was updated successfully.",
      })
      reset({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
        totpCode: "",
        revokeOtherSessions: true,
      })
      setError(null)
      onClose()
    } catch (err: unknown) {
      haptics.error()
      const msg =
        err instanceof Error ? err.message : "Failed to change password"
      setError(msg)
    }
  }

  const isPending = changePasswordMutation.isPending || isSubmitting

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
              disabled={isPending}
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
              control={control}
              name="currentPassword"
              label="Current Password"
              placeholder="Enter current password"
              isPassword
              containerStyle={styles.inputSpacing}
            />

            <TextInput
              control={control}
              name="newPassword"
              label="New Password"
              placeholder="Enter new password (min. 8 chars)"
              isPassword
              containerStyle={styles.inputSpacing}
            />

            <TextInput
              control={control}
              name="confirmPassword"
              label="Confirm New Password"
              placeholder="Confirm new password"
              isPassword
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
                  control={control}
                  name="totpCode"
                  length={6}
                  containerStyle={styles.otpSpacing}
                />
              </View>
            )}

            <FormSwitchRow
              control={control}
              name="revokeOtherSessions"
              label="Sign out other devices"
              subtitle="Revokes all active sessions on other phones and computers."
              containerStyle={{ paddingHorizontal: 0, paddingVertical: 8 }}
            />
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <Button
              variant="outline"
              size="md"
              onPress={handleClose}
              disabled={isPending}
              style={styles.actionBtn}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onPress={handleSubmit(onValid)}
              loading={isPending}
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
