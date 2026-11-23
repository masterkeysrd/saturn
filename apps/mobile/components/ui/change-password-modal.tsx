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
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { useI18n } from "@saturn/hooks"
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
  const { colors } = useTheme()
  const { t } = useI18n()
  const styles = useThemedStyles(createStyles)
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
      setError(t("settings.password.mobile.mfaCodeRequired"))
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
        title: t("settings.password.toastOk"),
        message: values.revokeOtherSessions
          ? t("settings.password.mobile.toastOkDescAll")
          : t("settings.password.mobile.toastOkDescSimple"),
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
        err instanceof Error
          ? err.message
          : t("settings.password.failedDefault")
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
              <KeyRound size={22} color={colors.primary} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>
                {t("settings.password.btnChange")}
              </Text>
              <Text style={styles.subtitle}>
                {t("settings.password.mobile.subtitle")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeButton}
              disabled={isPending}
            >
              <X size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {error && (
              <View style={styles.errorBox}>
                <ShieldAlert size={16} color={colors.destructive} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TextInput
              control={control}
              name="currentPassword"
              label={t("settings.password.currentPassword")}
              placeholder={t("settings.password.currentPasswordPlaceholder")}
              isPassword
              containerStyle={styles.inputSpacing}
            />

            <TextInput
              control={control}
              name="newPassword"
              label={t("settings.password.newPassword")}
              placeholder={t("settings.password.newPasswordPlaceholder")}
              isPassword
              containerStyle={styles.inputSpacing}
            />

            <TextInput
              control={control}
              name="confirmPassword"
              label={t("settings.password.confirmPassword")}
              placeholder={t("settings.password.confirmPasswordPlaceholder")}
              isPassword
              containerStyle={styles.inputSpacing}
            />

            {hasActiveMfa && (
              <View style={styles.mfaContainer}>
                <Text style={styles.mfaLabel}>
                  {t("settings.password.mobile.mfaSectionLabel")}
                </Text>
                <Text style={styles.mfaHelper}>
                  {t("settings.password.mobile.mfaHelper")}
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
              label={t("settings.password.revokeLabel")}
              subtitle={t("settings.password.revokeDesc")}
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
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              size="md"
              onPress={handleSubmit(onValid)}
              loading={isPending}
              style={styles.actionBtn}
            >
              {t("settings.password.btnUpdate")}
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  overlay: {
    flex: 1,
    backgroundColor: t.isDark ? "rgba(0, 0, 0, 0.6)" : "rgba(15, 23, 42, 0.45)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  content: {
    width: "100%" as const,
    maxWidth: 440,
    backgroundColor: t.colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: t.colors.border,
    maxHeight: "90%" as const,
    overflow: "hidden" as const,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: t.colors.primarySubtle,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: t.colors.textMuted,
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
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: t.colors.destructiveSubtle,
    borderWidth: 1,
    borderColor: `${t.colors.destructive}40`,
    marginBottom: 14,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: t.colors.destructive,
  },
  inputSpacing: {
    marginBottom: 14,
  },
  mfaContainer: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: t.colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: t.colors.border,
    marginBottom: 14,
  },
  mfaLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  mfaHelper: {
    fontSize: 11,
    color: t.colors.textMuted,
    marginTop: 2,
    marginBottom: 10,
  },
  otpSpacing: {
    alignSelf: "center" as const,
  },
  switchRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: 8,
    gap: 12,
  },
  switchInfo: {
    flex: 1,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: t.colors.textPrimary,
  },
  switchSubtitle: {
    fontSize: 12,
    color: t.colors.textMuted,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row" as const,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    gap: 10,
  },
  actionBtn: {
    flex: 1,
  },
})
