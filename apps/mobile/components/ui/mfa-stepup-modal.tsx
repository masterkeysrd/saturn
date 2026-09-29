import { useState, useEffect, useRef } from "react"
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  type TextInput as RNTextInput,
} from "react-native"
import { KeyRound } from "lucide-react-native"
import { theme } from "@/lib/theme"
import { Button } from "./button"
import { OTPInput } from "./otp-input"
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
  const [code, setCode] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)
  const otpInputRef = useRef<RNTextInput>(null)

  useEffect(() => {
    if (visible) {
      setCode("")
      setLocalError(null)
    }
  }, [visible])

  useEffect(() => {
    setLocalError(error)
  }, [error])

  const handleClose = () => {
    if (loading) return
    haptics.light()
    setCode("")
    setLocalError(null)
    onClose()
  }

  const handleSubmit = (overrideCode?: string) => {
    const codeToSubmit = (overrideCode ?? code).trim()
    if (codeToSubmit.length !== 6) {
      setLocalError("Please enter all 6 digits.")
      return
    }
    setLocalError(null)
    onConfirm(codeToSubmit)
  }

  if (!visible) return null

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
            <KeyRound size={24} color={theme.colors.primary} />
          </View>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalSubtitle}>{subtitle}</Text>

          <View style={styles.otpModalWrapper}>
            <OTPInput
              ref={otpInputRef}
              value={code}
              onChangeText={(val) => {
                setCode(val)
                if (localError) setLocalError(null)
              }}
              onComplete={(completedCode) => {
                handleSubmit(completedCode)
              }}
              autoFocus
              disabled={loading}
              error={Boolean(localError)}
            />
          </View>

          {localError && <Text style={styles.modalError}>{localError}</Text>}

          <View style={styles.modalButtonRow}>
            <Button
              variant="secondary"
              size="md"
              style={styles.modalActionBtn}
              onPress={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              style={styles.modalActionBtn}
              loading={loading}
              disabled={code.length !== 6 || loading}
              onPress={() => handleSubmit()}
            >
              {confirmText}
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    padding: 24,
    alignItems: "center",
    ...theme.shadows.lg,
  },
  modalIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    textAlign: "center",
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  otpModalWrapper: {
    marginVertical: 8,
    alignItems: "center",
  },
  modalError: {
    fontSize: 12,
    color: theme.colors.destructive,
    marginTop: 8,
    textAlign: "center",
  },
  modalButtonRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    marginTop: 20,
  },
  modalActionBtn: {
    flex: 1,
  },
})
