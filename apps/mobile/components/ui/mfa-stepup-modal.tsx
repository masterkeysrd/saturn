import { useState, useRef } from "react"
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native"
import { KeyRound } from "lucide-react-native"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { MfaStepUpSchema, type MfaStepUpFormValues } from "@saturn/schemas"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { Button } from "./button"
import { OTPInput, type OTPTextInputRef } from "./otp-input"
import { haptics } from "@/lib/haptics"

export interface MfaStepUpModalProps {
  visible: boolean
  onClose: () => void
  onConfirm: (code: string) => Promise<void> | void
  loading?: boolean
  error?: string | null
  title?: string
  subtitle?: string
  confirmText?: string
}

export function MfaStepUpModal({
  visible,
  onClose,
  onConfirm,
  loading = false,
  error = null,
  title = "MFA Verification Required",
  subtitle = "Please enter the 6-digit code from your authenticator app to authorize this device.",
  confirmText = "Verify & Enroll",
}: MfaStepUpModalProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [localError, setLocalError] = useState<string | null>(null)
  const otpInputRef = useRef<OTPTextInputRef>(null)

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MfaStepUpFormValues>({
    resolver: zodResolver(MfaStepUpSchema),
    defaultValues: {
      code: "",
    },
  })

  const handleClose = () => {
    if (loading || isSubmitting) return
    haptics.light()
    reset({ code: "" })
    setLocalError(null)
    onClose()
  }

  const onValid = async (values: MfaStepUpFormValues) => {
    setLocalError(null)
    await onConfirm(values.code.trim())
    reset({ code: "" })
  }

  if (!visible) return null

  const isPending = loading || isSubmitting
  const displayError = error || localError || errors.code?.message

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      onShow={() => {
        setTimeout(() => {
          otpInputRef.current?.focus()
        }, 150)
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleClose}
        />
        <View style={styles.modalCard}>
          <View style={styles.modalIconBox}>
            <KeyRound size={24} color={colors.primary} />
          </View>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalSubtitle}>{subtitle}</Text>

          <View style={styles.otpModalWrapper}>
            <OTPInput
              ref={otpInputRef}
              control={control}
              name="code"
              onComplete={() => {
                handleSubmit(onValid)()
              }}
              autoFocus
              disabled={isPending}
              error={Boolean(displayError)}
            />
          </View>

          {displayError && (
            <Text style={styles.modalError}>{displayError}</Text>
          )}

          <View style={styles.modalButtonRow}>
            <Button
              variant="secondary"
              size="md"
              style={styles.modalActionBtn}
              onPress={handleClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              style={styles.modalActionBtn}
              loading={isPending}
              disabled={isPending}
              onPress={handleSubmit(onValid)}
            >
              {confirmText}
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  modalOverlay: {
    flex: 1,
    backgroundColor: t.isDark ? "rgba(0, 0, 0, 0.7)" : "rgba(15, 23, 42, 0.45)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: 24,
  },
  modalCard: {
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
  modalIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: t.colors.surfaceElevated,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    textAlign: "center" as const,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 13,
    color: t.colors.textMuted,
    textAlign: "center" as const,
    lineHeight: 18,
    marginBottom: 20,
  },
  otpModalWrapper: {
    marginVertical: 8,
    alignItems: "center" as const,
  },
  modalError: {
    fontSize: 12,
    color: t.colors.destructive,
    marginTop: 8,
    textAlign: "center" as const,
  },
  modalButtonRow: {
    flexDirection: "row" as const,
    gap: 12,
    width: "100%" as const,
    marginTop: 20,
  },
  modalActionBtn: {
    flex: 1,
  },
})
